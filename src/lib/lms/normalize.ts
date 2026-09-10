import type { JournalRecord, JournalSubject, ScheduleLesson } from "./types";

const DAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

const NESTED_LIST_KEYS = [
  "data",
  "list",
  "items",
  "schedule",
  "lessons",
  "subjects",
  "records",
  "journal",
  "result",
  "markList",
  "marks",
  "grades",
  "currentMarks",
  "journalRecords",
  "studentMarks",
  "occupationMarks",
  "markHistory",
  "values",
];

function asArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of NESTED_LIST_KEYS) {
      if (Array.isArray(obj[key])) {
        return asArray(obj[key]);
      }
    }
    // day-keyed object: { "1": [...], "2": [...] }
    const dayBuckets = Object.entries(obj).filter(([k, v]) => /^\d+$/.test(k) && Array.isArray(v));
    if (dayBuckets.length) {
      return dayBuckets.flatMap(([day, list]) =>
        (list as Record<string, unknown>[]).map((item) => ({ ...item, _day: Number(day) })),
      );
    }
  }
  return [];
}

function pickString(row: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return fallback;
}

function pickNumber(row: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = row[key];
    const n = Number(value);
    if (!Number.isNaN(n) && value !== undefined && value !== null && value !== "") {
      return n;
    }
  }
  return fallback;
}

function isPresentMark(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const s = String(value).trim();
  if (!s || s === "-" || s === "—" || s === "null" || s === "undefined") return false;
  return true;
}

function formatDate(value: string): string {
  if (!value) return "";
  // already dd.mm.yyyy
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(value)) return value.slice(0, 10);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  }
  return value;
}

