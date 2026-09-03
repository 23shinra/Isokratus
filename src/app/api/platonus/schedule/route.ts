import { NextRequest, NextResponse } from "next/server";
import {
  scheduleGroupPaths,
  schedulePaths,
  schedulePostBodies,
  schedulePostPaths,
  scheduleWeeksCountPaths,
  userScheduleCalculatePaths,
  userScheduleDataPaths,
  userScheduleInitialPaths,
  userScheduleParams,
  yearCandidates,
} from "@/lib/platonus/endpoints";
import { normalizeSchedule, normalizeUserSchedule } from "@/lib/platonus/normalize";
import { errorResponse, readProxyContext } from "@/lib/platonus/route-helpers";
import {
  PlatonusHttpError,
  platonusFetchJar,
  platonusTryGet,
  platonusTryPost,
  warmPlatonusSession,
  type CookieSession,
} from "@/lib/platonus/server";
import type { Lang } from "@/lib/platonus/types";

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
): ProxyCtx & { cookies?: string } {
  return { ...ctx, cookies: jar.cookies || ctx.cookies };
}

/**
 * Platonus 6.26 flow used by web /v7 schedule:
 *   GET  .../userSchedule/student/data/{studentID}/{lang}   (sometimes enough)
 *   POST .../userSchedule/student/initial/{studentID}/{lang}
 *   POST .../userSchedule/student/calculate/{studentID}/{lang}
 */
