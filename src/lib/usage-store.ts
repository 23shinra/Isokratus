import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { findUniversityByUrl } from "@/lib/universities";
import { isAdminFio } from "@/lib/admin";

export type UsageUser = {
  id: string;
  fio: string;
  login: string;
  university: string;
  baseUrl: string;
  personId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  loginCount: number;
};

type UsageDb = {
  users: Record<string, UsageUser>;
};

const DATA_DIR =
  process.env.SOKRATUS_DATA_DIR || path.join(process.cwd(), "data");
const USAGE_FILE = path.join(DATA_DIR, "usage.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");

export { isAdminFio };

/** Serialize all usage/admin file mutations — avoid lost updates under concurrent logins. */
let writeChain: Promise<void> = Promise.resolve();

function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function usageUserId(
  baseUrl: string,
  login: string,
  personId?: string | null,
): string {
  const base = normalizeBase(baseUrl);
  if (personId && String(personId).trim()) {
    return createHash("sha256")
      .update(`${base}::pid::${String(personId).trim()}`)
      .digest("hex")
      .slice(0, 24);
  }
  const raw = `${base}::${login.trim().toLowerCase()}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").toLowerCase();
}

export function adminIdentityKey(baseUrl: string, personId: string): string {
  return `${normalizeBase(baseUrl)}::${String(personId).trim()}`;
}

type AdminsDb = { keys: string[] };

async function readAdmins(): Promise<AdminsDb> {
  await ensureStore();
  try {
    const raw = await fs.readFile(ADMINS_FILE, "utf8");
    const parsed = JSON.parse(raw) as AdminsDb;
    if (!parsed || !Array.isArray(parsed.keys)) return { keys: [] };
    return { keys: parsed.keys.map(String) };
  } catch {
    return { keys: [] };
  }
}

async function writeAdmins(db: AdminsDb): Promise<void> {
  await ensureStore();
  const tmp = `${ADMINS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, ADMINS_FILE);
}

/** Persist admin personId after a successful LMS-verified login. */
export async function rememberAdmin(input: {
  baseUrl: string;
  personId?: string | number | null;
  fio?: string | null;
}): Promise<void> {
  return withStoreLock(async () => {
    const personId =
      input.personId != null && String(input.personId).trim() !== ""
        ? String(input.personId).trim()
        : "";
    if (!personId || !isAdminFio(input.fio)) return;

    const key = adminIdentityKey(input.baseUrl, personId);
    const db = await readAdmins();
    if (db.keys.includes(key)) return;
    db.keys.push(key);
    await writeAdmins(db);
  });
}

export async function isRememberedAdmin(
  baseUrl: string,
  personId: string | number | null | undefined,
): Promise<boolean> {
  if (personId == null || String(personId).trim() === "") return false;
  const key = adminIdentityKey(baseUrl, String(personId));
  const db = await readAdmins();
  return db.keys.includes(key);
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(
      USAGE_FILE,
      JSON.stringify({ users: {} }, null, 2),
      "utf8",
    );
  }
}

