import { NextRequest, NextResponse } from "next/server";
import { journalRecordsPaths } from "@/lib/platonus/endpoints";
import { normalizeJournalRecords } from "@/lib/platonus/normalize";
import { errorResponse, readProxyContext } from "@/lib/platonus/route-helpers";
import { platonusTryGet } from "@/lib/platonus/server";

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const year = req.nextUrl.searchParams.get("year");
  const term = req.nextUrl.searchParams.get("term");
  const subjectId = req.nextUrl.searchParams.get("subjectId");

  if (!year || !term || !subjectId) {
    return NextResponse.json({ error: "Нужны year, term и subjectId" }, { status: 400 });
  }

  try {
    const result = await platonusTryGet(
      journalRecordsPaths(year, term, subjectId, ctx.lang),
      ctx,
    );
    return NextResponse.json({
      records: normalizeJournalRecords(result.data),
      path: result.path,
      raw: result.data,
    });
  } catch (err) {
    return errorResponse(err, "Не удалось получить оценки по предмету");
  }
}
