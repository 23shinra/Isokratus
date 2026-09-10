export type University = {
  id: string;
  name: string;
  city: string;
  url: string;
  /** Extra search tokens: short names, kazakh, latin */
  aliases: string[];
};

/**
 * Known university portals (KZ). Search matches name / city / aliases / host.
 * Easy to extend — add { name, city, url, aliases }.
 */
export const UNIVERSITIES: University[] = [
  {
    id: "alt",
    name: "ALT University",
    city: "Алматы",
    url: "https://platonus.alt.edu.kz",
    aliases: [
      "алт",
      "alt",
      "alt university",
      "академия логистики и транспорта",
      "академия логистики",
      "логистика и транспорт",
      "транспорт",
      "логистика",
    ],
  },
  {
    id: "aues",
    name: "АУЭС / AUES",
    city: "Алматы",
    url: "https://edu.aues.kz",
    aliases: [
      "ауэс",
      "aues",
      "алматинский университет энергетики и связи",
      "университет энергетики и связи",
      "энергетики и связи",
      "энергетики",
      "связи",
      "almaty university of power engineering and telecommunications",
      "almaty university of power",
    ],
  },
  {
    id: "kaznmu",
    name: "КазНМУ им. Асфендиярова",
    city: "Алматы",
    url: "https://platonus.kaznmu.edu.kz",
    aliases: [
      "казнму",
      "kaznmu",
      "асфендияров",
      "асфендиаров",
      "asfendiyarov",
      "медуниверситет",
      "медицинский университет",
      "казахский национальный медицинский университет",
      "казахский национальный медицинский университет имени с.д. асфендиярова",
      "kazakh national medical university",
      "s.d. asfendiyarov",
    ],
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9әіңғүұқөһ\s.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchUniversities(query: string, limit = 8): University[] {
  const q = normalize(query);
  if (!q) return UNIVERSITIES.slice(0, limit);

  const scored = UNIVERSITIES.map((uni) => {
    const hay = normalize(
      [uni.name, uni.city, uni.url, ...uni.aliases].join(" "),
    );
    let score = 0;
    if (hay.includes(q)) score += 10;
    for (const part of q.split(" ")) {
      if (!part) continue;
      if (hay.includes(part)) score += 3;
      if (normalize(uni.name).startsWith(part)) score += 4;
      if (uni.aliases.some((a) => normalize(a).startsWith(part))) score += 5;
    }
    return { uni, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.uni.name.localeCompare(b.uni.name, "ru"));

  return scored.slice(0, limit).map((x) => x.uni);
}

export function findUniversityByUrl(url: string): University | undefined {
  const host = url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return UNIVERSITIES.find(
    (u) =>
      u.url.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase() === host,
  );
}
