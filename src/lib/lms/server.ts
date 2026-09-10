import { normalizeBaseUrl } from "./endpoints";
import type { Lang } from "./types";

export class LmsHttpError extends Error {
  status: number;
  body: unknown;
  url: string;

  constructor(status: number, url: string, body: unknown) {
    super(`LMS ${status}: ${url}`);
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

type RequestOptions = {
  baseUrl: string;
  token?: string | null;
  sid?: string | null;
  uid?: string | null;
  clientId?: string | null;
  /** Opaque Cookie jar (JSESSIONID, XSRF-TOKEN, sid, …) from prior LMS responses. */
  cookies?: string | null;
  lang?: Lang;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** Per-request timeout (ms). Default 12_000. */
  timeoutMs?: number;
};

const ACCEPT_LANGUAGE: Record<Lang, string> = {
  ru: "ru",
  kz: "kk",
  en: "en",
};

/** Parse `a=1; b=2` cookie header into a map (last write wins). */
export function parseCookieHeader(raw?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw?.trim()) return out;
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!name) continue;
    out[name] = value;
  }
  return out;
}

/** Merge Set-Cookie lines into an existing Cookie header string. */
export function mergeSetCookie(
  existing: string | null | undefined,
  setCookie: string[] | undefined,
): string {
  const map = parseCookieHeader(existing);
  if (setCookie?.length) {
    for (const line of setCookie) {
      const first = line.split(";", 1)[0];
      const idx = first.indexOf("=");
      if (idx <= 0) continue;
      const name = first.slice(0, idx).trim();
      const value = first.slice(idx + 1).trim();
      if (!name) continue;
      // Clearing cookies
      if (!value || /^deleted$/i.test(value)) {
        delete map[name];
        continue;
      }
      map[name] = value;
    }
  }
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export function cookieValue(
  jar: string | null | undefined,
  name: string,
): string | undefined {
  return parseCookieHeader(jar)[name];
}

/**
 * Match LMS /v7 Angular interceptor:
 *   token, sid, clientId, Accept-Language, Content-Type
 * plus browser cookie jar (JSESSIONID / XSRF-TOKEN) for Spring session + CSRF.
 */
function buildHeaders({
  token,
  sid,
  uid,
  clientId,
  cookies,
  lang,
  method,
  hasBody,
  headers,
}: {
  token?: string | null;
  sid?: string | null;
  uid?: string | null;
  clientId?: string | null;
  cookies?: string | null;
  lang?: Lang;
  method: string;
  hasBody: boolean;
  headers: Record<string, string>;
}): Record<string, string> {
  const out: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": ACCEPT_LANGUAGE[lang ?? "ru"],
    ...headers,
  };

  if (hasBody || method !== "GET") {
    // Angular HttpClient uses application/json (no charset)
    out["Content-Type"] = out["Content-Type"] || "application/json";
  }

  if (token && String(token).length > 10) {
    out.token = token;
  }

  // Angular always sets sid/clientId (even the string "null")
  if (sid != null && String(sid).trim() !== "" && String(sid) !== "null") {
    out.sid = String(sid);
  }

  if (uid != null && String(uid).trim() !== "" && String(uid) !== "null") {
    out.uid = String(uid);
  }

  if (clientId != null && String(clientId).trim() !== "" && String(clientId) !== "null") {
    out.clientId = String(clientId);
  }

  const jar = parseCookieHeader(cookies);
  if (sid != null && String(sid).trim() !== "" && String(sid) !== "null") {
    jar.sid = String(sid);
  }
  const cookieHeader = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookieHeader) {
    out.Cookie = cookieHeader;
  }

  // Angular HttpClientXsrfModule: cookie XSRF-TOKEN → header X-XSRF-TOKEN on mutating requests
  if (method !== "GET" && method !== "HEAD") {
    const xsrf = jar["XSRF-TOKEN"] || jar["Xsrf-Token"];
    if (xsrf) {
      out["X-XSRF-TOKEN"] = xsrf;
    }
  }

  return out;
}