async function fetchUserScheduleV6(
  ctx: ProxyCtx,
  year: string,
  term: string,
  week: string,
  tried: string[],
  jar: CookieSession,
): Promise<{ data: unknown; path: string; used: Record<string, unknown> } | null> {
  const studentIds = Array.from(
    new Set(
      ["0", ctx.personId].filter((x): x is string => Boolean(x && String(x).trim())),
    ),
  );

  // Warm / attach Java session before schedule POSTs
  try {
    tried.push("warm:person/personID");
    await platonusFetchJar(
      "rest/api/person/personID",
      withCookies(ctx, jar),
      jar,
    );
  } catch (err) {
    tried.push(
      `warmFail:${err instanceof PlatonusHttpError ? err.status : "err"}`,
    );
  }

  for (const studentId of studentIds) {
    // 0) GET data — Angular loadStudentData; avoids CSRF on some installs
    for (const dataPath of userScheduleDataPaths(studentId, ctx.lang)) {
      tried.push(`GET ${dataPath}`);
      try {
        const dataRes = await platonusFetchJar(
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
          `fail:${dataPath}:${err instanceof PlatonusHttpError ? err.status : "err"}`,
        );
      }
    }

    let initialData: unknown;
    let initialPath = "";

    for (const path of userScheduleInitialPaths(studentId, ctx.lang)) {
      const initialBody = userScheduleParams();
      tried.push(`POST ${path}`);
      try {
        const initial = await platonusFetchJar(
          path,
          {
            ...withCookies(ctx, jar),
            method: "POST",
            body: initialBody,
          },
          jar,
        );
        initialData = initial.data;
        initialPath = initial.path;
        break;
      } catch (err) {
        tried.push(
          `fail:${path}:${err instanceof PlatonusHttpError ? err.status : "err"}`,
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
          ...yearCandidates(year),
        ].filter((x) => x && String(x).trim()),
      ),
    );
    const termOpts = Array.from(
      new Set(
        [term, String(initialRow?.selectedTerm ?? ""), "1", "2"].filter(
          (x) => x && String(x).trim(),
        ),
      ),
    );
    const weekOpts = Array.from(
      new Set(
        [
          week === "auto" ? "" : week,
          String(initialRow?.selectedWeek ?? ""),
          week !== "auto" ? week : "",
          "1",
        ].filter((x) => x && String(x).trim()),
      ),
    );

    const calcPaths = userScheduleCalculatePaths(resolvedId, ctx.lang);
    let emptyHit: { data: unknown; path: string; used: Record<string, unknown> } | null =
      null;

    for (const calcPath of calcPaths) {
      for (const studyYear of yearOpts.slice(0, 3)) {
        for (const selectedTerm of termOpts.slice(0, 2)) {
          for (const selectedWeek of weekOpts.slice(0, 2)) {
            const calcBody = userScheduleParams(studyYear, selectedTerm, selectedWeek);
            tried.push(`POST ${calcPath} :: ${JSON.stringify(calcBody).slice(0, 100)}`);
            try {
              const calc = await platonusFetchJar(
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
                `fail:${calcPath}:${err instanceof PlatonusHttpError ? err.status : "err"}`,
              );
            }
          }
        }
      }
      if (emptyHit) break;
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

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const year = req.nextUrl.searchParams.get("year");
  const term = req.nextUrl.searchParams.get("term");
  const week = req.nextUrl.searchParams.get("week") || "1";

  if (!year || !term) {
    return NextResponse.json({ error: "Нужны year и term" }, { status: 400 });
  }

  const tried: string[] = [];
  const years = yearCandidates(year);
  const terms = Array.from(new Set([term, "1", "2", "3"].filter(Boolean)));
  const jar: CookieSession = { cookies: ctx.cookies };
  tried.push(
    `auth:sid=${ctx.sid ? "yes" : "no"},cookies=${ctx.cookies ? "yes" : "no"},person=${ctx.personId || "0"}`,
  );

  // If client has no jar yet (old session), seed one so POSTs share a JSESSIONID
  if (!jar.cookies) {
    try {
      jar.cookies = await warmPlatonusSession({
        baseUrl: ctx.baseUrl,
        lang: ctx.lang,
        clientId: ctx.clientId,
      });
      tried.push("warm:session");
    } catch {
      // ignore
    }
  }

  const v6 = await fetchUserScheduleV6(ctx, year, term, week, tried, jar);
  if (v6) {
    return NextResponse.json({
      lessons: normalizeSchedule(v6.data),
      path: v6.path,
      raw: v6.data,
      used: v6.used,
      tried,
      cookies: jar.cookies,
    });
  }

  for (const y of years.slice(0, 2)) {
    try {
      const weeks = await platonusTryGet(scheduleWeeksCountPaths(y, term, ctx.lang), {
        ...withCookies(ctx, jar),
        failMessage: "weeks",
      });
      if (weeks.cookies) jar.cookies = weeks.cookies;
      tried.push(`weeksOK:${weeks.path}`);
      break;
    } catch (err) {
      tried.push(...((err as { tried?: string[] }).tried ?? []));
    }
  }

  for (const y of years) {
    for (const t of terms.slice(0, y === year ? terms.length : 1)) {
      if (ctx.groupId) {
        try {
          const byGroup = await platonusTryGet(
            scheduleGroupPaths(y, t, week, ctx.lang, ctx.groupId),
            { ...withCookies(ctx, jar), failMessage: "group schedule" },
          );
          if (byGroup.cookies) jar.cookies = byGroup.cookies;
          return NextResponse.json({
            lessons: normalizeSchedule(byGroup.data),
            path: byGroup.path,
            raw: byGroup.data,
            used: { year: y, term: t, week, groupId: ctx.groupId },
            tried: [...tried, ...byGroup.tried],
            cookies: jar.cookies,
          });
        } catch (err) {
          tried.push(...((err as { tried?: string[] }).tried ?? []));
        }
      }

      try {
        const result = await platonusTryGet(
          schedulePaths(y, t, week, ctx.lang, ctx.personId),
          { ...withCookies(ctx, jar), failMessage: "Не удалось получить расписание (GET)" },
        );
        if (result.cookies) jar.cookies = result.cookies;
        return NextResponse.json({
          lessons: normalizeSchedule(result.data),
          path: result.path,
          raw: result.data,
          used: { year: y, term: t, week },
          tried: [...tried, ...result.tried],
          cookies: jar.cookies,
        });
      } catch (getErr) {
        tried.push(...((getErr as { tried?: string[] }).tried ?? []));
      }

      try {
        const posted = await platonusTryPost(
          schedulePostPaths(),
          schedulePostBodies(y, t, week, ctx.lang)[0],
          { ...withCookies(ctx, jar), failMessage: "Не удалось получить расписание (POST)" },
          schedulePostBodies(y, t, week, ctx.lang),
        );
        if (posted.cookies) jar.cookies = posted.cookies;
        return NextResponse.json({
          lessons: normalizeSchedule(posted.data),
          path: posted.path,
          raw: posted.data,
          used: { year: y, term: t, week },
          tried: [...tried, ...posted.tried],
          cookies: jar.cookies,
        });
      } catch (postErr) {
        tried.push(...((postErr as { tried?: string[] }).tried ?? []));
      }
    }
  }

  return errorResponse(
    Object.assign(
      new Error(
        ctx.sid
          ? "Расписание не открылось. Выйди и войди снова (нужны cookies сессии Platonus), затем скинь новый Tried."
          : "Нет sid в сессии. Выйди и войди снова — без sid веб-расписание Platonus 6 отвечает 401.",
      ),
      { tried: tried.slice(0, 80), cookies: jar.cookies },
    ),
    "Не удалось получить расписание",
  );
}