function sliceTime(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  // "08:30:00" → "08:30"
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Day keys are 1=Mon … 7=Sun. Cell.weekDay is often 0 — ignore it. */
function dayFromTimetableKey(dayKey: string): number {
  const n = Number(dayKey);
  if (Number.isNaN(n)) return 0;
  if (n >= 1 && n <= 7) return n;
  // rare 0-indexed array serialization
  if (n === 0) return 1;
  if (n >= 0 && n <= 6) return n + 1;
  return 0;
}

/**
 * LMS `/rest/schedule/userSchedule/student/*` payload:
 * timetable.days[dayId].lessons[pairNumber] = { lessons: [ { subjectName, … } ] }
 * Day comes from the map key (1–6/7), times from lessonHours[number].
 */
export function normalizeUserSchedule(data: unknown): ScheduleLesson[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const timetable = root.timetable;
  if (!timetable || typeof timetable !== "object") return [];

  const hourMap = new Map<number, { start: string; finish: string }>();
  if (Array.isArray(root.lessonHours)) {
    for (const item of root.lessonHours) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const num = Number(row.number ?? row.displayNumber);
      if (Number.isNaN(num)) continue;
      const start = sliceTime(row.start ?? row.startTime);
      const finish = sliceTime(row.finish ?? row.endTime ?? row.finishTime);
      hourMap.set(num, { start, finish });
      if (row.displayNumber != null) {
        const d = Number(row.displayNumber);
        if (!Number.isNaN(d)) hourMap.set(d, { start, finish });
      }
    }
  }

  const daysRaw = (timetable as Record<string, unknown>).days;
  if (!daysRaw || typeof daysRaw !== "object") return [];

  // Support both object map and array
  const dayEntries: Array<[string, unknown]> = Array.isArray(daysRaw)
    ? daysRaw.map((v, i) => [String(i + 1), v])
    : Object.entries(daysRaw as Record<string, unknown>);

  const out: ScheduleLesson[] = [];
  let index = 0;

  for (const [dayKey, dayVal] of dayEntries) {
    const dayNum = dayFromTimetableKey(dayKey);
    if (!dayNum || !dayVal || typeof dayVal !== "object") continue;

    const dayObj = dayVal as Record<string, unknown>;
    const pairMap = dayObj.lessons;
    if (!pairMap || typeof pairMap !== "object") continue;

    const pairEntries: Array<[string, unknown]> = Array.isArray(pairMap)
      ? pairMap.map((v, i) => [String(i + 1), v])
      : Object.entries(pairMap as Record<string, unknown>);

    for (const [pairKey, pairVal] of pairEntries) {
      if (!pairVal || typeof pairVal !== "object") continue;
      const pair = pairVal as Record<string, unknown>;
      const pairNum = Number(pairKey);
      const hourNum = Number(pair.number ?? pair.lessonHour ?? pairNum);
      const times =
        hourMap.get(hourNum) ??
        hourMap.get(pairNum) ??
        ({
          start: sliceTime(pair.start ?? pair.startTime),
          finish: sliceTime(pair.finish ?? pair.endTime ?? pair.finishTime),
        } as { start: string; finish: string });

      const dayIndex = Math.min(Math.max(dayNum, 1), 7) - 1;
      const lessons = Array.isArray(pair.lessons)
        ? pair.lessons
        : Array.isArray(pair)
          ? pair
          : [];

      // Empty slot placeholder
      if (!lessons.length) {
        // Sometimes the pair itself IS the lesson (flat)
        const subjectFlat = pickString(
          pair,
          ["subjectName", "studyGroupName", "studygroupShortName", "name"],
          "",
        );
        if (!subjectFlat || pair.empty === true) continue;
        const building = pickString(pair, ["building", "buildingName"], "");
        const auditory = pickString(pair, ["auditory", "auditorium", "room"], "");
        out.push({
          id: pickString(pair, ["lessonID", "id", "ID"], String(index)),
          day: dayNum,
          dayName: DAY_NAMES[dayIndex],
          startTime: times.start || sliceTime(pair.start ?? pair.startTime),
          endTime: times.finish || sliceTime(pair.finish ?? pair.endTime),
          subject: cleanSubjectName(subjectFlat) || subjectFlat,
          teacher: pickString(pair, ["tutorName", "tutorShortName", "teacherName", "teacher"], ""),
          room: [building, auditory].filter(Boolean).join(", "),
          type: pickString(pair, ["groupTypeShortName", "groupTypeFullName", "lessonType", "type"], ""),
          group: pickString(pair, ["studyGroupName", "groups", "groupName", "group"], "") || undefined,
        });
        index += 1;
        continue;
      }

      for (const lesson of lessons) {
        if (!lesson || typeof lesson !== "object") continue;
        const row = lesson as Record<string, unknown>;
        if (row.empty === true) continue;

        const subjectRaw = pickString(
          row,
          ["subjectName", "studyGroupName", "studygroupShortName", "name"],
          "",
        );
        if (!subjectRaw) continue;

        const building = pickString(row, ["building", "buildingName"], "");
        const auditory = pickString(row, ["auditory", "auditorium", "room"], "");
        const room = [building, auditory].filter(Boolean).join(", ");
        const online = row.onlineClass === true;

        out.push({
          id: pickString(row, ["lessonID", "id", "ID"], `${dayNum}-${pairKey}-${index}`),
          day: dayNum,
          dayName: DAY_NAMES[dayIndex],
          startTime:
            times.start ||
            sliceTime(row.start ?? row.startTime ?? row.beginTime),
          endTime:
            times.finish ||
            sliceTime(row.finish ?? row.endTime ?? row.finishTime),
          subject: cleanSubjectName(subjectRaw) || subjectRaw,
          teacher: pickString(row, ["tutorName", "tutorShortName", "teacherName", "teacher"], ""),
          room: online ? (room ? `${room} · онлайн` : "Онлайн") : room,
          type: pickString(
            row,
            ["groupTypeShortName", "groupTypeFullName", "lessonType", "type"],
            "",
          ),
          group:
            pickString(row, ["studyGroupName", "groups", "groupName", "group"], "") || undefined,
        });
        index += 1;
      }
    }
  }

  return out;
}