function withOriginHeaders(baseUrl: string, headers: Record<string, string>): Record<string, string> {
  try {
    const root = normalizeBaseUrl(baseUrl);
    return {
      ...headers,
      Origin: root,
      Referer: `${root}/v7/`,
    };
  } catch {
    return headers;
  }
}

export async function lmsFetch(
  path: string,
  {
    baseUrl,
    token,
    sid,
    uid,
    clientId,
    cookies,
    lang,
    method = "GET",
    body,
    headers = {},
    timeoutMs = 12_000,
  }: RequestOptions,
): Promise<{
  status: number;
  data: unknown;
  path: string;
  setCookie?: string[];
  cookies: string;
}> {
  const root = normalizeBaseUrl(baseUrl);
  const cleanPath = path.replace(/^\/+/, "");
  const url = `${root}/${cleanPath}`;
  const hasBody = body !== undefined;

  const res = await fetch(url, {
    method,
    headers: withOriginHeaders(
      baseUrl,
      buildHeaders({
        token,
        sid,
        uid,
        clientId,
        cookies,
        lang,
        method,
        hasBody,
        headers,
      }),
    ),
    body: hasBody ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const setCookie =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : undefined;
  const nextCookies = mergeSetCookie(cookies, setCookie);

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = new LmsHttpError(res.status, url, data);
    (err as LmsHttpError & { cookies?: string }).cookies = nextCookies;
    throw err;
  }

  return { status: res.status, data, path: cleanPath, setCookie, cookies: nextCookies };
}

/** Mutable cookie jar for multi-step proxy flows (login → fio, schedule initial → calculate). */
export type CookieSession = { cookies?: string };

export async function lmsFetchJar(
  path: string,
  opts: RequestOptions,
  jar: CookieSession,
): Promise<{ status: number; data: unknown; path: string }> {
  try {
    const result = await lmsFetch(path, { ...opts, cookies: jar.cookies });
    jar.cookies = result.cookies || jar.cookies;
    return result;
  } catch (err) {
    if (err instanceof LmsHttpError) {
      const c = (err as LmsHttpError & { cookies?: string }).cookies;
      if (c) jar.cookies = c;
    }
    throw err;
  }
}

export async function lmsFetchBinary(
  path: string,
  {
    baseUrl,
    token,
    sid,
    uid,
    clientId,
    cookies,
    lang,
    headers = {},
  }: Omit<RequestOptions, "method" | "body">,
): Promise<{ status: number; buffer: ArrayBuffer; contentType: string; path: string }> {
  const root = normalizeBaseUrl(baseUrl);
  const cleanPath = path.replace(/^\/+/, "");
  const url = `${root}/${cleanPath}`;

  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders({
      token,
      sid,
      uid,
      clientId,
      cookies,
      lang,
      method: "GET",
      hasBody: false,
      headers: {
        Accept: "image/*, application/octet-stream, */*",
        ...headers,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LmsHttpError(res.status, url, text);
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { status: res.status, buffer, contentType, path: cleanPath };
}

type TryOptions = Omit<RequestOptions, "method" | "body"> & {
  /** Abort discovery only on these statuses. Default: [] — keep probing. */
  fatalStatuses?: number[];
  failMessage?: string;
  /** Remember working path across requests (e.g. "studyYears", "terms"). */
  cacheKey?: string;
  /** Hard cap on path×payload attempts (QR probe). */
  maxAttempts?: number;
};

/** In-process cache of last working LMS path per university+key. */
const pathSuccessCache = new Map<string, string>();

function cacheKeyFull(baseUrl: string, key: string): string {
  return `${normalizeBaseUrl(baseUrl)}::${key}`;
}

function orderPathsWithCache(paths: string[], baseUrl: string, cacheKey?: string): string[] {
  if (!cacheKey) return paths;
  const hit = pathSuccessCache.get(cacheKeyFull(baseUrl, cacheKey));
  if (!hit) return paths;
  if (!paths.includes(hit)) return paths;
  return [hit, ...paths.filter((p) => p !== hit)];
}

function rememberPath(baseUrl: string, cacheKey: string | undefined, path: string) {
  if (!cacheKey) return;
  pathSuccessCache.set(cacheKeyFull(baseUrl, cacheKey), path);
}

function isUselessPayload(data: unknown): boolean {
  if (data == null) return false;
  if (typeof data === "string" && /<!DOCTYPE html>/i.test(data)) return true;
  if (typeof data === "object" && !Array.isArray(data)) {
    const row = data as Record<string, unknown>;
    if (row.login_status === "invalid") return true;
    if (typeof row.message === "string" && /access denied|forbidden|не авториз/i.test(row.message)) {
      return true;
    }
  }
  return false;
}

function bodyAsText(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * QR business replies (endpoint is correct even on HTTP 4xx):
 *   success — успешно / отмечено
 *   expired — просрочен
 *   already — уже отмечен
 */
export type QrBusinessKind = "success" | "expired" | "already";

export function classifyQrBusinessReply(
  data: unknown,
  status = 200,
): QrBusinessKind | null {
  const t = bodyAsText(data);
  if (!t || /<!DOCTYPE html>/i.test(t)) return null;
  const lower = t.toLowerCase();

  if (/просроч/i.test(t) || /expired/i.test(lower)) return "expired";
  if (
    /уже\s+отмечен/i.test(t) ||
    /already\s+(marked|attend)/i.test(lower) ||
    /duplicate/i.test(lower)
  ) {
    return "already";
  }
  if (
    /успешн/i.test(t) ||
    /отметк[аи]\s+(принят|проставлен)/i.test(t) ||
    /посещаемость\s+отмечен/i.test(t) ||
    /marked\s+successfully/i.test(lower) ||
    /attendance\s+(ok|marked|success)/i.test(lower)
  ) {
    return "success";
  }

  if (typeof data === "object" && data !== null) {
    const row = data as Record<string, unknown>;
    for (const key of ["message", "msg", "result", "error", "description", "text"]) {
      const nested = classifyQrBusinessReply(row[key], status);
      if (nested) return nested;
    }
    if (
      status >= 200 &&
      status < 300 &&
      (row.ok === true || row.success === true || row.status === "ok")
    ) {
      return "success";
    }
  }

  return null;
}

function proxyFailError(
  lastError: unknown,
  cookies: string | undefined,
  tried: string[],
  failMessage?: string,
): Error {
  const status =
    lastError instanceof LmsHttpError
      ? lastError.status
      : (lastError as { status?: number } | undefined)?.status;

  let message = failMessage || "";
  if (status === 401 || status === 403) {
    message = "Сессия истекла. Выйди и войди снова.";
  } else if (
    !message ||
    /рабочий эндпоинт|endpoint/i.test(message)
  ) {
    message =
      status && status >= 500
        ? "Сервер вуза не ответил. Попробуй ещё раз или войди снова."
        : "Не удалось связаться с сервером вуза. Выйди и войди снова.";
  }

  return Object.assign(new Error(message), {
    tried,
    cause: lastError,
    cookies,
    status: status === 401 || status === 403 ? status : undefined,
  });
}

/** Try path candidates until one returns 2xx. */
export async function lmsTryGet(
  paths: string[],
  opts: TryOptions,
): Promise<{ status: number; data: unknown; path: string; tried: string[]; cookies?: string }> {
  const tried: string[] = [];
  let lastError: unknown;
  let cookies = opts.cookies || undefined;
  // Do not abort on 401 by default — wrong path often returns 401 on LMS.
  const fatal = new Set(opts.fatalStatuses ?? []);
  const ordered = orderPathsWithCache(paths, opts.baseUrl, opts.cacheKey);
  const maxAttempts = opts.maxAttempts ?? ordered.length;
  let attempts = 0;

  for (const path of ordered) {
    if (attempts >= maxAttempts) break;
    attempts += 1;
    tried.push(path);
    try {
      const result = await lmsFetch(path, {
        ...opts,
        cookies,
        method: "GET",
        timeoutMs: opts.timeoutMs ?? 8_000,
      });
      cookies = result.cookies || cookies;
      if (isUselessPayload(result.data)) {
        lastError = new Error(`Useless payload from ${path}`);
        continue;
      }
      rememberPath(opts.baseUrl, opts.cacheKey, path);
      return { ...result, tried, cookies };
    } catch (err) {
      lastError = err;
      if (err instanceof LmsHttpError) {
        const c = (err as LmsHttpError & { cookies?: string }).cookies;
        if (c) cookies = c;
      }
      if (err instanceof LmsHttpError && fatal.has(err.status)) {
        throw err;
      }
    }
  }

  throw proxyFailError(lastError, cookies, tried, opts.failMessage);
}

export async function lmsTryPost(
  paths: string[],
  body: unknown,
  opts: TryOptions,
  bodyVariants?: unknown[],
): Promise<{
  status: number;
  data: unknown;
  path: string;
  payload: unknown;
  tried: string[];
  cookies?: string;
  kind?: QrBusinessKind | null;
}> {
  const tried: string[] = [];
  let lastError: unknown;
  let cookies = opts.cookies || undefined;
  const payloads = bodyVariants ?? [body];
  const fatal = new Set(opts.fatalStatuses ?? []);
  const ordered = orderPathsWithCache(paths, opts.baseUrl, opts.cacheKey);
  const maxAttempts = opts.maxAttempts ?? Number.POSITIVE_INFINITY;
  let attempts = 0;

  for (const path of ordered) {
    for (const payload of payloads) {
      if (attempts >= maxAttempts) break;
      attempts += 1;
      tried.push(`${path} :: ${JSON.stringify(payload).slice(0, 120)}`);
      try {
        const result = await lmsFetch(path, {
          ...opts,
          cookies,
          method: "POST",
          body: payload,
          timeoutMs: opts.timeoutMs ?? 8_000,
        });
        cookies = result.cookies || cookies;
        if (isUselessPayload(result.data)) {
          lastError = new Error(`Useless payload from ${path}`);
          continue;
        }
        const kind = classifyQrBusinessReply(result.data, result.status);
        rememberPath(opts.baseUrl, opts.cacheKey, path);
        return { ...result, path, payload, tried, cookies, kind };
      } catch (err) {
        lastError = err;
        if (err instanceof LmsHttpError) {
          const c = (err as LmsHttpError & { cookies?: string }).cookies;
          if (c) cookies = c;
          // Business replies (просрочен / уже отмечен) often come as 4xx —
          // that still means we hit the real attendance endpoint.
          const kind = classifyQrBusinessReply(err.body, err.status);
          if (kind) {
            rememberPath(opts.baseUrl, opts.cacheKey, path);
            return {
              status: err.status,
              data: err.body,
              path,
              payload,
              tried,
              cookies,
              kind,
            };
          }
        }
        if (err instanceof LmsHttpError && fatal.has(err.status)) {
          throw err;
        }
      }
    }
    if (attempts >= maxAttempts) break;
  }

  throw proxyFailError(lastError, cookies, tried, opts.failMessage);
}

/** Pull sid=… from Set-Cookie list. */
export function sidFromSetCookie(cookies: string[] | undefined): string | undefined {
  if (!cookies?.length) return undefined;
  for (const raw of cookies) {
    const m = raw.match(/(?:^|,\s*)sid=([^;,\s]+)/i);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Warm Spring session + optional XSRF cookie before authenticated calls. */
export async function warmLmsSession(
  opts: Pick<RequestOptions, "baseUrl" | "lang" | "cookies" | "clientId">,
): Promise<string> {
  const jar: CookieSession = { cookies: opts.cookies || undefined };
  for (const path of ["rest/api/version", "rest/api/authType"]) {
    try {
      await lmsFetchJar(
        path,
        {
          baseUrl: opts.baseUrl,
          lang: opts.lang,
          clientId: opts.clientId,
          headers: { Accept: "*/*" },
        },
        jar,
      );
      if (jar.cookies?.includes("JSESSIONID=")) break;
    } catch {
      // keep going — we only need Set-Cookie
    }
  }
  return jar.cookies || opts.cookies || "";
}
