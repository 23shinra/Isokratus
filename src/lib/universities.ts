export type University = {
  id: string;
  name: string;
  city: string;
  url: string;
  /** Extra search tokens: short names, kazakh, latin */
  aliases: string[];
};

/**
 * Known Platonus portals (KZ). Search matches name / city / aliases / host.
 * Easy to extend — add { name, city, url, aliases }.
 */
export const UNIVERSITIES: University[] = [
  {
    id: "alt",
    name: "ALT University",
    city: "Алматы",
    url: "https://platonus.alt.edu.kz",
    aliases: ["алт", "alt", "транспорт", "логистика", "alt university"],
  },
  {
    id: "atu",
    name: "Алматинский технологический университет",
    city: "Алматы",
    url: "https://platonus.atu.kz",
    aliases: ["ату", "atu", "технологический"],
  },
  {
    id: "narxoz",
    name: "Университет Нархоз",
    city: "Алматы",
    url: "https://platonus.narxoz.kz",
    aliases: ["нархоз", "narxoz"],
  },
  {
    id: "iitu",
    name: "МУИТ / IITU",
    city: "Алматы",
    url: "https://platonus.iitu.edu.kz",
    aliases: ["муит", "iitu", "информационных технологий"],
  },
  {
    id: "sdu",
    name: "SDU University",
    city: "Каскелен",
    url: "https://platonus.sdu.edu.kz",
    aliases: ["сду", "sdu", "сулейман демирель"],
  },
  {
    id: "kaznmu",
    name: "КазНМУ им. Асфендиярова",
    city: "Алматы",
    url: "https://platonus.kaznmu.edu.kz",
    aliases: ["казнму", "kaznmu", "медицинский", "асфендияров"],
  },
  {
    id: "kaznai",
    name: "КазНАИ / KazNAI",
    city: "Алматы",
    url: "https://platonus.kaznai.kz",
    aliases: ["назнаи", "kaznai", "аграрный"],
  },
  {
    id: "kaznaru",
    name: "КазНАИУ / KazNARU",
    city: "Алматы",
    url: "https://es.kaznaru.edu.kz",
    aliases: ["назнаиу", "kaznaru", "аграрный исследовательский"],
  },
  {
    id: "auezov",
    name: "ЮКГУ им. Ауэзова",
    city: "Шымкент",
    url: "https://platon.ukgu.kz",
    aliases: ["ауэзов", "юкгу", "ukgu", "шымкент"],
  },
  {
    id: "okmpu",
    name: "ЮКМПУ им. Жәнібекова",
    city: "Шымкент",
    url: "https://platonus.okmpu.kz",
    aliases: ["окмпу", "okmpu", "жанибеков", "zhanibekov", "педагогический"],
  },
  {
    id: "buketov",
    name: "КарУ им. Букетова",
    city: "Караганда",
    url: "https://platonus.buketov.edu.kz",
    aliases: ["букетов", "кару", "buketov", "караганда"],
  },
  {
    id: "bolashaq",
    name: "Академия Bolashaq",
    city: "Караганда",
    url: "https://platonus.bolashaq.edu.kz",
    aliases: ["bolashaq", "болашак"],
  },
  {
    id: "kstu",
    name: "КарТУ им. Абылкаса Сагинова",
    city: "Караганда",
    url: "https://platonus.kstu.kz",
    aliases: ["карту", "kstu", "сагинов", "политех"],
  },
  {
    id: "ksu",
    name: "Костанайский региональный университет",
    city: "Костанай",
    url: "https://platonus.ksu.edu.kz",
    aliases: ["ксу", "ksu", "костанай", "байтурсынов"],
  },
  {
    id: "zhubanov",
    name: "АРУ им. Жубанова",
    city: "Актобе",
    url: "https://platonus.zhubanov.edu.kz",
    aliases: ["жубанов", "ару", "zhubanov", "актобе"],
  },
  {
    id: "vku",
    name: "ВКУ им. Аманжолова",
    city: "Усть-Каменогорск",
    url: "https://platonus.vku.edu.kz",
    aliases: ["вку", "vku", "аманжолов", "усть-каменогорск", "өскемен"],
  },
  {
    id: "shakarim",
    name: "Университет Шакарима",
    city: "Семей",
    url: "https://platonus.shakarim.kz",
    aliases: ["шакарим", "shakarim", "семей"],
  },
  {
    id: "dulaty",
    name: "Таразский региональный университет им. Дулати",
    city: "Тараз",
    url: "https://platonus.dulaty.kz",
    aliases: ["дулати", "dulaty", "тараз"],
  },
  {
    id: "tashenev",
    name: "Университет им. Тәшенева",
    city: "Шымкент",
    url: "https://platonus.tashenev.kz",
    aliases: ["ташенев", "tashenev"],
  },
  {
    id: "qyzpu",
    name: "ҚазҰПУ / KazNPU",
    city: "Алматы",
    url: "https://platonus.qyzpu.edu.kz",
    aliases: ["казнпу", "qyzpu", "абай", "педагогический"],
  },
  {
    id: "kaztbu",
    name: "КазТБУ",
    city: "Алматы",
    url: "https://platonus.kaztbu.edu.kz",
    aliases: ["казтбу", "kaztbu", "трудовой"],
  },
  {
    id: "htu",
    name: "Международный университет туризма и гостеприимства",
    city: "Туркестан",
    url: "https://platonus.htu.kz",
    aliases: ["htu", "туризм", "туркестан"],
  },
  {
    id: "esil",
    name: "Esil University",
    city: "Астана",
    url: "https://pl.esil.edu.kz",
    aliases: ["есиль", "esil", "астана"],
  },
  {
    id: "tau",
    name: "Университет Туран-Астана",
    city: "Астана",
    url: "https://platonus.tau-edu.kz",
    aliases: ["туран", "tau", "туран-астана"],
  },
  {
    id: "ineu",
    name: "Инновационный Евразийский университет",
    city: "Павлодар",
    url: "https://ais.ineu.edu.kz",
    aliases: ["инеу", "ineu", "павлодар", "евраз"],
  },
  {
    id: "udn",
    name: "Университет Дружбы Народов",
    city: "Шымкент",
    url: "https://portal.udn.edu.kz",
    aliases: ["udn", "дружбы народов"],
  },
  {
    id: "keu",
    name: "Карагандинский экономический университет Казпотребсоюза",
    city: "Караганда",
    url: "https://cedu.keu.kz",
    aliases: ["кеу", "keu", "экономический"],
  },
  {
    id: "kaznui-college",
    name: "Колледж КазНУИ",
    city: "Астана",
    url: "https://platonuscollege.kaznui.kz",
    aliases: ["казнуи", "kaznui", "искусств", "колледж"],
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
