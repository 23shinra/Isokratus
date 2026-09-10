import { NextRequest, NextResponse } from "next/server";
import { journalPaths, yearCandidates } from "@/lib/lms/endpoints";
import { normalizeJournalSubjects } from "@/lib/lms/normalize";
import { errorResponse, readProxyContext } from "@/lib/lms/route-helpers";
import { lmsTryGet } from "@/lib/lms/server";
import { touchUsagePerson } from "@/lib/usage-store";
import { findUniversityByUrl } from "@/lib/universities";

const REQ_TIMEOUT_MS = 5_000;

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const year = req.nextUrl.searchParams.get("year");
  const term = req.nextUrl.searchParams.get("term");

  if (!year || !term) {
    return NextResponse.json({ error: "Нужны year и term" }, { status: 400 });
  }

  const years = yearCandidates(year).slice(0, 2);
  let lastErr: unknown;

  for (const y of years) {
    try {
      const result = await lmsTryGet(journalPaths(y, term, ctx.lang), {
        ...ctx,
        cacheKey: `journal:${ctx.lang}`,
        timeoutMs: REQ_TIMEOUT_MS,
        maxAttempts: 3,
      });
      const subjects = normalizeJournalSubjects(result.data);
      // Prefer a year that actually has subjects; keep trying alt year if empty
      if (!subjects.length && y !== years[years.length - 1]) {
        continue;
      }
      if (ctx.personId) {
        void touchUsagePerson({
          baseUrl: ctx.baseUrl,
          personId: ctx.personId,
          universityName: findUniversityByUrl(ctx.baseUrl)?.name,
        }).catch(() => undefined);
      }
      return NextResponse.json({
        subjects,
        path: result.path,
        used: { year: y, term },
        cookies: result.cookies,
      });
    } catch (err) {
      lastErr = err;
    }
  }

  return errorResponse(lastErr, "Не удалось получить журнал");
}
