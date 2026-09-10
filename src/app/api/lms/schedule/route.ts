import { NextRequest, NextResponse } from "next/server";
import {
  scheduleGroupPaths,
  schedulePaths,
  schedulePostBodies,
  schedulePostPaths,
  userScheduleCalculatePaths,
  userScheduleDataPaths,
  userScheduleInitialPaths,
  userScheduleParams,
  yearCandidates,
} from "@/lib/lms/endpoints";
import { normalizeSchedule, normalizeUserSchedule } from "@/lib/lms/normalize";
import { errorResponse, readProxyContext } from "@/lib/lms/route-helpers";
import {
  LmsHttpError,
  lmsFetchJar,
  lmsTryGet,
  lmsTryPost,
  warmLmsSession,
  type CookieSession,
} from "@/lib/lms/server";
import type { Lang } from "@/lib/lms/types";
import { touchUsagePerson } from "@/lib/usage-store";
import { findUniversityByUrl } from "@/lib/universities";

/** Hard budget for the whole schedule proxy — never hang the student UI. */
const BUDGET_MS = 16_000;
const REQ_TIMEOUT_MS = 4_000;

type ProxyCtx = {
  baseUrl: string;
  token: string;
  lang: Lang;
  personId?: string;
  sid?: string;
  uid?: string;
  clientId?: string;
  groupId?: string;
  cookies?: string;
};

function trackSession(ctx: ProxyCtx) {
  if (!ctx.personId) return;
  void touchUsagePerson({
    baseUrl: ctx.baseUrl,
    personId: ctx.personId,
    universityName: findUniversityByUrl(ctx.baseUrl)?.name,
  }).catch(() => undefined);
}

type ScheduleHit = {
  data: unknown;
  path: string;
  used: Record<string, unknown>;
};

