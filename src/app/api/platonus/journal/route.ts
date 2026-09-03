import { NextRequest, NextResponse } from "next/server";
import { journalPaths } from "@/lib/platonus/endpoints";
import { normalizeJournalSubjects } from "@/lib/platonus/normalize";
import { errorResponse, readProxyContext } from "@/lib/platonus/route-helpers";
import { platonusTryGet } from "@/lib/platonus/server";

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const year = req.nextUrl.searchParams.get("year");
  const term = req.nextUrl.searchParams.get("term");

  if (!year || !term) {
    return NextResponse.json({ error: "Нужны year и term" }, { status: 400 });
  }

  try {
    const result = await platonusTryGet(journalPaths(year, term, ctx.lang), ctx);
    return NextResponse.json({
      subjects: normalizeJournalSubjects(result.data),
      path: result.path,
      raw: result.data,
    });
  } catch (err) {
    return errorResponse(err, "Не удалось получить журнал");
  }
}