export function normalizeSchedule(data: unknown): ScheduleLesson[] {
  const fromV6 = normalizeUserSchedule(data);
  if (fromV6.length) return fromV6;

  const rows = asArray(data);
  return rows.map((row, index) => {
    const day = pickNumber(row, ["_day", "day", "dayOfWeek", "weekday", "weekDay", "dayNumber"], 1);
    const dayIndex = Math.min(Math.max(day, 1), 7) - 1;
    const building = pickString(row, ["building", "buildingName"], "");
    const auditory = pickString(
      row,
      ["auditorium", "auditory", "room", "classroom", "audience", "place"],
      "",
    );
    return {
      id: pickString(row, ["id", "scheduleID", "lessonID", "ID"], String(index)),
      day,
      dayName: pickString(row, ["dayName", "weekdayName", "dayOfWeekName"], DAY_NAMES[dayIndex]),
      startTime: sliceTime(
        pickString(row, ["startTime", "timeStart", "beginTime", "start", "lessonTime", "time"], ""),
      ),
      endTime: sliceTime(pickString(row, ["endTime", "timeEnd", "finishTime", "finish"], "")),
      subject: cleanSubjectName(
        pickString(
          row,
          ["subjectName", "subject", "discipline", "disciplineName", "name", "lessonName"],
          "Без названия",
        ),
      ),
      teacher: pickString(row, ["tutorName", "teacherName", "teacher", "tutor", "fio"], ""),
      room: [building, auditory].filter(Boolean).join(", ") || auditory,
      type: pickString(
        row,
        ["lessonType", "type", "occupationType", "kind", "groupTypeShortName"],
        "",
      ),
      group: pickString(row, ["groupName", "group", "flow", "studyGroupName"], "") || undefined,
    };
  });
}

/** Known summary fields → human labels (АБ / орт.ағым / рейтинг / емтихан). */
const SUMMARY_FIELD_MAP: Array<{ keys: string[]; title: string; type: string }> = [
  {
    keys: [
      "firstAverageCurrentMark",
      "firstCurrentAverage",
      "firstCurrentAverageMark",
      "averageCurrent1",
      "averageCurrentMark1",
      "currentAverage1",
      "currentAverageMark1",
      "avgCurrent1",
      "currentControl1",
      "firstCurrentControl",
      "firstCurrentControlMark",
      "current1",
      "sr1",
      "SR1",
      "tekushiy1",
      "ortAgym1",
      "average1",
    ],
    title: "Орт.ағым. 1",
    type: "СР",
  },
  {
    keys: [
      "secondAverageCurrentMark",
      "secondCurrentAverage",
      "secondCurrentAverageMark",
      "averageCurrent2",
      "averageCurrentMark2",
      "currentAverage2",
      "currentAverageMark2",
      "avgCurrent2",
      "currentControl2",
      "secondCurrentControl",
      "secondCurrentControlMark",
      "current2",
      "sr2",
      "SR2",
      "tekushiy2",
      "ortAgym2",
      "average2",
    ],
    title: "Орт.ағым. 2",
    type: "СР",
  },
  {
    keys: [
      "firstAttestation",
      "firstAttestationMark",
      "firstRatingMark",
      "firstRating",
      "midterm1",
      "midTerm1",
      "rk1",
      "RK1",
      "r1",
      "ab1",
      "AB1",
      "attestation1",
      "boundary1",
      "firstBoundaryControl",
      "rk1Mark",
      "p1",
      "M1",
    ],
    title: "АБ 1",
    type: "РК",
  },
  {
    keys: [
      "secondAttestation",
      "secondAttestationMark",
      "secondRatingMark",
      "secondRating",
      "midterm2",
      "midTerm2",
      "rk2",
      "RK2",
      "r2",
      "ab2",
      "AB2",
      "attestation2",
      "boundary2",
      "secondBoundaryControl",
      "rk2Mark",
      "p2",
      "M2",
    ],
    title: "АБ 2",
    type: "РК",
  },
  {
    keys: [
      "thirdAttestation",
      "thirdAttestationMark",
      "thirdRatingMark",
      "midterm3",
      "rk3",
      "RK3",
      "ab3",
      "AB3",
    ],
    title: "АБ 3",
    type: "РК",
  },
  {
    keys: [
      "currentMark",
      "currentAverage",
      "currentProgress",
      "averageCurrentMark",
      "srMark",
      "sr",
      "independentWork",
      "currentControl",
      "tekushiy",
      "current",
    ],
    title: "Ср.тек.",
    type: "СР",
  },
  {
    keys: [
      "centerMark",
      "centreMark",
      "averageMark",
      "avgMark",
      "meanMark",
      "middleMark",
      "average",
      "avg",
    ],
    title: "Средний балл",
    type: "Средний",
  },
  {
    keys: ["rating", "ratingMark", "ratingScore", "rd", "admissionRating", "ratingBall"],
    title: "Рейтинг",
    type: "Рейтинг",
  },
  {
    keys: [
      "examMark",
      "exam",
      "examinationMark",
      "finalExam",
      "summative",
      "summativeAssessment",
      "diffTest",
      "differentiatedTest",
      "emt",
      "EMT",
    ],
    title: "Емт.",
    type: "Экзамен",
  },
  {
    keys: ["totalMark", "total", "finalMark", "overallMark", "itogo", "resultMark"],
    title: "Итого",
    type: "Итого",
  },
  {
    keys: ["letterMark", "letter", "markLetter", "traditionalMark", "alphaMark"],
    title: "Буквенная оценка",
    type: "Буква",
  },
  {
    keys: ["gpa", "ects", "creditMark", "ectsMark"],
    title: "GPA",
    type: "GPA",
  },
];

