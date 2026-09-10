import { findUniversityByUrl } from "@/lib/universities";

const STORAGE_KEY = "sokratus-saved-accounts";
const MAX_ACCOUNTS = 5;

export type SavedAccount = {
  id: string;
  baseUrl: string;
  universityName: string;
  login: string;
  /** Device-local only — for one-tap re-login on the same phone. */
  password: string;
  fio?: string;
  lastUsedAt: string;
};

function accountId(baseUrl: string, login: string): string {
  return `${baseUrl.replace(/\/+$/, "").toLowerCase()}::${login.trim().toLowerCase()}`;
}

export function makeAccountId(baseUrl: string, login: string): string {
  return accountId(baseUrl, login);
}

function decodePayload(raw: string): string {
  try {
    if (typeof atob === "function") {
      return decodeURIComponent(escape(atob(raw)));
    }
  } catch {
    // fall through
  }
  return raw;
}

function encodePayload(value: string): string {
  try {
    if (typeof btoa === "function") {
      return btoa(unescape(encodeURIComponent(value)));
    }
  } catch {
    // fall through
  }
  return value;
}

export function readSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<SavedAccount & { passwordEnc?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): SavedAccount | null => {
        const password =
          typeof row.password === "string" && row.password
            ? row.password
            : typeof row.passwordEnc === "string"
              ? decodePayload(row.passwordEnc)
              : "";
        if (!row.baseUrl || !row.login || !password) return null;
        return {
          id: row.id || accountId(row.baseUrl, row.login),
          baseUrl: row.baseUrl,
          universityName:
            row.universityName ||
            findUniversityByUrl(row.baseUrl)?.name ||
            row.baseUrl,
          login: row.login,
          password,
          fio: row.fio,
          lastUsedAt: row.lastUsedAt || new Date(0).toISOString(),
        };
      })
      .filter((x): x is SavedAccount => x != null)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

function writeSavedAccounts(accounts: SavedAccount[]) {
  if (typeof window === "undefined") return;
  try {
    const payload = accounts.slice(0, MAX_ACCOUNTS).map((a) => ({
      id: a.id,
      baseUrl: a.baseUrl,
      universityName: a.universityName,
      login: a.login,
      passwordEnc: encodePayload(a.password),
      fio: a.fio,
      lastUsedAt: a.lastUsedAt,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / private mode
  }
}

export function rememberAccount(input: {
  baseUrl: string;
  universityName: string;
  login: string;
  password: string;
  fio?: string;
}): SavedAccount[] {
  const id = accountId(input.baseUrl, input.login);
  const next: SavedAccount = {
    id,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    universityName: input.universityName,
    login: input.login.trim(),
    password: input.password,
    fio: input.fio?.trim() || undefined,
    lastUsedAt: new Date().toISOString(),
  };
  const rest = readSavedAccounts().filter((a) => a.id !== id);
  const list = [next, ...rest].slice(0, MAX_ACCOUNTS);
  writeSavedAccounts(list);
  return list;
}

export function removeSavedAccount(id: string): SavedAccount[] {
  const list = readSavedAccounts().filter((a) => a.id !== id);
  writeSavedAccounts(list);
  return list;
}

export function accountInitials(account: SavedAccount): string {
  const short = formatDisplayName(account.fio) || account.login || "?";
  const parts = short.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return short.slice(0, 2).toUpperCase();
}

/**
 * FIO is usually «Фамилия Имя Отчество».
 * For UI we show «Имя Фамилия».
 */
export function formatDisplayName(fio?: string | null): string {
  const parts = String(fio || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return parts[0] || "";
}

function normBase(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

/** Match a saved password for the active session (silent re-login). */
export function findCredentialsForSession(session: {
  baseUrl: string;
  login?: string;
  fio?: string;
}): SavedAccount | null {
  const accounts = readSavedAccounts().filter(
    (a) => normBase(a.baseUrl) === normBase(session.baseUrl),
  );
  if (!accounts.length) return null;

  if (session.login) {
    const hit = accounts.find(
      (a) => a.login.trim().toLowerCase() === session.login!.trim().toLowerCase(),
    );
    if (hit) return hit;
  }

  if (session.fio) {
    const hit = accounts.find((a) => a.fio && a.fio === session.fio);
    if (hit) return hit;
  }

  // Most recently used account for this university
  return accounts[0] ?? null;
}
