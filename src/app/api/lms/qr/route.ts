import { NextRequest, NextResponse } from "next/server";
import { buildQrMarkPayloads, qrMarkPaths } from "@/lib/lms/endpoints";
import { errorResponse, readProxyContext } from "@/lib/lms/route-helpers";
import { classifyQrBusinessReply, lmsTryPost } from "@/lib/lms/server";

function pickMessage(data: unknown, kind: string | null): string {
  if (kind === "success") return "Посещаемость отмечена";
  if (kind === "already") return "Уже отмечен на этой паре";
  if (kind === "expired") return "QR просрочен";
  if (typeof data === "string" && data.trim()) return data.trim().slice(0, 240);
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    for (const key of ["message", "msg", "result", "description", "text", "error"]) {
      if (typeof row[key] === "string" && String(row[key]).trim()) {
        return String(row[key]).trim().slice(0, 240);
      }
    }
  }
  return kind ? String(kind) : "Ответ вуза получен";
}

export async function POST(req: NextRequest) {
  const ctx = readProxyContext(req);
  if (ctx instanceof NextResponse) return ctx;

  const body = (await req.json()) as { code?: string };
  if (!body.code?.trim()) {
    return NextResponse.json({ error: "Пустой QR-код" }, { status: 400 });
  }

  const raw = body.code.trim();
  // Fast probe first (1 payload × ~11 paths). Full only if needed.
  const fastVariants = buildQrMarkPayloads(raw, "fast");
  const paths = qrMarkPaths();

  let parsedAction: string | null = null;
  let tokenPreview: string | null = null;
  if (raw.startsWith("{")) {
    try {
      const p = JSON.parse(raw) as { code?: string; action?: string };
      parsedAction = p.action ?? null;
      tokenPreview = p.code ? `${p.code.slice(0, 12)}…(${p.code.length})` : null;
    } catch {
      // ignore
    }
  }

  const tryOpts = {
    ...ctx,
    cacheKey: `qrMark:${ctx.lang}`,
    timeoutMs: 7_000,
    maxAttempts: 16,
    failMessage: "QR не принят (просрочен, уже отмечен, или эндпоинт не найден)",
  };

  try {
    let result;
    try {
      result = await lmsTryPost(paths, fastVariants[0], tryOpts, fastVariants);
    } catch (fastErr) {
      const fullVariants = buildQrMarkPayloads(raw, "full");
      result = await lmsTryPost(
        paths,
        fullVariants[0],
        { ...tryOpts, maxAttempts: 24 },
        fullVariants,
      );
      // if full also fails, rethrow original context
      void fastErr;
    }

    const kind =
      result.kind ?? classifyQrBusinessReply(result.data, result.status) ?? null;
    const ok =
      kind === "success" ||
      kind === "already" ||
      (kind == null && result.status >= 200 && result.status < 300);
    const message = pickMessage(result.data, kind);

    return NextResponse.json({
      ok,
      kind,
      message,
      marked: kind === "success" || kind === "already" || (ok && kind == null),
      path: result.path,
      status: result.status,
      data: result.data,
      payload: result.payload,
      tried: result.tried,
      paths,
      meta: {
        action: parsedAction,
        tokenPreview,
        valid: true,
      },
      ...(result.cookies ? { cookies: result.cookies } : {}),
    });
  } catch (err) {
    return errorResponse(
      err,
      "QR не принят (просрочен, уже отмечен, или ни один эндпоинт не ответил)",
    );
  }
}
