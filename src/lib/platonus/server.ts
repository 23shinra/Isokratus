import { normalizeBaseUrl } from "./endpoints";
import type { Lang } from "./types";

export class PlatonusHttpError extends Error {
  status: number;
  body: unknown;
  url: string;

  constructor(status: number, url: string, body: unknown) {
    super(`Platonus ${status}: ${url}`);
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
  /** Opaque Cookie jar (JSESSIONID, XSRF-TOKEN, sid, …) from prior Platonus responses. */
  cookies?: string | null;
  lang?: Lang;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
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
 * Match Platonus 6 /v7 Angular interceptor:
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

export async function platonusFetch(
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
    const err = new PlatonusHttpError(res.status, url, data);
    (err as PlatonusHttpError & { cookies?: string }).cookies = nextCookies;
    throw err;
  }

  return { status: res.status, data, path: cleanPath, setCookie, cookies: nextCookies };
}

/** Mutable cookie jar for multi-step proxy flows (login → fio, schedule initial → calculate). */
export type CookieSession = { cookies?: string };

export async function platonusFetchJar(
  path: string,
  opts: RequestOptions,
  jar: CookieSession,
): Promise<{ status: number; data: unknown; path: string }> {
  try {
    const result = await platonusFetch(path, { ...opts, cookies: jar.cookies });
    jar.cookies = result.cookies || jar.cookies;
    return result;
  } catch (err) {
    if (err instanceof PlatonusHttpError) {
      const c = (err as PlatonusHttpError & { cookies?: string }).cookies;
      if (c) jar.cookies = c;
    }
    throw err;
  }
}

export async function platonusFetchBinary(
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
    throw new PlatonusHttpError(res.status, url, text);
  }

  const buffer = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/jpeg";
  return { status: res.status, buffer, contentType, path: cleanPath };
}

type TryOptions = Omit<RequestOptions, "method" | "body"> & {
  /** Abort discovery only on these statuses. Default: [] — keep probing. */
  fatalStatuses?: number[];
  failMessage?: string;
};

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

/** Try path candidates until one returns 2xx. */
export async function platonusTryGet(
  paths: string[],
  opts: TryOptions,
): Promise<{ status: number; data: unknown; path: string; tried: string[]; cookies?: string }> {
  const tried: string[] = [];
  let lastError: unknown;
  let cookies = opts.cookies || undefined;
  // Do not abort on 401 by default — wrong path often returns 401 on Platonus.
  const fatal = new Set(opts.fatalStatuses ?? []);

  for (const path of paths) {
    tried.push(path);
    try {
      const result = await platonusFetch(path, { ...opts, cookies, method: "GET" });
      cookies = result.cookies || cookies;
      if (isUselessPayload(result.data)) {
        lastError = new Error(`Useless payload from ${path}`);
        continue;
      }
      return { ...result, tried, cookies };
    } catch (err) {
      lastError = err;
      if (err instanceof PlatonusHttpError) {
        const c = (err as PlatonusHttpError & { cookies?: string }).cookies;
        if (c) cookies = c;
      }
      if (err instanceof PlatonusHttpError && fatal.has(err.status)) {
        throw err;
      }
    }
  }

  throw Object.assign(
    new Error(opts.failMessage || "Не удалось найти рабочий эндпоинт Platonus"),
    { tried, cause: lastError, cookies },
  );
}

export async function platonusTryPost(
  paths: string[],
  body: unknown,
  opts: TryOptions,
  bodyVariants?: unknown[],
): Promise<{ status: number; data: unknown; path: string; tried: string[]; cookies?: string }> {
  const tried: string[] = [];
  let lastError: unknown;
  let cookies = opts.cookies || undefined;
  const payloads = bodyVariants ?? [body];
  const fatal = new Set(opts.fatalStatuses ?? []);

  for (const path of paths) {
    for (const payload of payloads) {
      tried.push(`${path} :: ${JSON.stringify(payload).slice(0, 80)}`);
      try {
        const result = await platonusFetch(path, {
          ...opts,
          cookies,
          method: "POST",
          body: payload,
        });
        cookies = result.cookies || cookies;
        if (isUselessPayload(result.data)) {
          lastError = new Error(`Useless payload from ${path}`);
          continue;
        }
        return { ...result, tried, cookies };
      } catch (err) {
        lastError = err;
        if (err instanceof PlatonusHttpError) {
          const c = (err as PlatonusHttpError & { cookies?: string }).cookies;
          if (c) cookies = c;
        }
        if (err instanceof PlatonusHttpError && fatal.has(err.status)) {
          throw err;
        }
      }
    }
  }

  throw Object.assign(
    new Error(opts.failMessage || "Не удалось найти рабочий эндпоинт Platonus"),
    { tried, cause: lastError, cookies },
  );
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
export async function warmPlatonusSession(
  opts: Pick<RequestOptions, "baseUrl" | "lang" | "cookies" | "clientId">,
): Promise<string> {
  const jar: CookieSession = { cookies: opts.cookies || undefined };
  for (const path of ["rest/api/version", "rest/api/authType"]) {
    try {
      await platonusFetchJar(
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
