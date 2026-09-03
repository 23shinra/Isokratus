import { NextRequest, NextResponse } from "next/server";
import { termsPaths } from "@/lib/platonus/endpoints";
import { extractListIds } from "@/lib/platonus/normalize";
import { errorResponse, readProxyContext } from "@/lib/platonus/route-helpers";
import { platonusTryGet } from "@/lib/platonus/server";

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const result = await platonusTryGet(termsPaths(ctx.lang), ctx);
    return NextResponse.json({
      items: extractListIds(result.data),
      path: result.path,
      raw: result.data,
    });
  } catch (err) {
    return errorResponse(err, "Не удалось получить семестры");
  }
}