const SKIP_SUMMARY_KEYS = new Set([
  "subjectid",
  "subjectname",
  "tutorname",
  "teachername",
  "teacher",
  "tutor",
  "id",
  "name",
  "title",
  "groupid",
  "groupname",
  "language",
  "lang",
  "year",
  "term",
  "personid",
  "studentid",
  "description",
  "code",
  "subjectcode",
  "disciplinecode",
]);

const FIELD_LABEL_RU: Record<string, string> = {
  firstattestation: "АБ 1",
  firstattestationmark: "АБ 1",
  firstratingmark: "АБ 1",
  firstrating: "АБ 1",
  midterm1: "АБ 1",
  rk1: "АБ 1",
  ab1: "АБ 1",
  secondattestation: "АБ 2",
  secondattestationmark: "АБ 2",
  secondratingmark: "АБ 2",
  secondrating: "АБ 2",
  midterm2: "АБ 2",
  rk2: "АБ 2",
  ab2: "АБ 2",
  thirdattestation: "АБ 3",
  rk3: "АБ 3",
  firstaveragecurrentmark: "Орт.ағым. 1",
  firstcurrentaverage: "Орт.ағым. 1",
  averagecurrent1: "Орт.ағым. 1",
  currentaverage1: "Орт.ағым. 1",
  secondaveragecurrentmark: "Орт.ағым. 2",
  secondcurrentaverage: "Орт.ағым. 2",
  averagecurrent2: "Орт.ағым. 2",
  currentaverage2: "Орт.ағым. 2",
  currentmark: "Ср.тек.",
  currentaverage: "Ср.тек.",
  averagecurrentmark: "Ср.тек.",
  srmark: "Ср.тек.",
  centermark: "Средний балл",
  centremark: "Средний балл",
  averagemark: "Средний балл",
  avgmark: "Средний балл",
  meanmark: "Средний балл",
  middlemark: "Средний балл",
  ratingmark: "Рейтинг",
  rating: "Рейтинг",
  ratingscore: "Рейтинг",
  exammark: "Емт.",
  exam: "Емт.",
  totalmark: "Итого",
  total: "Итого",
  finalmark: "Итого",
  lettermark: "Буквенная оценка",
  letter: "Буквенная оценка",
  gpa: "GPA",
  ects: "ECTS",
  percent: "Процент",
  percentage: "Процент",
};

function humanizeFieldKey(key: string): string {
  const lower = key.toLowerCase();
  if (FIELD_LABEL_RU[lower]) return FIELD_LABEL_RU[lower];
  if (
    /^(rk|r|ab)[_-]?1$/i.test(key) ||
    /first.*attestation|midterm.?1|boundary.?1/i.test(key)
  ) {
    return "АБ 1";
  }
  if (
    /^(rk|r|ab)[_-]?2$/i.test(key) ||
    /second.*attestation|midterm.?2|boundary.?2/i.test(key)
  ) {
    return "АБ 2";
  }
  if (/^(rk|r|ab)[_-]?3$/i.test(key)) return "АБ 3";
  if (/average.*current.?1|current.*average.?1|ort.?agym.?1|ср.?тек.?1/i.test(key)) {
    return "Орт.ағым. 1";
  }
  if (/average.*current.?2|current.*average.?2|ort.?agym.?2|ср.?тек.?2/i.test(key)) {
    return "Орт.ағым. 2";
  }
  if (/center|centre|average|avg|mean|middle/i.test(key)) return "Средний балл";
  if (/current|ср|sr|tekush|ағым/i.test(key)) return "Ср.тек.";
  if (/rating|рейтинг/i.test(key)) return "Рейтинг";
  if (/exam|экзамен|summative|емт/i.test(key)) return "Емт.";
  if (/total|итого|final|result/i.test(key)) return "Итого";
  if (/letter|букв|alpha/i.test(key)) return "Буквенная оценка";
  if (/percent/i.test(key)) return "Процент";
  // Never leave raw English camelCase for the UI
  return "Оценка";
}

