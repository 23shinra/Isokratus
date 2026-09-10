import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { LANG_INT, fioPaths, normalizeBaseUrl } from "@/lib/lms/endpoints";
import { extractFio } from "@/lib/lms/normalize";
import {
  LmsHttpError,
  lmsFetchJar,
  lmsTryGet,
  sidFromSetCookie,
  warmLmsSession,
  type CookieSession,
} from "@/lib/lms/server";
import type { Lang, LoginResult } from "@/lib/lms/types";
import { findUniversityByUrl } from "@/lib/universities";
import { signAdminProof } from "@/lib/admin-proof";
import { isAdminFio, recordUsageLogin } from "@/lib/usage-store";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      baseUrl?: string;
      login?: string;
      password?: string;
      iin?: string;
      lang?: Lang;
      silent?: boolean;
    };

    if (!body.baseUrl || !body.login || !body.password) {
      return NextResponse.json(
        { error: "Укажите URL вуза, логин и пароль." },
        { status: 400 },
      );
    }

    const baseUrl = normalizeBaseUrl(body.baseUrl);
    const lang: Lang = body.lang ?? "ru";
    const clientId = randomUUID();

    // Seed JSESSIONID (and XSRF if present) before login — Spring binds the session.
    const jar: CookieSession = {
      cookies: await warmLmsSession({ baseUrl, lang, clientId }),
    };

    const payload: Record<string, unknown> = {
      login: body.login,
      password: body.password,
      language: LANG_INT[lang],
    };

    if (body.iin) {
      payload.iin = body.iin;
      payload.IIN = body.iin;
    }

    const loginRes = await lmsFetchJar(
      "rest/api/login",
      {
        baseUrl,
        method: "POST",
        body: payload,
        clientId,
        lang,
      },
      jar,
    );

    const result = loginRes.data as LoginResult;

    if (result.login_status === "invalid" || !result.auth_token) {
      return NextResponse.json(
        { error: result.message || "Неверный логин или пароль." },
        { status: 401 },
      );
    }

    let fio = "";
    let groupId: string | number | undefined;
    let groupName: string | undefined;
    const sid =
      (result.sid != null ? String(result.sid) : undefined) ||
      sidFromSetCookie(
        jar.cookies
          ? jar.cookies.split("; ").map((c) => c) // not Set-Cookie format
          : undefined,
      ) ||
      undefined;

    // Prefer body sid; also keep sid= in cookie jar for cookie-based checks
    const resolvedSid =
      (result.sid != null ? String(result.sid) : undefined) || undefined;

    if (resolvedSid) {
      jar.cookies = jar.cookies
        ? `${jar.cookies}; sid=${resolvedSid}`.replace(/; sid=[^;]*/gi, "") +
          `; sid=${resolvedSid}`
        : `sid=${resolvedSid}`;
      // normalize duplicate sid
      const parts = Object.fromEntries(
        jar.cookies.split("; ").map((p) => {
          const i = p.indexOf("=");
          return i > 0 ? [p.slice(0, i), p.slice(i + 1)] : [p, ""];
        }),
      );
      if (resolvedSid) parts.sid = resolvedSid;
      jar.cookies = Object.entries(parts)
        .filter(([k]) => k)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    }

    const uid = result.uid != null ? String(result.uid) : undefined;
    const auth = {
      baseUrl,
      token: result.auth_token,
      sid: resolvedSid,
      uid,
      clientId,
      lang,
      cookies: jar.cookies,
    };

    try {
      const fioRes = await lmsTryGet(fioPaths(lang), {
        ...auth,
        failMessage: "fio",
      });
      if (fioRes.cookies) jar.cookies = fioRes.cookies;
      fio = extractFio(fioRes.data);
      if (fioRes.data && typeof fioRes.data === "object") {
        const row = fioRes.data as Record<string, unknown>;
        const gid = row.groupID ?? row.groupId ?? row.group_id ?? row.studentGroupID;
        if (gid != null && String(gid).trim() !== "") groupId = gid as string | number;
        if (typeof row.groupName === "string") groupName = row.groupName;
      }
    } catch {
      // optional
    }

    if (!groupId || !fio) {
      try {
        const info = await lmsFetchJar(
          `rest/mobile/personInfo/${lang}`,
          auth,
          jar,
        );
        if (info.data && typeof info.data === "object") {
          const row = info.data as Record<string, unknown>;
          if (!fio) fio = extractFio(row);
          const gid = row.groupID ?? row.groupId ?? row.group_id ?? row.studentGroupID;
          if (gid != null && String(gid).trim() !== "") groupId = gid as string | number;
          if (typeof row.groupName === "string") groupName = row.groupName;
        }
      } catch {
        // optional
      }
    }

    // Resolve personID if login body omitted it
    let personID = result.personID;
    if (personID == null || String(personID) === "" || String(personID) === "0") {
      try {
        const pid = await lmsFetchJar("rest/api/person/personID", auth, jar);
        if (typeof pid.data === "number" || typeof pid.data === "string") {
          personID = pid.data;
        } else if (pid.data && typeof pid.data === "object") {
          const row = pid.data as Record<string, unknown>;
          const v = row.personID ?? row.personId ?? row.id;
          if (v != null) personID = v as string | number;
        }
      } catch {
        // optional
      }
    }

    // Track unique students for admin dashboard (no passwords stored)
    void recordUsageLogin({
      baseUrl,
      login: body.login,
      fio,
      universityName: findUniversityByUrl(baseUrl)?.name,
      personId: personID,
      silent: Boolean(body.silent),
    }).catch(() => undefined);

    const adminProof =
      personID != null && isAdminFio(fio)
        ? signAdminProof(baseUrl, personID)
        : undefined;

    return NextResponse.json({
      ...result,
      personID,
      sid: resolvedSid,
      uid,
      clientId,
      baseUrl,
      fio,
      groupId,
      groupName,
      cookies: jar.cookies || undefined,
      ...(adminProof ? { adminProof } : {}),
    });
  } catch (err) {
    if (err instanceof LmsHttpError) {
      return NextResponse.json(
        {
          error: "Не удалось войти. Проверьте URL и данные.",
          detail: typeof err.body === "string" ? err.body : JSON.stringify(err.body),
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ошибка входа" },
      { status: 502 },
    );
  }
}
