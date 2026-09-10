import { makeAccountId } from "@/lib/saved-accounts";

const STORAGE_KEY = "sokratus-avatars";

type AvatarMap = Record<string, string>;

function readMap(): AvatarMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AvatarMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map: AvatarMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota — drop oldest-ish (insertion order not guaranteed); keep 3
    try {
      const entries = Object.entries(map);
      const trimmed = Object.fromEntries(entries.slice(-3));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // give up
    }
  }
}

export function readCachedAvatar(accountId: string): string | null {
  const url = readMap()[accountId];
  return typeof url === "string" && url.startsWith("data:image") ? url : null;
}

export function readCachedAvatarForSession(session: {
  baseUrl: string;
  login?: string;
}): string | null {
  if (!session.login) return null;
  return readCachedAvatar(makeAccountId(session.baseUrl, session.login));
}

/** Shrink remote/data avatar to a small JPEG for stable localStorage cache. */
export function shrinkAvatarDataUrl(
  source: string,
  size = 96,
  quality = 0.82,
): Promise<string> {
  if (typeof window === "undefined") return Promise.resolve(source);

  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(source);
          return;
        }
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.max(size / iw, size / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (size - dw) / 2;
        const dy = (size - dh) / 2;
        ctx.fillStyle = "#1a1c22";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, dx, dy, dw, dh);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(source);
      }
    };
    img.onerror = () => resolve(source);
    img.src = source;
  });
}

export async function cacheAvatar(
  accountId: string,
  sourceUrl: string,
): Promise<string> {
  const small = await shrinkAvatarDataUrl(sourceUrl);
  const map = readMap();
  map[accountId] = small;
  writeMap(map);
  return small;
}

export async function cacheAvatarForAccount(
  baseUrl: string,
  login: string,
  sourceUrl: string,
): Promise<string> {
  return cacheAvatar(makeAccountId(baseUrl, login), sourceUrl);
}

export function clearCachedAvatar(accountId: string) {
  const map = readMap();
  if (!(accountId in map)) return;
  delete map[accountId];
  writeMap(map);
}