function classifyMarkType(title: string, key: string): string {
  const s = `${title} ${key}`.toLowerCase();
  if (/рк\s*1|rk1|first|midterm.?1/.test(s)) return "РК";
  if (/рк\s*2|rk2|second|midterm.?2/.test(s)) return "РК";
  if (/рк\s*3|rk3/.test(s)) return "РК";
  if (/средн|center|centre|average|avg/.test(s)) return "Средний";
  if (/текущ|ср|current|sr/.test(s)) return "СР";
  if (/рейтинг|rating/.test(s)) return "Рейтинг";
  if (/экзамен|exam/.test(s)) return "Экзамен";
  if (/итого|total|final/.test(s)) return "Итого";
  if (/букв|letter/.test(s)) return "Буква";
  return "Оценка";
}

export function cleanSubjectName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractSummaryMarks(raw: Record<string, unknown>): JournalRecord[] {
  const out: JournalRecord[] = [];
  const usedKeys = new Set<string>();

  for (const entry of SUMMARY_FIELD_MAP) {
    for (const key of entry.keys) {
      if (!(key in raw) || usedKeys.has(key)) continue;
      const value = raw[key];
      if (!isPresentMark(value)) continue;
      if (typeof value === "object") continue;
      usedKeys.add(key.toLowerCase());
      usedKeys.add(key);
      out.push({
        id: `summary-${key}`,
        date: "",
        title: entry.title,
        mark: String(value),
        type: entry.type,
        raw: { field: key, value },
      });
      break;
    }
  }

  // Always scan leftover mark-like fields (field names vary a lot)
  for (const [key, value] of Object.entries(raw)) {
    if (usedKeys.has(key) || usedKeys.has(key.toLowerCase())) continue;
    if (SKIP_SUMMARY_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === "object") continue;
    if (!isPresentMark(value)) continue;

    const looksLikeMark =
      /(mark|ball|score|grade|rk|рейтинг|attestation|exam|ср|sr|rating|total|letter|итого|балл|center|centre|average|avg|percent)/i.test(
        key,
      ) || /^(m|r|p|a)[_-]?\d+$/i.test(key);

    if (!looksLikeMark) continue;

    const n = Number(value);
    if (!Number.isNaN(n) && (n < 0 || n > 100) && !/letter|букв/i.test(key)) {
      // allow non-0-100 only for letter-like; skip weird ids
      if (n > 1000) continue;
    }

    usedKeys.add(key);
    const title = humanizeFieldKey(key);
    out.push({
      id: `summary-${key}`,
      date: "",
      title,
      mark: String(value),
      type: classifyMarkType(title, key),
      raw: { field: key, value },
    });
  }

  // Stable order: Орт.ағым → АБ → Средний → Рейтинг → Емт. → Итого → rest
  const order = ["СР", "РК", "Средний", "Рейтинг", "Экзамен", "Итого", "Буква", "GPA", "Оценка"];
  out.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  return out;
}

/**
 * Pull current/СР marks that may already live inside the subject payload
 * (arrays or date→mark maps).
 */
export function extractEmbeddedRecords(raw: Record<string, unknown>): JournalRecord[] {
  for (const key of NESTED_LIST_KEYS) {
    if (Array.isArray(raw[key]) && (raw[key] as unknown[]).length) {
      const normalized = normalizeJournalRecords(raw[key]);
      if (normalized.some((r) => r.mark !== "—" || r.date)) return normalized;
    }
  }

  // Some builds nest under markList / currentControlMarks etc.
  for (const [key, value] of Object.entries(raw)) {
    if (!/mark|grade|journal|current|sr|score|occupation|lesson/i.test(key)) continue;
    if (Array.isArray(value) && value.length) {
      const normalized = normalizeJournalRecords(value);
      if (normalized.some((r) => r.mark !== "—" || r.date)) return normalized;
    }
    // date → mark map: { "05.09.2025": "80/75", "2025-09-12": "ж/78" }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const fromMap = recordsFromDateMarkMap(value as Record<string, unknown>, key);
      if (fromMap.length) return fromMap;
    }
  }

  return [];
}

