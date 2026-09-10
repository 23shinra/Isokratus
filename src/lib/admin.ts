/** Client + server safe admin gate for Serik. */
const ADMIN_FIO_TOKENS = (
  typeof process !== "undefined" && process.env.SOKRATUS_ADMIN_FIO
    ? process.env.SOKRATUS_ADMIN_FIO
    : "камидов серик"
)
  .toLowerCase()
  .split(/[\s,;|]+/)
  .map((s) => s.trim())
  .filter(Boolean);

function normalizeFio(fio: string): string {
  return fio
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-яәғқңөұүһі\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAdminFio(fio: string | null | undefined): boolean {
  if (!fio || !ADMIN_FIO_TOKENS.length) return false;
  const n = normalizeFio(fio);
  return ADMIN_FIO_TOKENS.every((token) => n.includes(token));
}