function asRecord(data: unknown): Record<string, unknown> | null {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function pickStudentId(data: unknown, fallback: string): string {
  const row = asRecord(data);
  if (!row) return fallback;
  const id = row.studentID ?? row.studentId ?? row.personID ?? row.personId;
  if (id !== undefined && id !== null && String(id) !== "" && String(id) !== "0") {
    return String(id);
  }
  return fallback;
}

function withCookies(
  ctx: ProxyCtx,
  jar: CookieSession,
): ProxyCtx & { cookies?: string; timeoutMs: number } {
  return { ...ctx, cookies: jar.cookies || ctx.cookies, timeoutMs: REQ_TIMEOUT_MS };
}

function deadlineLeft(startedAt: number): number {
  return BUDGET_MS - (Date.now() - startedAt);
}

function outOfBudget(startedAt: number): boolean {
  return deadlineLeft(startedAt) < 800;
}

/**
 * LMS /v7 flow — short timeouts, few attempts.
 * Prefer personId, then "0". Prefer string lang path only.
 */
async function fetchUserScheduleV6(
  ctx: ProxyCtx,
  year: string,
  term: string,
  week: string,
  tried: string[],
  jar: CookieSession,
  startedAt: number,
): Promise<ScheduleHit | null> {
  const studentIds = Array.from(
    new Set(
      [ctx.personId, "0"].filter((x): x is string => Boolean(x && String(x).trim())),
    ),
  );

  try {
    if (!outOfBudget(startedAt)) {
      tried.push("warm:person/personID");
      await lmsFetchJar(
        "rest/api/person/personID",
        withCookies(ctx, jar),
        jar,
      );
    }
  } catch (err) {
    tried.push(
      `warmFail:${err instanceof LmsHttpError ? err.status : "err"}`,
    );
  }

  for (const studentId of studentIds) {
    if (outOfBudget(startedAt)) return null;

    // GET data — one lang code path first
    const dataPaths = userScheduleDataPaths(studentId, ctx.lang).slice(0, 1);
    for (const dataPath of dataPaths) {
      if (outOfBudget(startedAt)) return null;
      tried.push(`GET ${dataPath}`);
      try {
        const dataRes = await lmsFetchJar(
          dataPath,
          withCookies(ctx, jar),
          jar,
        );
        const lessons = normalizeUserSchedule(dataRes.data);
        const row = asRecord(dataRes.data);
        if (lessons.length || row?.timetable) {
          return {
            data: dataRes.data,
            path: dataRes.path,
            used: {
              year: String(row?.selectedStudyYear ?? year),
              term: String(row?.selectedTerm ?? term),
              week: String(row?.selectedWeek ?? week),
              studentId,
              via: "userSchedule-data",
            },
          };
        }
      } catch (err) {
        tried.push(
          `fail:${dataPath}:${err instanceof LmsHttpError ? err.status : "err"}`,
        );
      }
    }

    let initialData: unknown;
    let initialPath = "";

    for (const path of userScheduleInitialPaths(studentId, ctx.lang).slice(0, 1)) {
      if (outOfBudget(startedAt)) return null;
      tried.push(`POST ${path}`);
      try {
        const initial = await lmsFetchJar(
          path,
          {
            ...withCookies(ctx, jar),
            method: "POST",
            body: userScheduleParams(),
          },
          jar,
        );
        initialData = initial.data;
        initialPath = initial.path;
        break;
      } catch (err) {
        tried.push(
          `fail:${path}:${err instanceof LmsHttpError ? err.status : "err"}`,
        );
      }
    }

    if (!initialData) continue;

    const resolvedId = pickStudentId(initialData, studentId);
    const initialRow = asRecord(initialData);
    const yearOpts = Array.from(
      new Set(
        [
          year,
          String(initialRow?.selectedStudyYear ?? ""),
          ...yearCandidates(year).slice(0, 2),
        ].filter((x) => x && String(x).trim()),
      ),
    ).slice(0, 2);
    const termOpts = Array.from(
      new Set([term, String(initialRow?.selectedTerm ?? "")].filter((x) => x && String(x).trim())),
    ).slice(0, 2);
    const weekOpts = Array.from(
      new Set(
        [
          week === "auto" ? String(initialRow?.selectedWeek ?? "1") : week,
          "1",
        ].filter((x) => x && String(x).trim()),
      ),
    ).slice(0, 1);

    const calcPath = userScheduleCalculatePaths(resolvedId, ctx.lang)[0];
    let emptyHit: ScheduleHit | null = null;

    for (const studyYear of yearOpts) {
      for (const selectedTerm of termOpts) {
        for (const selectedWeek of weekOpts) {
          if (outOfBudget(startedAt)) {
            return emptyHit;
          }
          const calcBody = userScheduleParams(studyYear, selectedTerm, selectedWeek);
          tried.push(`POST ${calcPath}`);
          try {
            const calc = await lmsFetchJar(
              calcPath,
              {
                ...withCookies(ctx, jar),
                method: "POST",
                body: calcBody,
              },
              jar,
            );

            const lessons = normalizeUserSchedule(calc.data);
            const used = {
              year: studyYear,
              term: selectedTerm,
              week: selectedWeek,
              studentId: resolvedId,
              via: "userSchedule",
            };
            if (lessons.length) {
              return { data: calc.data, path: calc.path, used };
            }
            if (!emptyHit && asRecord(calc.data)?.timetable) {
              emptyHit = { data: calc.data, path: calc.path, used };
            }
          } catch (err) {
            tried.push(
              `fail:${calcPath}:${err instanceof LmsHttpError ? err.status : "err"}`,
            );
          }
        }
      }
    }

    if (emptyHit) return emptyHit;

    if (normalizeUserSchedule(initialData).length || asRecord(initialData)?.timetable) {
      return {
        data: initialData,
        path: initialPath,
        used: {
          year: String(initialRow?.selectedStudyYear ?? year),
          term: String(initialRow?.selectedTerm ?? term),
          week: String(initialRow?.selectedWeek ?? week),
          studentId: resolvedId,
          via: "userSchedule-initial",
        },
      };
    }
  }

  return null;
}

async function fetchLegacySchedule(
  ctx: ProxyCtx,
  year: string,
  term: string,
  week: string,
  tried: string[],
  jar: CookieSession,
  startedAt: number,
): Promise<ScheduleHit | null> {
  const y = year;
  const t = term;
  const w = week === "auto" ? "1" : week;
  const common = {
    ...withCookies(ctx, jar),
    cacheKey: `schedule:${ctx.lang}`,
    maxAttempts: 4,
    timeoutMs: REQ_TIMEOUT_MS,
  };

  if (ctx.groupId && !outOfBudget(startedAt)) {
    try {
      const byGroup = await lmsTryGet(
        scheduleGroupPaths(y, t, w, ctx.lang, ctx.groupId).slice(0, 3),
        { ...common, failMessage: "group schedule", maxAttempts: 3 },
      );
      if (byGroup.cookies) jar.cookies = byGroup.cookies;
      tried.push(...byGroup.tried);
      return {
        data: byGroup.data,
        path: byGroup.path,
        used: { year: y, term: t, week: w, groupId: ctx.groupId, via: "group" },
      };
    } catch (err) {
      tried.push(...((err as { tried?: string[] }).tried ?? []));
    }
  }

  if (!outOfBudget(startedAt)) {
    try {
      const result = await lmsTryGet(
        schedulePaths(y, t, w, ctx.lang, ctx.personId).slice(0, 4),
        { ...common, failMessage: "schedule GET", maxAttempts: 4 },
      );
      if (result.cookies) jar.cookies = result.cookies;
      tried.push(...result.tried);
      return {
        data: result.data,
        path: result.path,
        used: { year: y, term: t, week: w, via: "legacy-get" },
      };
    } catch (err) {
      tried.push(...((err as { tried?: string[] }).tried ?? []));
    }
  }

  if (!outOfBudget(startedAt)) {
    try {
      const bodies = schedulePostBodies(y, t, w, ctx.lang).slice(0, 2);
      const posted = await lmsTryPost(
        schedulePostPaths().slice(0, 3),
        bodies[0],
        { ...common, failMessage: "schedule POST", maxAttempts: 4 },
        bodies,
      );
      if (posted.cookies) jar.cookies = posted.cookies;
      tried.push(...posted.tried);
      return {
        data: posted.data,
        path: posted.path,
        used: { year: y, term: t, week: w, via: "legacy-post" },
      };
    } catch (err) {
      tried.push(...((err as { tried?: string[] }).tried ?? []));
    }
  }

  // One alternate year (±1) if still within budget
  const alt = yearCandidates(year).find((c) => c !== year);
  if (alt && !outOfBudget(startedAt)) {
    try {
      const result = await lmsTryGet(
        schedulePaths(alt, t, w, ctx.lang, ctx.personId).slice(0, 2),
        { ...common, failMessage: "schedule alt year", maxAttempts: 2 },
      );
      if (result.cookies) jar.cookies = result.cookies;
      tried.push(...result.tried);
      return {
        data: result.data,
        path: result.path,
        used: { year: alt, term: t, week: w, via: "legacy-alt-year" },
      };
    } catch (err) {
      tried.push(...((err as { tried?: string[] }).tried ?? []));
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    return await getSchedule(req);
  } catch (err) {
    console.error("[schedule]", err);
    return errorResponse(err, "Не удалось получить расписание");
  }
}

async function getSchedule(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const year = req.nextUrl.searchParams.get("year");
  const term = req.nextUrl.searchParams.get("term");
  const week = req.nextUrl.searchParams.get("week") || "1";

  if (!year || !term) {
    return NextResponse.json({ error: "Нужны year и term" }, { status: 400 });
  }

  const tried: string[] = [];
  const jar: CookieSession = { cookies: ctx.cookies };
  tried.push(
    `auth:sid=${ctx.sid ? "yes" : "no"},cookies=${ctx.cookies ? "yes" : "no"},person=${ctx.personId || "0"}`,
  );

  if (!jar.cookies) {
    try {
      jar.cookies = await warmLmsSession({
        baseUrl: ctx.baseUrl,
        lang: ctx.lang,
        clientId: ctx.clientId,
      });
      tried.push("warm:session");
    } catch {
      // ignore
    }
  }

  const v6 = await fetchUserScheduleV6(ctx, year, term, week, tried, jar, startedAt);
  if (v6) {
    trackSession(ctx);
    return NextResponse.json({
      lessons: normalizeSchedule(v6.data),
      path: v6.path,
      used: v6.used,
      cookies: jar.cookies,
    });
  }

  const legacy = await fetchLegacySchedule(
    ctx,
    year,
    term,
    week,
    tried,
    jar,
    startedAt,
  );
  if (legacy) {
    trackSession(ctx);
    return NextResponse.json({
      lessons: normalizeSchedule(legacy.data),
      path: legacy.path,
      used: legacy.used,
      cookies: jar.cookies,
    });
  }

  return errorResponse(
    Object.assign(
      new Error(
        ctx.sid
          ? outOfBudget(startedAt)
            ? "Сервер вуза отвечает слишком долго. Открой сохранённое расписание или попробуй ещё раз."
            : "Расписание не открылось. Выйди и войди снова."
          : "Нет sid в сессии. Выйди и войди снова.",
      ),
      { cookies: jar.cookies },
    ),
    "Не удалось получить расписание",
  );
}
