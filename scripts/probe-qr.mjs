#!/usr/bin/env node
/**
 * Probe Platonus QR attendance endpoints.
 *
 * Sends the scanned QR to candidate paths × payload shapes and classifies
 * responses into the 3 business outcomes the Student app can show:
 *   - success  — отмечено / успешно
 *   - expired  — просрочен
 *   - already  — уже отмечен
 *
 * A hit on ANY of these means we found the real endpoint (even if the QR
 * itself is dead). 404 / HTML / empty noise is ignored.
 *
 * Usage:
 *   node scripts/probe-qr.mjs \
 *     --base https://platonus.alt.edu.kz \
 *     --token 'YOUR_TOKEN' \
 *     --qr '{"code":"...","action":"journalAttendance"}'
 *
 * Optional:
 *   --cookies 'JSESSIONID=...; XSRF-TOKEN=...'
 *   --sid ... --uid ... --clientId ...
 *   --login STUDENT --password SECRET   (login first, then probe)
 *   --fast                              (only primary payload × all paths)
 *   --out /tmp/qr-probe.json
 *
 * Env aliases: BASE, TOKEN, QR, COOKIES, SID, UID, CLIENT_ID, LOGIN, PASSWORD
 */

"use strict";

const PATHS = [
  "rest/mobile/journalAttendance",
  "rest/api/journalAttendance",
  "rest/journalAttendance",
  "rest/mobile/journal/attendance",
  "rest/api/journal/attendance",
  "rest/journal/attendance",
  "rest/mobile/qr/journalAttendance",
  "rest/api/qr/journalAttendance",
  "rest/qr/journalAttendance",
  "rest/mobile/journalAttendance/mark",
  "rest/api/journalAttendance/mark",
  "rest/mobile/journal/attendance/mark",
  "rest/api/journal/attendance/mark",
  "rest/mobile/qr/attendance",
  "rest/api/qr/attendance",
  "rest/qr/attendance",
  "rest/mobile/attendance/qr",
  "rest/api/attendance/qr",
  "rest/attendance/qr",
  "rest/mobile/qrAttendance/mark",
  "rest/api/qrAttendance/mark",
  "rest/qrAttendance/mark",
  "rest/attendance/markByQrCode",
  "rest/api/attendance/markByQrCode",
  "rest/mobile/attendance/markByQrCode",
  "rest/attendanceByQr/markAttendance",
  "rest/api/attendanceByQr/markAttendance",
  "rest/mobile/attendanceByQr/markAttendance",
  "rest/qr/markAttendance",
  "rest/api/qr/markAttendance",
  "rest/mobile/qr/markAttendance",
  "rest/mobile/attendance/mark",
  "rest/api/attendance/mark",
  "rest/attendance/mark",
  "rest/mobile/markAttendance",
  "rest/api/markAttendance",
  "rest/markAttendance",
];