/** Convert { "dd.mm.yyyy"|"yyyy-mm-dd"|"5.9": "80/75" } into dated records. */
function recordsFromDateMarkMap(
  map: Record<string, unknown>,
  sourceKey: string,
): JournalRecord[] {
  const out: JournalRecord[] = [];
  for (const [dateKey, markVal] of Object.entries(map)) {
    if (markVal != null && typeof markVal === "object") continue;
    if (!isPresentMark(markVal)) continue;
    const looksLikeDate =
      /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/.test(dateKey) ||
      /^\d{4}-\d{2}-\d{2}/.test(dateKey) ||
      (/^\d{1,2}$/.test(dateKey) && isPresentMark(markVal));
    if (!looksLikeDate && !/^\d+$/.test(dateKey)) continue;
    const date = formatDate(dateKey) || dateKey;
    out.push({
      id: `map-${sourceKey}-${dateKey}`,
      date,
      title: "Текущая",
      mark: String(markVal),
      type: "СР",
      raw: { date: dateKey, mark: markVal, source: sourceKey },
    });
  }
  return out;
}

function pickSubjectIds(row: Record<string, unknown>, index: number): {
  id: string;
  tutorSubjectId?: string;
} {
  const id = pickString(
    row,
    [
      "subjectID",
      "subjectId",
      "tutorSubjectID",
      "tutorSubjectId",
      "disciplineID",
      "disciplineId",
      "id",
      "ID",
    ],
    String(index),
  );
  const tutorSubjectId = pickString(
    row,
    ["tutorSubjectID", "tutorSubjectId", "TutorSubjectID"],
    "",
  );
  return {
    id,
    ...(tutorSubjectId && tutorSubjectId !== id ? { tutorSubjectId } : {}),
  };
}

export function normalizeJournalSubjects(data: unknown): JournalSubject[] {
  const rows = asArray(data);
  return rows.map((row, index) => {
    const examsRaw = row.exams;
    const examsObj =
      examsRaw && typeof examsRaw === "object" && !Array.isArray(examsRaw)
        ? (examsRaw as Record<string, unknown>)
        : null;
    const examsList = Array.isArray(examsRaw) ? examsRaw : null;

    // Merge scalar exam fields onto the subject so SUMMARY_FIELD_MAP can see them
    const merged: Record<string, unknown> = { ...row };
    if (examsObj) {
      for (const [k, v] of Object.entries(examsObj)) {
        if (!(k in merged) || !isPresentMark(merged[k])) merged[k] = v;
      }
    }

    const summaryFromFields = extractSummaryMarks(merged);
    const summaryFromExamList = examsList
      ? normalizeJournalRecords(examsList).filter((r) => !r.date)
      : [];
    const summary = mergeMarkLists(summaryFromFields, summaryFromExamList);

    const totalFromSummary =
      summary.find((s) => s.type === "Итого")?.mark ??
      summary.find((s) => s.type === "Средний")?.mark;
    const rawName = pickString(
      row,
      ["subjectName", "name", "discipline", "disciplineName", "title"],
      "Предмет",
    );
    const ids = pickSubjectIds(row, index);

    const embeddedFromSubject = extractEmbeddedRecords(merged);
    const embeddedFromExams = examsList
      ? normalizeJournalRecords(examsList).filter((r) => Boolean(r.date) || r.type === "СР")
      : examsObj
        ? extractEmbeddedRecords(examsObj)
        : [];
    const embedded = mergeMarkLists(embeddedFromSubject, embeddedFromExams);

    return {
      id: ids.id,
      ...(ids.tutorSubjectId ? { tutorSubjectId: ids.tutorSubjectId } : {}),
      name: cleanSubjectName(rawName) || "Предмет",
      teacher: pickString(
        row,
        ["tutorName", "teacherName", "teacher", "tutor", "tutorList"],
        "",
      ),
      total: (row.totalMark ??
        row.total ??
        row.finalMark ??
        row.centerMark ??
        row.mark ??
        row.rating ??
        totalFromSummary ??
        null) as string | number | null,
      letter: (row.letterMark ?? row.letter ?? row.markLetter ?? null) as string | null,
      percent: (row.percent ?? row.percentage ?? null) as string | number | null,
      summary,
      embedded,
      raw: row,
    };
  });
}

