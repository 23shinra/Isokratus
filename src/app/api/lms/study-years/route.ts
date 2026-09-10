import { NextRequest, NextResponse } from "next/server";
import { studyYearsPaths } from "@/lib/lms/endpoints";
import { extractListIds } from "@/lib/lms/normalize";
import { errorResponse, readProxyContext } from "@/lib/lms/route-helpers";
import { lmsTryGet } from "@/lib/lms/server";

export async function GET(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  try {
    const result = await lmsTryGet(studyYearsPaths(ctx.lang), {
      ...ctx,
      cacheKey: `studyYears:${ctx.lang}`,
      timeoutMs: 5_000,
      maxAttempts: 3,
    });
    return NextResponse.json({
      items: extractListIds(result.data),
      path: result.path,
      cookies: result.cookies,
    });
  } catch (err) {
    return errorResponse(err, "Не удалось получить учебные годы");
  }
}