/** @param {string} raw */
function buildPayloads(raw, fast) {
  const text = raw.trim();
  const variants = [];
  let parsed = null;
  if (text.startsWith("{")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (parsed?.code) {
    const action = parsed.action || "journalAttendance";
    variants.push({ code: parsed.code, action });
    if (!fast) {
      variants.push({ code: parsed.code, action: "journalAttendance" });
      variants.push({ qrCode: parsed.code, action });
      variants.push({ data: parsed.code, action });
      variants.push({ qrCode: parsed.code });
      variants.push({ code: parsed.code });
      variants.push(parsed);
    }
  } else if (!fast) {
    variants.push({ code: text, action: "journalAttendance" });
    variants.push({ qrCode: text, action: "journalAttendance" });
    variants.push({ qrCode: text });
    variants.push({ code: text });
    variants.push({ data: text });
    variants.push(text);
  } else {
    variants.push({ code: text, action: "journalAttendance" });
  }

  // de-dupe
  const seen = new Set();
  return variants.filter((v) => {
    const key = typeof v === "string" ? v : JSON.stringify(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {unknown} data */
function bodyText(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/**
 * Classify into one of the 3 Platonus QR business replies.
 * @returns {"success"|"expired"|"already"|null}
 */
function classify(data, status) {
  const t = bodyText(data);
  if (!t || /<!DOCTYPE html>/i.test(t)) return null;

  const lower = t.toLowerCase();

  // Order matters: "уже отмечен" before bare "отмечен/успеш"
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
    /attendance\s+(ok|marked|success)/i.test(lower) ||
    (status >= 200 &&
      status < 300 &&
      typeof data === "object" &&
      data !== null &&
      ("success" in /** @type {object} */ (data) ||
        /** @type {{ok?: unknown}} */ (data).ok === true ||
        /** @type {{status?: unknown}} */ (data).status === "ok"))
  ) {
    return "success";
  }

  // Some builds return plain { message: "..." } / { result: "..." }
  if (typeof data === "object" && data !== null) {
    const row = /** @type {Record<string, unknown>} */ (data);
    for (const key of ["message", "msg", "result", "error", "description", "text"]) {
      const nested = classify(row[key], status);
      if (nested) return nested;
    }
  }

  return null;
}

function parseArgs(argv) {
  /** @type {Record<string, string|boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fast") {
      out.fast = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "1";
      out[key] = val;
    }
  }
  return out;
}

function normalizeBase(url) {
  const trimmed = String(url).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

function parseCookieHeader(raw) {
  /** @type {Record<string, string>} */
  const map = {};
  if (!raw) return map;
  for (const part of String(raw).split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    map[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return map;
}

function mergeSetCookie(existing, setCookie) {
  const map = parseCookieHeader(existing);
  for (const line of setCookie || []) {
    const first = line.split(";", 1)[0];
    const idx = first.indexOf("=");
    if (idx <= 0) continue;
    const name = first.slice(0, idx).trim();
    const value = first.slice(idx + 1).trim();
    if (!value || /^deleted$/i.test(value)) delete map[name];
    else map[name] = value;
  }
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function buildHeaders({ token, sid, uid, clientId, cookies, lang = "ru" }) {
  /** @type {Record<string, string>} */
  const out = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": lang === "kz" ? "kk" : lang,
  };
  if (token && String(token).length > 10) out.token = String(token);
  if (sid && String(sid) !== "null") out.sid = String(sid);
  if (uid && String(uid) !== "null") out.uid = String(uid);
  if (clientId && String(clientId) !== "null") out.clientId = String(clientId);

  const jar = parseCookieHeader(cookies);
  if (sid && String(sid) !== "null") jar.sid = String(sid);
  const cookieHeader = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  if (cookieHeader) out.Cookie = cookieHeader;
  const xsrf = jar["XSRF-TOKEN"] || jar["Xsrf-Token"];
  if (xsrf) out["X-XSRF-TOKEN"] = xsrf;
  return out;
}

async function postJson(baseUrl, path, body, auth) {
  const root = normalizeBase(baseUrl);
  const url = `${root}/${path.replace(/^\/+/, "")}`;
  const headers = {
    ...buildHeaders(auth),
    Origin: root,
    Referer: `${root}/v7/`,
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const setCookie =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text.slice(0, 800);
    }
  }
  return {
    status: res.status,
    data,
    cookies: mergeSetCookie(auth.cookies, setCookie),
    url,
  };
}

async function login(baseUrl, loginName, password, lang = "ru") {
  const root = normalizeBase(baseUrl);
  let cookies = "";
  // warm
  for (const path of ["rest/api/version", "rest/api/authType"]) {
    try {
      const res = await fetch(`${root}/${path}`, {
        headers: { Accept: "*/*", Origin: root, Referer: `${root}/v7/` },
      });
      const sc =
        typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
      cookies = mergeSetCookie(cookies, sc);
    } catch {
      // ignore
    }
  }

  const auth = { cookies, lang, clientId: "1" };
  const candidates = [
    ["rest/api/login", { login: loginName, password }],
    ["rest/mobile/login", { login: loginName, password }],
    ["rest/login", { login: loginName, password }],
  ];

  for (const [path, body] of candidates) {
    const r = await postJson(baseUrl, path, body, auth);
    auth.cookies = r.cookies;
    const row = r.data && typeof r.data === "object" ? /** @type {any} */ (r.data) : null;
    const token =
      row?.token || row?.auth_token || row?.authToken || row?.data?.token || null;
    if (r.status >= 200 && r.status < 300 && token) {
      return {
        token: String(token),
        cookies: r.cookies,
        sid: row.sid != null ? String(row.sid) : undefined,
        uid: row.uid != null ? String(row.uid) : row.userId != null ? String(row.userId) : undefined,
        clientId: row.clientId != null ? String(row.clientId) : "1",
        raw: row,
      };
    }
  }
  throw new Error("Login failed — check --login/--password/--base");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = String(args.base || process.env.BASE || "").trim();
  const qr = String(args.qr || process.env.QR || "").trim();
  const fast = Boolean(args.fast);
  const outPath = args.out ? String(args.out) : null;

  if (!base || !qr) {
    console.error(`Usage:
  node scripts/probe-qr.mjs --base https://platonus.alt.edu.kz --token TOKEN --qr '{"code":"...","action":"journalAttendance"}'
  node scripts/probe-qr.mjs --base ... --login USER --password PASS --qr '...'
  node scripts/probe-qr.mjs --base ... --token ... --qr ... --fast --out /tmp/hits.json`);
    process.exit(1);
  }

  /** @type {any} */
  let auth = {
    token: args.token || process.env.TOKEN || "",
    cookies: args.cookies || process.env.COOKIES || "",
    sid: args.sid || process.env.SID || "",
    uid: args.uid || process.env.UID || "",
    clientId: args.clientId || process.env.CLIENT_ID || "1",
    lang: args.lang || "ru",
  };

  const loginName = args.login || process.env.LOGIN;
  const password = args.password || process.env.PASSWORD;
  if ((!auth.token || auth.token.length < 10) && loginName && password) {
    console.log("→ login…");
    const sess = await login(base, String(loginName), String(password), auth.lang);
    auth = { ...auth, ...sess };
    console.log(`  token ok (${auth.token.slice(0, 8)}…)`);
  }

  if (!auth.token || auth.token.length < 10) {
    console.error("Need --token or --login/--password");
    process.exit(1);
  }

  const payloads = buildPayloads(qr, fast);
  console.log(`Base: ${normalizeBase(base)}`);
  console.log(`Paths: ${PATHS.length} · payloads: ${payloads.length} · total tries: ${PATHS.length * payloads.length}`);
  console.log("Looking for: success | expired(просрочен) | already(уже отмечен)\n");

  /** @type {Array<{kind:string,status:number,path:string,payload:unknown,data:unknown,url:string}>} */
  const hits = [];
  /** @type {Array<{status:number,path:string,payload:unknown,snippet:string}>} */
  const interesting = [];

  let n = 0;
  const total = PATHS.length * payloads.length;

  for (const path of PATHS) {
    for (const payload of payloads) {
      n += 1;
      process.stdout.write(`\r[${n}/${total}] ${path}          `);
      try {
        const r = await postJson(base, path, payload, auth);
        auth.cookies = r.cookies || auth.cookies;

        const kind = classify(r.data, r.status);
        if (kind) {
          hits.push({
            kind,
            status: r.status,
            path,
            payload,
            data: r.data,
            url: r.url,
          });
          process.stdout.write("\n");
          console.log(`★ HIT [${kind}] HTTP ${r.status}  ${path}`);
          console.log(`  payload: ${JSON.stringify(payload).slice(0, 160)}`);
          console.log(`  body:    ${bodyText(r.data).slice(0, 240)}`);
          console.log("");
        } else {
          const snip = bodyText(r.data).slice(0, 120).replace(/\s+/g, " ");
          // keep non-HTML non-empty oddities for review
          if (
            snip &&
            !/<!DOCTYPE html>/i.test(snip) &&
            !/Whitelabel Error|Not Found|404/i.test(snip) &&
            r.status !== 404 &&
            r.status !== 405
          ) {
            interesting.push({
              status: r.status,
              path,
              payload,
              snippet: snip,
            });
          }
        }
      } catch (err) {
        // network blip — continue
        process.stdout.write("\n");
        console.warn(`  ! ${path}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  process.stdout.write("\n");

  const byKind = {
    success: hits.filter((h) => h.kind === "success"),
    expired: hits.filter((h) => h.kind === "expired"),
    already: hits.filter((h) => h.kind === "already"),
  };

  console.log("════════ SUMMARY ════════");
  console.log(`success (успешно):     ${byKind.success.length}`);
  console.log(`expired (просрочен):   ${byKind.expired.length}`);
  console.log(`already (уже отмечен): ${byKind.already.length}`);

  if (hits.length) {
    console.log("\nWorking combinations:");
    for (const h of hits) {
      console.log(`  [${h.kind}] ${h.status}  ${h.path}  ::  ${JSON.stringify(h.payload).slice(0, 100)}`);
    }
  } else {
    console.log("\nNo business replies among the 3 variants.");
    if (interesting.length) {
      console.log(`\nOther non-empty replies (${Math.min(interesting.length, 15)} shown):`);
      for (const row of interesting.slice(0, 15)) {
        console.log(`  ${row.status}  ${row.path}  ${row.snippet}`);
      }
    }
  }

  if (outPath) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(
      outPath,
      JSON.stringify({ base: normalizeBase(base), hits, interesting, byKind }, null, 2),
      "utf8",
    );
    console.log(`\nWrote ${outPath}`);
  }

  process.exit(hits.length ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
