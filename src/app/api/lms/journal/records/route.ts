import { NextRequest, NextResponse } from "next/server";
import { journalRecordsPaths, yearCandidates } from "@/lib/lms/endpoints";
import { normalizeJournalRecords } from "@/lib/lms/normalize";
import { readProxyContext } from "@/lib/lms/route-helpers";
import { LmsHttpError, lmsFetch } from "@/lib/lms/server";
import type { Lang } from "@/lib/lms/types";

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const year = req.nextUrl.searchParams.get("year");
  const term = req.nextUrl.searchParams.get("term");
  const subjectId = req.nextUrl.searchParams.get("subjectId");
  const tutorSubjectId = req.nextUrl.searchParams.get("tutorSubjectId");

  if (!year || !term || !subjectId) {
    return NextResponse.json({ error: "Нужны year, term и subjectId" }, { status: 400 });
  }

  const ids = Array.from(
    new Set(
      [subjectId, tutorSubjectId].filter(
        (v): v is string => Boolean(v && String(v).trim()),
      ),
    ),
  );
  const years = yearCandidates(year).slice(0, 2);

  let lastErr: unknown;
  let cookies = ctx.cookies || undefined;
  let bestSummaryOnly: {
    records: ReturnType<typeof normalizeJournalRecords>;
    path: string;
  } | null = null;

  for (const y of years) {
    for (const id of ids) {
      const paths = journalRecordsPaths(y, term, id, ctx.lang as Lang);
      for (const path of paths) {
        try {
          const result = await lmsFetch(path, {
            ...ctx,
            cookies,
            timeoutMs: 2_800,
          });
          cookies = result.cookies || cookies;
          const records = normalizeJournalRecords(result.data);
          const dated = records.filter((r) => Boolean(r.date));
          if (dated.length) {
            return NextResponse.json({
              records,
              path: result.path,
              used: { year: y, term, subjectId: id },
              cookies,
            });
          }
          const undated = records.filter((r) => !r.date && r.mark !== "—");
          if (undated.length && !bestSummaryOnly) {
            bestSummaryOnly = { records, path: result.path };
          }
        } catch (err) {
          lastErr = err;
          if (err instanceof LmsHttpError) {
            const c = (err as LmsHttpError & { cookies?: string }).cookies;
            if (c) cookies = c;
          }
        }
      }
    }
  }

  if (bestSummaryOnly) {
    return NextResponse.json({
      records: bestSummaryOnly.records,
      path: bestSummaryOnly.path,
      cookies,
    });
  }

  return NextResponse.json(
    {
      records: [],
      path: null,
      error:
        lastErr instanceof Error
          ? lastErr.message
          : "Не удалось получить текущие оценки по занятиям",
      ...(cookies ? { cookies } : {}),
    },
    { status: 200 },
  );
}
