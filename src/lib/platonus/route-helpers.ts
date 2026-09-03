import { NextRequest, NextResponse } from "next/server";
import type { Lang } from "@/lib/platonus/types";

export function readProxyContext(req: NextRequest): {
  baseUrl: string;
  token: string;
  lang: Lang;
  personId?: string;
  sid?: string;
  uid?: string;
  clientId?: string;
  groupId?: string;
  cookies?: string;
} | NextResponse {
  const baseUrl = req.headers.get("x-platonus-base")?.trim();
  const token = req.headers.get("x-platonus-token")?.trim();
  const lang = (req.headers.get("x-platonus-lang")?.trim() || "ru") as Lang;
  const personId = req.headers.get("x-platonus-person")?.trim() || undefined;
  const sid = req.headers.get("x-platonus-sid")?.trim() || undefined;
  const uid = req.headers.get("x-platonus-uid")?.trim() || undefined;
  const clientId = req.headers.get("x-platonus-client")?.trim() || undefined;
  const groupId = req.headers.get("x-platonus-group")?.trim() || undefined;
  const cookies = req.headers.get("x-platonus-cookies")?.trim() || undefined;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Нужна авторизация. Передайте x-platonus-base и x-platonus-token." },
      { status: 401 },
    );
  }

  return { baseUrl, token, lang, personId, sid, uid, clientId, groupId, cookies };
}

export function errorResponse(err: unknown, fallback = "Ошибка Platonus") {
  const anyErr = err as {
    message?: string;
    tried?: string[];
    cause?: { status?: number; body?: unknown };
    status?: number;
    body?: unknown;
    cookies?: string;
  };

  const status =
    anyErr.status === 401 || anyErr.cause?.status === 401
      ? 401
      : anyErr.status === 403 || anyErr.cause?.status === 403
        ? 403
        : 502;

  return NextResponse.json(
    {
      error: anyErr.message || fallback,
      detail:
        typeof anyErr.cause?.body === "string"
          ? anyErr.cause.body
          : anyErr.cause?.body
            ? JSON.stringify(anyErr.cause.body).slice(0, 500)
            : undefined,
      tried: anyErr.tried,
      ...(anyErr.cookies ? { cookies: anyErr.cookies } : {}),
    },
    { status },
  );
}
