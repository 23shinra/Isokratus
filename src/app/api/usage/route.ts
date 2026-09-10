import { NextRequest, NextResponse } from "next/server";
import { verifyAdminProof } from "@/lib/admin-proof";
import { fioPaths } from "@/lib/lms/endpoints";
import { extractFio } from "@/lib/lms/normalize";
import { readProxyContext } from "@/lib/lms/route-helpers";
import { lmsTryGet } from "@/lib/lms/server";
import {
  isAdminFio,
  isRememberedAdmin,
  listUsageUsers,
  rememberAdmin,
} from "@/lib/usage-store";

export const runtime = "nodejs";

function extractPersonId(data: unknown): string | null {
  if (typeof data === "number" || typeof data === "string") {
    const s = String(data).trim();
    return s && s !== "0" ? s : null;
  }
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const v = row.personID ?? row.personId ?? row.id;
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== "0" ? s : null;
}

/** Admin-only usage stats. */
export async function GET(req: NextRequest) {
  try {
    const ctx = readProxyContext(req);
    if (ctx instanceof NextResponse) return ctx;

    const proof = req.headers.get("x-sokratus-admin")?.trim();
    const headerPersonId = req.headers.get("x-iso-person")?.trim() || null;

    // Fast path: HMAC proof issued at login (no LMS round-trip).
    if (proof && headerPersonId && verifyAdminProof(proof, ctx.baseUrl, headerPersonId)) {
      const data = await listUsageUsers();
      return NextResponse.json(data);
    }

    // Soft path: known admin personId + live session token present.
    // Seeded after first admin login; avoids brittle FIO re-fetch.
    if (
      headerPersonId &&
      ctx.token &&
      (await isRememberedAdmin(ctx.baseUrl, headerPersonId))
    ) {
      const data = await listUsageUsers();
      return NextResponse.json(data);
    }

    // Hard path: resolve identity via LMS.
    let cookies = ctx.cookies;
    let fio = "";
    let personId: string | null = null;

    try {
      const pidRes = await lmsTryGet(
        [
          "rest/api/person/personID",
          `rest/mobile/personInfo/${ctx.lang}`,
          "rest/mobile/personInfo/ru",
        ],
        {
          ...ctx,
          cookies,
          failMessage: "person",
          cacheKey: "personId",
          timeoutMs: 7_000,
          maxAttempts: 3,
        },
      );
      cookies = pidRes.cookies || cookies;
      personId = extractPersonId(pidRes.data);
      fio = extractFio(pidRes.data);
    } catch (err) {
      console.error("[usage] person resolve failed", err);
    }

    if (!fio) {
      try {
        const fioRes = await lmsTryGet(fioPaths(ctx.lang), {
          ...ctx,
          cookies,
          failMessage: "fio",
          cacheKey: "fio",
          timeoutMs: 7_000,
          maxAttempts: 3,
        });
        fio = extractFio(fioRes.data);
        personId = personId || extractPersonId(fioRes.data);
      } catch (err) {
        console.error("[usage] fio failed", err);
      }
    }

    const allowed =
      isAdminFio(fio) ||
      (personId != null && (await isRememberedAdmin(ctx.baseUrl, personId)));

    if (!allowed) {
      return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
    }

    if (isAdminFio(fio) && personId) {
      void rememberAdmin({
        baseUrl: ctx.baseUrl,
        personId,
        fio,
      }).catch(() => undefined);
    }

    const data = await listUsageUsers();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[usage]", err);
    return NextResponse.json(
      { error: "Не удалось загрузить статистику" },
      { status: 502 },
    );
  }
}
