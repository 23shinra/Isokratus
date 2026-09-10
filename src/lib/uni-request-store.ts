import { createHash, randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export type UniRequest = {
  id: string;
  universityName: string;
  telegram: string;
  createdAt: string;
  done: boolean;
};

type UniRequestDb = {
  requests: UniRequest[];
};

const DATA_DIR =
  process.env.SOKRATUS_DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "uni-requests.json");

let writeChain: Promise<void> = Promise.resolve();

function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureStore(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, JSON.stringify({ requests: [] }, null, 2), "utf8");
  }
}

async function readDb(): Promise<UniRequestDb> {
  await ensureStore();
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as UniRequestDb;
    if (!parsed || !Array.isArray(parsed.requests)) return { requests: [] };
    return { requests: parsed.requests };
  } catch {
    return { requests: [] };
  }
}

async function writeDb(db: UniRequestDb): Promise<void> {
  await ensureStore();
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

export function normalizeTelegram(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "");
  s = s.replace(/^@+/, "");
  s = s.trim();
  if (!/^[a-zA-Z0-9_]{4,32}$/.test(s)) return null;
  return `@${s}`;
}

export async function createUniRequest(input: {
  universityName: string;
  telegram: string;
}): Promise<UniRequest> {
  const universityName = input.universityName.trim().slice(0, 120);
  const telegram = normalizeTelegram(input.telegram);
  if (!universityName || universityName.length < 2) {
    throw Object.assign(new Error("Укажи название университета"), {
      status: 400,
    });
  }
  if (!telegram) {
    throw Object.assign(new Error("Укажи Telegram (@username)"), {
      status: 400,
    });
  }

  return withStoreLock(async () => {
    const db = await readDb();
    const recent = db.requests.find(
      (r) =>
        !r.done &&
        r.telegram.toLowerCase() === telegram.toLowerCase() &&
        r.universityName.toLowerCase() === universityName.toLowerCase() &&
        Date.now() - new Date(r.createdAt).getTime() < 24 * 60 * 60 * 1000,
    );
    if (recent) return recent;

    const id = createHash("sha256")
      .update(`${randomBytes(8).toString("hex")}::${Date.now()}`)
      .digest("hex")
      .slice(0, 16);

    const row: UniRequest = {
      id,
      universityName,
      telegram,
      createdAt: new Date().toISOString(),
      done: false,
    };
    db.requests.unshift(row);
    // keep last 500
    db.requests = db.requests.slice(0, 500);
    await writeDb(db);
    return row;
  });
}

export async function listUniRequests(): Promise<{
  total: number;
  pending: number;
  requests: UniRequest[];
}> {
  const db = await readDb();
  const requests = db.requests;
  return {
    total: requests.length,
    pending: requests.filter((r) => !r.done).length,
    requests,
  };
}

export async function setUniRequestDone(
  id: string,
  done: boolean,
): Promise<UniRequest | null> {
  return withStoreLock(async () => {
    const db = await readDb();
    const row = db.requests.find((r) => r.id === id);
    if (!row) return null;
    row.done = done;
    await writeDb(db);
    return row;
  });
}
