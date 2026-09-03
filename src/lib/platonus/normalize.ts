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

/** Platonus day keys are 1=Mon … 7=Sun. Cell.weekDay is often 0 — ignore it. */
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
 * Platonus 6.26 `/rest/schedule/userSchedule/student/*` payload:
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

/** Known Platonus summary fields → human labels (РК / рейтинг / экзамен). */
const SUMMARY_FIELD_MAP: Array<{ keys: string[]; title: string; type: string }> = [
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
      "attestation1",
      "boundary1",
      "firstBoundaryControl",
      "rk1Mark",
      "p1",
      "M1",
    ],
    title: "РК 1",
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
      "attestation2",
      "boundary2",
      "secondBoundaryControl",
      "rk2Mark",
      "p2",
      "M2",
    ],
    title: "РК 2",
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
    ],
    title: "РК 3",
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
    title: "Текущий / СР",
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
    ],
    title: "Экзамен",
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
  firstattestation: "РК 1",
  firstattestationmark: "РК 1",
  firstratingmark: "РК 1",
  firstrating: "РК 1",
  midterm1: "РК 1",
  rk1: "РК 1",
  secondattestation: "РК 2",
  secondattestationmark: "РК 2",
  secondratingmark: "РК 2",
  secondrating: "РК 2",
  midterm2: "РК 2",
  rk2: "РК 2",
  thirdattestation: "РК 3",
  rk3: "РК 3",
  currentmark: "Текущий / СР",
  currentaverage: "Текущий / СР",
  averagecurrentmark: "Текущий / СР",
  srmark: "Текущий / СР",
  centermark: "Средний балл",
  centremark: "Средний балл",
  averagemark: "Средний балл",
  avgmark: "Средний балл",
  meanmark: "Средний балл",
  middlemark: "Средний балл",
  ratingmark: "Рейтинг",
  rating: "Рейтинг",
  ratingscore: "Рейтинг",
  exammark: "Экзамен",
  exam: "Экзамен",
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
  if (/^(rk|r)[_-]?1$/i.test(key) || /first.*attestation|midterm.?1/i.test(key)) return "РК 1";
  if (/^(rk|r)[_-]?2$/i.test(key) || /second.*attestation|midterm.?2/i.test(key)) return "РК 2";
  if (/^(rk|r)[_-]?3$/i.test(key)) return "РК 3";
  if (/center|centre|average|avg|mean|middle/i.test(key)) return "Средний балл";
  if (/current|ср|sr|tekush/i.test(key)) return "Текущий / СР";
  if (/rating|рейтинг/i.test(key)) return "Рейтинг";
  if (/exam|экзамен|summative/i.test(key)) return "Экзамен";
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

  // Always scan leftover mark-like fields (Platonus field names vary a lot)
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

  // Stable order: РК → СР → Средний → Рейтинг → Экзамен → Итого → rest
  const order = ["РК", "СР", "Средний", "Рейтинг", "Экзамен", "Итого", "Буква", "GPA", "Оценка"];
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
    if (!/mark|grade|journal|current|sr|score/i.test(key)) continue;
    if (Array.isArray(value) && value.length) {
      const normalized = normalizeJournalRecords(value);
      if (normalized.some((r) => r.mark !== "—" || r.date)) return normalized;
    }
  }

  return [];
}

export function normalizeJournalSubjects(data: unknown): JournalSubject[] {
  const rows = asArray(data);
  return rows.map((row, index) => {
    const summary = extractSummaryMarks(row);
    const totalFromSummary =
      summary.find((s) => s.type === "Итого")?.mark ??
      summary.find((s) => s.type === "Средний")?.mark;
    const rawName = pickString(
      row,
      ["subjectName", "name", "discipline", "disciplineName", "title"],
      "Предмет",
    );
    return {
      id: pickString(
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
      ),
      name: cleanSubjectName(rawName) || "Предмет",
      teacher: pickString(row, ["tutorName", "teacherName", "teacher", "tutor"], ""),
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
      embedded: extractEmbeddedRecords(row),
      raw: row,
    };
  });
}

export function normalizeJournalRecords(data: unknown): JournalRecord[] {
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

      const dateRaw = pickString(
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
        date: formatDate(dateRaw),
        title: title || type || "Оценка",
        mark: nestedMark || "—",
        type,
        raw: row,
      };
    })
    .filter((r) => r.mark !== "—" || r.date || (r.title && r.title !== "Оценка"));
}

export function extractFio(data: unknown): string {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  return pickString(row, ["fio", "FIO", "name", "fullName", "personName"], "");
}

export function extractListIds(data: unknown): { id: string; label: string }[] {
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
    return { id, label };
  });
}
