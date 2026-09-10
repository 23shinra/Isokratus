import { NextRequest, NextResponse } from "next/server";
import type { Lang } from "@/lib/lms/types";

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
  const baseUrl = req.headers.get("x-iso-base")?.trim();
  const token = req.headers.get("x-iso-token")?.trim();
  const lang = (req.headers.get("x-iso-lang")?.trim() || "ru") as Lang;
  const personId = req.headers.get("x-iso-person")?.trim() || undefined;
  const sid = req.headers.get("x-iso-sid")?.trim() || undefined;
  const uid = req.headers.get("x-iso-uid")?.trim() || undefined;
  const clientId = req.headers.get("x-iso-client")?.trim() || undefined;
  const groupId = req.headers.get("x-iso-group")?.trim() || undefined;
  const cookies = req.headers.get("x-iso-cookies")?.trim() || undefined;

  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "Нужна авторизация. Передайте x-iso-base и x-iso-token." },
      { status: 401 },
    );
  }

  return { baseUrl, token, lang, personId, sid, uid, clientId, groupId, cookies };
}

export function errorResponse(err: unknown, fallback = "Ошибка сервера вуза") {
  const anyErr = err as {
    message?: string;
    tried?: string[];
    cause?: { status?: number; body?: unknown; message?: string };
    status?: number;
    body?: unknown;
    cookies?: string;
  };

  const statusCode =
    anyErr.status === 401 || anyErr.cause?.status === 401
      ? 401
      : anyErr.status === 403 || anyErr.cause?.status === 403
        ? 403
        : 502;

  let message = anyErr.message || fallback;
  if (statusCode === 401 || statusCode === 403) {
    message = "Сессия истекла. Выйди и войди снова.";
  } else if (/рабочий эндпоинт|endpoint|Нужна авторизация\. Передайте/i.test(message)) {
    message =
      statusCode >= 500
        ? "Не удалось связаться с сервером вуза. Выйди и войди снова."
        : "Сессия истекла. Выйди и войди снова.";
  }

  return NextResponse.json(
    {
      error: message,
      message,
      ...(anyErr.cookies ? { cookies: anyErr.cookies } : {}),
    },
    { status: statusCode },
  );
}