function mergeMarkLists(a: JournalRecord[], b: JournalRecord[]): JournalRecord[] {
  if (!b.length) return a;
  if (!a.length) return b;
  const out = [...a];
  for (const item of b) {
    const key = `${item.title}|${item.date}|${item.mark}`;
    if (out.some((x) => `${x.title}|${x.date}|${x.mark}` === key)) continue;
    out.push(item);
  }
  return out;
}

export function normalizeJournalRecords(data: unknown): JournalRecord[] {
  // Component journals: [{ subjectName, tutorName, marks|records|… }, …]
  if (Array.isArray(data) && data.length) {
    const asComponents = flattenComponentJournals(data);
    if (asComponents.length) return asComponents;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const root = data as Record<string, unknown>;
    // Nested component list under common keys
    for (const key of [
      "journals",
      "journalList",
      "subjects",
      "components",
      "groups",
      "tutorSubjects",
      ...NESTED_LIST_KEYS,
    ]) {
      if (Array.isArray(root[key]) && (root[key] as unknown[]).length) {
        const nested = normalizeJournalRecords(root[key]);
        if (nested.length) return nested;
      }
    }
    // Whole-object date→mark map
    const fromMap = recordsFromDateMarkMap(root, "root");
    if (fromMap.length >= 2) return fromMap;

    const summary = extractSummaryMarks(root);
    if (summary.length) return summary;
  }

  const rows = asArray(data);

  // Sometimes API returns a single object with mark fields instead of a list
  if (!rows.length && data && typeof data === "object" && !Array.isArray(data)) {
    const summary = extractSummaryMarks(data as Record<string, unknown>);
    if (summary.length) return summary;
  }

  return rows
    .map((row, index) => {
      const mark = pickString(
        row,
        [
          "mark",
          "grade",
          "score",
          "value",
          "ball",
          "markValue",
          "markBall",
          "currentMark",
          "point",
          "points",
        ],
        "",
      );

      // Nested mark object: { mark: { value: 90 } }
      let nestedMark = mark;
      if (!nestedMark && row.mark && typeof row.mark === "object") {
        nestedMark = pickString(row.mark as Record<string, unknown>, ["value", "mark", "ball"], "");
      }

      // day + month without full date
      let dateRaw = pickString(
        row,
        [
          "date",
          "markDate",
          "lessonDate",
          "created",
          "createdDate",
          "occupationDate",
          "controlDate",
          "dateMark",
          "passDate",
        ],
        "",
      );
      if (!dateRaw) {
        const day = pickString(row, ["day", "dayNumber", "dateDay", "kun"], "");
        const month = pickString(row, ["month", "monthNumber", "dateMonth", "aiy"], "");
        const year = pickString(row, ["year", "markYear"], "");
        if (day && month) {
          dateRaw = year
            ? `${day}.${month}.${year}`
            : `${day}.${month}`;
        }
      }

      const title = pickString(
        row,
        [
          "theme",
          "topic",
          "title",
          "name",
          "description",
          "controlType",
          "controlTypeName",
          "occupationTypeName",
          "markTypeName",
          "typeName",
          "lessonTheme",
          "subjectName",
          "groupName",
        ],
        "",
      );

      const type = pickString(
        row,
        [
          "markType",
          "markTypeName",
          "type",
          "controlTypeName",
          "controlForm",
          "occupationType",
          "occupationTypeName",
          "kind",
          "shortName",
        ],
        "",
      );

      return {
        id: pickString(row, ["id", "ID", "recordID", "markID", "journalRecordID"], String(index)),
        date: formatDate(dateRaw) || dateRaw,
        title: title || type || "Текущая",
        mark: nestedMark || "—",
        type,
        raw: row,
      };
    })
    .filter((r) => r.mark !== "—" || r.date || (r.title && r.title !== "Оценка" && r.title !== "Текущая"));
}