async function readDb(): Promise<UsageDb> {
  await ensureStore();
  try {
    const raw = await fs.readFile(USAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as UsageDb;
    if (!parsed || typeof parsed !== "object" || !parsed.users) {
      return { users: {} };
    }
    return parsed;
  } catch {
    return { users: {} };
  }
}

async function writeDb(db: UsageDb): Promise<void> {
  await ensureStore();
  const tmp = `${USAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, USAGE_FILE);
}

function findUserId(
  db: UsageDb,
  baseUrl: string,
  login: string,
  personId?: string | null,
): string {
  const base = normalizeBase(baseUrl);
  if (personId && String(personId).trim()) {
    const pid = String(personId).trim();
    const byPid = Object.values(db.users).find(
      (u) =>
        u.personId === pid && normalizeBase(u.baseUrl) === base,
    );
    if (byPid) return byPid.id;
    return usageUserId(baseUrl, login || pid, pid);
  }
  if (login) {
    const byLogin = Object.values(db.users).find(
      (u) =>
        normalizeBase(u.baseUrl) === base &&
        u.login.trim().toLowerCase() === login.trim().toLowerCase(),
    );
    if (byLogin) return byLogin.id;
    return usageUserId(baseUrl, login);
  }
  return usageUserId(baseUrl, "unknown");
}

function resolveUniversity(
  baseUrl: string,
  universityName?: string,
  prev?: string,
): string {
  return (
    universityName?.trim() ||
    prev ||
    findUniversityByUrl(baseUrl)?.name ||
    baseUrl.replace(/^https?:\/\//, "")
  );
}

export async function recordUsageLogin(input: {
  baseUrl: string;
  login: string;
  fio?: string;
  universityName?: string;
  personId?: string | number;
  /** Silent re-auth: upsert user but don't inflate loginCount every 20s. */
  silent?: boolean;
}): Promise<void> {
  return withStoreLock(async () => {
    const login = String(input.login || "").trim();
    const baseUrl = String(input.baseUrl || "").replace(/\/+$/, "");
    const personId =
      input.personId != null && String(input.personId) !== ""
        ? String(input.personId)
        : undefined;
    if (!baseUrl || (!login && !personId)) return;

    const db = await readDb();
    const resolvedId = findUserId(
      db,
      baseUrl,
      login || personId || "unknown",
      personId,
    );
    const prev = db.users[resolvedId];

    let legacy: UsageUser | undefined;
    if (personId && login) {
      const legacyId = usageUserId(baseUrl, login);
      if (legacyId !== resolvedId && db.users[legacyId]) {
        legacy = db.users[legacyId];
        delete db.users[legacyId];
      }
    }

    const mergedPrev = prev || legacy;
    const now = new Date().toISOString();
    const fio =
      (input.fio || mergedPrev?.fio || login || personId || "—").trim() || "—";

    let loginCount = mergedPrev?.loginCount || 0;
    if (!input.silent) {
      loginCount += 1;
    } else if (!mergedPrev) {
      loginCount = 1;
    }

    db.users[resolvedId] = {
      id: resolvedId,
      fio,
      login: login || mergedPrev?.login || personId || "—",
      university: resolveUniversity(
        baseUrl,
        input.universityName,
        mergedPrev?.university,
      ),
      baseUrl,
      personId: personId || mergedPrev?.personId,
      firstSeenAt: mergedPrev?.firstSeenAt || now,
      lastSeenAt: now,
      loginCount,
    };

    await writeDb(db);
    await rememberAdminUnlocked({
      baseUrl,
      personId: db.users[resolvedId].personId,
      fio,
    });
  });
}

/** Avoid nested lock when already inside withStoreLock. */
async function rememberAdminUnlocked(input: {
  baseUrl: string;
  personId?: string | number | null;
  fio?: string | null;
}): Promise<void> {
  const personId =
    input.personId != null && String(input.personId).trim() !== ""
      ? String(input.personId).trim()
      : "";
  if (!personId || !isAdminFio(input.fio)) return;

  const key = adminIdentityKey(input.baseUrl, personId);
  const db = await readAdmins();
  if (db.keys.includes(key)) return;
  db.keys.push(key);
  await writeAdmins(db);
}

/** Activity ping from schedule/journal — catches users who stay logged in. */
export async function touchUsagePerson(input: {
  baseUrl: string;
  personId?: string | number | null;
  login?: string;
  fio?: string;
  universityName?: string;
}): Promise<void> {
  return withStoreLock(async () => {
    const baseUrl = String(input.baseUrl || "").replace(/\/+$/, "");
    const personId =
      input.personId != null && String(input.personId).trim() !== ""
        ? String(input.personId).trim()
        : "";
    const login = String(input.login || "").trim();
    if (!baseUrl || (!personId && !login)) return;

    const db = await readDb();
    const id = findUserId(db, baseUrl, login || personId, personId || null);
    const prev = db.users[id];
    const now = new Date().toISOString();

    if (!prev) {
      db.users[id] = {
        id,
        fio: (input.fio || login || `ID ${personId}`).trim(),
        login: login || personId || "—",
        university: resolveUniversity(baseUrl, input.universityName),
        baseUrl,
        personId: personId || undefined,
        firstSeenAt: now,
        lastSeenAt: now,
        loginCount: 1,
      };
    } else {
      db.users[id] = {
        ...prev,
        fio: input.fio?.trim() || prev.fio,
        login: login || prev.login,
        personId: personId || prev.personId,
        university: resolveUniversity(
          baseUrl,
          input.universityName,
          prev.university,
        ),
        lastSeenAt: now,
      };
    }
    await writeDb(db);
  });
}

export async function touchUsage(input: {
  baseUrl: string;
  login: string;
  fio?: string;
  universityName?: string;
  personId?: string | number;
}): Promise<void> {
  return touchUsagePerson(input);
}

export async function listUsageUsers(): Promise<{
  total: number;
  users: UsageUser[];
}> {
  const db = await readDb();
  const users = Object.values(db.users).sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt),
  );
  return { total: users.length, users };
}
