import { createHmac, timingSafeEqual } from "crypto";

const SECRET =
  process.env.SOKRATUS_ADMIN_SECRET || "sokratus-admin-proof-v1";

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").toLowerCase();
}

export function signAdminProof(
  baseUrl: string,
  personId: string | number,
): string {
  const payload = `${normalizeBase(baseUrl)}::${String(personId).trim()}`;
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function verifyAdminProof(
  proof: string | null | undefined,
  baseUrl: string,
  personId: string | number | null | undefined,
): boolean {
  if (!proof || personId == null || String(personId).trim() === "") return false;
  const expected = signAdminProof(baseUrl, personId);
  try {
    const a = Buffer.from(proof, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