/**
 * Official Platonus detail modal: one subject → several L/P/СРСП journals,
 * each with its own current marks table.
 */
function flattenComponentJournals(rows: unknown[]): JournalRecord[] {
  const out: JournalRecord[] = [];
  let componentHits = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;

    const componentName = pickString(
      obj,
      [
        "subjectName",
        "name",
        "disciplineName",
        "groupName",
        "occupationTypeName",
        "shortName",
        "title",
      ],
      "",
    );
    const teacher = pickString(obj, ["tutorName", "teacherName", "teacher"], "");

    let nested: unknown =
      obj.marks ??
      obj.markList ??
      obj.records ??
      obj.currentMarks ??
      obj.journalRecords ??
      obj.occupationMarks ??
      obj.grades ??
      null;

    // Inline date→mark map on the component itself
    if (!nested) {
      const mapKeys = Object.keys(obj).filter(
        (k) =>
          /^\d{1,2}[./-]\d{1,2}/.test(k) ||
          /^\d{4}-\d{2}-\d{2}/.test(k),
      );
      if (mapKeys.length >= 2) {
        nested = Object.fromEntries(mapKeys.map((k) => [k, obj[k]]));
      }
    }

    const hasMarkBag =
      nested != null &&
      (Array.isArray(nested)
        ? nested.length > 0
        : typeof nested === "object" && Object.keys(nested as object).length > 0);

    // Heuristic: treat as component journal only if it looks like one
    const looksLikeComponent =
      Boolean(componentName) &&
      (hasMarkBag ||
        "tutorName" in obj ||
        /-(L|P|SRSP|ПР|ЛК|СӨЖ)$/i.test(componentName));

    if (!looksLikeComponent) continue;
    componentHits += 1;

    if (!hasMarkBag) {
      out.push({
        id: `component-empty-${i}`,
        date: "",
        title: teacher ? `${componentName} (${teacher})` : componentName,
        mark: "—",
        type: "СР",
        raw: obj,
      });
      continue;
    }

    let marks: JournalRecord[] = [];
    if (Array.isArray(nested)) {
      marks = normalizeJournalRecords(nested);
    } else if (nested && typeof nested === "object") {
      marks = recordsFromDateMarkMap(nested as Record<string, unknown>, componentName || "marks");
      if (!marks.length) marks = normalizeJournalRecords(nested);
    }

    if (!marks.length) {
      out.push({
        id: `component-empty-${i}`,
        date: "",
        title: teacher ? `${componentName} (${teacher})` : componentName,
        mark: "—",
        type: "СР",
        raw: obj,
      });
      continue;
    }

    for (const m of marks) {
      out.push({
        ...m,
        id: `${componentName || "c"}-${m.id}`,
        title:
          m.title && m.title !== "Текущая" && m.title !== "Оценка"
            ? `${componentName}: ${m.title}`
            : componentName || m.title,
      });
    }
  }

  // Only treat as component list if at least one row looked like a component
  return componentHits > 0 ? out.filter((r) => r.mark !== "—" || r.date) : [];
}

export function extractFio(data: unknown): string {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  return pickString(row, ["fio", "FIO", "name", "fullName", "personName"], "");
}

export function extractListIds(data: unknown): {
  id: string;
  label: string;
  selected?: boolean;
}[] {
  // Plain array of years: [2024, 2025] or ["2024","2025"]
  if (Array.isArray(data) && data.length && data.every((x) => typeof x === "number" || typeof x === "string")) {
    return (data as Array<string | number>).map((v) => ({
      id: String(v),
      label: String(v),
    }));
  }

  const rows = asArray(data);
  return rows.map((row, index) => {
    const id = pickString(
      row,
      ["year", "startYear", "studyYear", "id", "ID", "term", "value"],
      String(index),
    );
    const label = pickString(
      row,
      ["name", "title", "label", "yearName", "year", "term"],
      id,
    );
    const selected = Boolean(
      row.selected === true ||
        row.current === true ||
        row.isCurrent === true ||
        row.isSelected === true ||
        row.active === true ||
        row.default === true ||
        row.isDefault === true,
    );
    return { id, label, ...(selected ? { selected: true } : {}) };
  });
}
