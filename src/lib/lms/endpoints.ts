import type { Lang } from "./types";

export const LANG_INT: Record<Lang, string> = {
  ru: "1",
  kz: "2",
  en: "3",
};

/**
 * LMS web (Angular /v7) student schedule.
 * Path language is `.code` ("ru"|"kz"|"en"), NOT numeric id.
 * POST body = filter params; studentID 0 = current session student.
 */
export function userScheduleInitialPath(
  studentId: string | number,
  lang: Lang,
): string {
  return `rest/schedule/userSchedule/student/initial/${studentId}/${lang}`;
}

export function userScheduleCalculatePath(
  studentId: string | number,
  lang: Lang,
): string {
  return `rest/schedule/userSchedule/student/calculate/${studentId}/${lang}`;
}

/** Try both string code and numeric id — installs differ. */
export function userScheduleInitialPaths(
  studentId: string | number,
  lang: Lang,
): string[] {
  const id = String(studentId);
  return [
    `rest/schedule/userSchedule/student/initial/${id}/${lang}`,
    `rest/schedule/userSchedule/student/initial/${id}/${LANG_INT[lang]}`,
  ];
}

export function userScheduleCalculatePaths(
  studentId: string | number,
  lang: Lang,
): string[] {
  const id = String(studentId);
  return [
    `rest/schedule/userSchedule/student/calculate/${id}/${lang}`,
    `rest/schedule/userSchedule/student/calculate/${id}/${LANG_INT[lang]}`,
  ];
}

/** GET fallback used by Angular loadStudentData — same viewer payload shape. */
export function userScheduleDataPaths(
  studentId: string | number,
  lang: Lang,
): string[] {
  const id = String(studentId);
  return [
    `rest/schedule/userSchedule/student/data/${id}/${lang}`,
    `rest/schedule/userSchedule/student/data/${id}/${LANG_INT[lang]}`,
  ];
}

function toInt(value: string | number | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === "") return fallback;
  const raw = String(value).trim();
  // "2025-2026" → 2025
  const range = raw.match(/^(\d{4})\s*[-/–]/);
  if (range) return Number(range[1]);
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

export function userScheduleParams(
  year?: string | number,
  term?: string | number,
  week?: string | number,
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    studentTypeID: 1,
    statusID: 1,
    disciplineStudyLanguageIds: [1, 2, 3],
    week: toInt(week, 1) ?? 1,
  };
  const studyYear = toInt(year);
  const studyTerm = toInt(term);
  if (studyYear !== undefined) params.studyYear = studyYear;
  if (studyTerm !== undefined) params.term = studyTerm;
  return params;
}

/** Legacy / mobile path candidates — fallback if v6 userSchedule fails. */
export function schedulePaths(
  year: string | number,
  term: string | number,
  week: string | number,
  lang: Lang,
  personId?: string | number,
): string[] {
  const langInt = LANG_INT[lang];
  const y = String(year);
  const t = String(term);
  const w = String(week);

  const paths = [
    `rest/mobile/student/weekSchedule/${y}/${t}/${w}/${lang}`,
    `rest/mobile/student/weekSchedule/${y}/${t}/${w}/${langInt}`,
    `rest/mobile/student/schedule/${y}/${t}/${w}/${lang}`,
    `rest/mobile/student/timeTable/${y}/${t}/${w}/${langInt}`,
    `rest/schedule/studentSchedule/${y}/${t}/${w}/${lang}`,
    `rest/schedule/studentSchedule/${y}/${t}/${w}/${langInt}`,
    `rest/schedule/weekSchedule/${y}/${t}/${w}/${lang}`,
    `rest/schedule/selectedWeekSchedule/${y}/${t}/${w}/${lang}`,
  ];

  if (personId !== undefined && personId !== null && String(personId) !== "") {
    const pid = String(personId);
    paths.unshift(
      `rest/schedule/student/${pid}/${y}/${t}/${w}/${lang}`,
      `rest/mobile/student/${pid}/weekSchedule/${y}/${t}/${w}/${lang}`,
    );
  }

  return paths;
}

export function scheduleGroupPaths(
  year: string | number,
  term: string | number,
  week: string | number,
  lang: Lang,
  groupId: string | number,
): string[] {
  const langInt = LANG_INT[lang];
  const y = String(year);
  const t = String(term);
  const w = String(week);
  const g = String(groupId);
  return [
    `rest/schedule/groupSchedule/${g}/${y}/${t}/${w}/${lang}`,
    `rest/schedule/group/${g}/${y}/${t}/${w}/${lang}`,
    `rest/schedule/byGroup/${g}/${y}/${t}/${w}/${lang}`,
    `rest/mobile/schedule/group/${g}/${y}/${t}/${w}/${lang}`,
    `rest/schedule/groupSchedule/${y}/${t}/${w}/${lang}?groupID=${g}`,
    `rest/schedule/studentSchedule/${y}/${t}/${w}/${lang}?groupID=${g}`,
    `rest/mobile/student/weekSchedule/${y}/${t}/${w}/${lang}?groupID=${g}`,
    `rest/schedule/groupSchedule/${g}/${y}/${t}/${w}/${langInt}`,
  ];
}

export function scheduleWeeksCountPaths(
  year: string | number,
  term: string | number,
  lang: Lang,
): string[] {
  const langInt = LANG_INT[lang];
  const y = String(year);
  const t = String(term);
  return [
    `rest/schedule/getWeeksCount/${y}/${t}`,
    `rest/schedule/countWeeks/${y}/${t}/${lang}`,
    `rest/schedule/countOfWeeks/${y}/${t}`,
    `rest/schedule/weeks/${y}/${t}/${lang}`,
    `rest/schedule/student/countWeeks/${y}/${t}`,
    `rest/mobile/student/scheduleWeeks/${y}/${t}/${lang}`,
    `rest/mobile/student/weeksCount/${y}/${t}/${lang}`,
    `rest/mobile/student/weeksCount/${y}/${t}/${langInt}`,
  ];
}

export function schedulePostPaths(): string[] {
  return [
    "rest/mobile/student/weekSchedule",
    "rest/mobile/student/schedule",
    "rest/mobile/student/getSchedule",
    "rest/schedule/studentSchedule",
    "rest/schedule/getStudentSchedule",
    "rest/schedule/getStudentWeekSchedule",
    "rest/schedule/loadStudentSchedule",
    "rest/schedule/weekSchedule",
    "rest/schedule/student/load",
    "rest/schedule/selectedWeekSchedule",
    "rest/api/schedule/studentSchedule",
  ];
}

export function schedulePostBodies(
  year: string | number,
  term: string | number,
  week: string | number,
  lang: Lang,
): unknown[] {
  const langInt = Number(LANG_INT[lang]);
  const y = Number(year);
  const t = Number(term);
  const w = Number(week);
  return [
    { year, term, week, language: lang },
    { year, term, week, language: langInt },
    { year, term, weekNumber: week, language: lang },
    { year, term, weekNumber: week, language: langInt },
    { studyYear: year, term, week, lang },
    { academicYear: year, period: term, week, language: langInt },
    { year: y, term: t, week: w, language: langInt },
    { year: y, term: t, week: w, language: lang },
    { year: y, semester: t, week: w, lang },
    { studyYear: y, academicPeriod: t, weekNumber: w, language: langInt },
  ];
}

/** Expand year candidates — journal may use start year, schedule may want ±1. */
export function yearCandidates(year: string | number): string[] {
  const raw = String(year).trim();
  const out = new Set<string>([raw]);

  // "2025-2026" → 2025, 2026
  const range = raw.match(/^(\d{4})\s*[-/–]\s*(\d{4})$/);
  if (range) {
    out.add(range[1]);
    out.add(range[2]);
  }

  const n = Number(raw);
  if (!Number.isNaN(n) && n > 2000 && n < 2100) {
    out.add(String(n));
    out.add(String(n - 1));
    out.add(String(n + 1));
  }

  return Array.from(out);
}

export function journalPaths(year: string | number, term: string | number, lang: Lang): string[] {
  return [
    `rest/api/journal/${year}/${term}/${lang}`,
    `rest/mobile/journal/${year}/${term}/${lang}`,
    `rest/journal/${year}/${term}/${lang}`,
  ];
}

export function journalRecordsPaths(
  year: string | number,
  term: string | number,
  subjectId: string | number,
  lang: Lang = "ru",
): string[] {
  const y = String(year);
  const t = String(term);
  const id = String(subjectId);
  const langInt = LANG_INT[lang];
  return [
    // Mobile current / occupation marks (lesson-by-date tables)
    `rest/mobile/journal/occupationMarks/${y}/${t}/${id}`,
    `rest/mobile/journal/occupationMarks/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/getOccupationMarks/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/lessonMarks/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/getCurrentMarks/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/markList/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/records/${y}/${t}?subjectID=${id}`,
    `rest/mobile/journal/records/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/records/${y}/${t}/${id}`,
    `rest/mobile/gradebook/records/${y}/${t}?subjectID=${id}`,
    `rest/mobile/gradebook/current/${y}/${t}/${id}`,
    `rest/mobile/journal/${y}/${t}/${id}/${lang}`,
    `rest/mobile/journal/${y}/${t}/${id}/${langInt}`,
  ];
}

export function studyYearsPaths(lang: Lang): string[] {
  return [
    `rest/mobile/student/studyYears/${lang}`,
    `rest/api/student/studyYears/${lang}`,
    `rest/studyYears/${lang}`,
  ];
}

export function termsPaths(lang: Lang): string[] {
  return [
    `rest/mobile/tutor/terms/${lang}`,
    `rest/mobile/student/terms/${lang}`,
    `rest/api/terms/${lang}`,
    `rest/terms/${lang}`,
  ];
}

export function fioPaths(lang: Lang): string[] {
  return [`rest/fio/${lang}`, `rest/fio`, `rest/mobile/personInfo/${lang}`];
}

export function qrMarkPaths(): string[] {
  // Keep the list short — full cartesian probe hangs the UI for minutes.
  return [
    "rest/mobile/journalAttendance",
    "rest/api/journalAttendance",
    "rest/journalAttendance",
    "rest/mobile/qr/journalAttendance",
    "rest/api/qr/journalAttendance",
    "rest/mobile/qr/attendance",
    "rest/api/qr/attendance",
    "rest/attendance/markByQrCode",
    "rest/mobile/attendance/markByQrCode",
    "rest/qr/markAttendance",
    "rest/mobile/markAttendance",
  ];
}

/** Normalize scanned QR text into attendance payload variants. */
export function buildQrMarkPayloads(raw: string, mode: "fast" | "full" = "fast"): unknown[] {
  const text = raw.trim();
  const variants: unknown[] = [];

  let parsed: { code?: string; action?: string } | null = null;
  if (text.startsWith("{")) {
    try {
      parsed = JSON.parse(text) as { code?: string; action?: string };
    } catch {
      parsed = null;
    }
  }

  if (parsed?.code) {
    const action = parsed.action || "journalAttendance";
    variants.push({ code: parsed.code, action });
    if (mode === "full") {
      variants.push({ code: parsed.code, action: "journalAttendance" });
      variants.push({ qrCode: parsed.code, action });
      variants.push({ data: parsed.code, action });
      variants.push({ qrCode: parsed.code });
      variants.push({ code: parsed.code });
      variants.push(parsed);
    }
  } else {
    variants.push({ code: text, action: "journalAttendance" });
    if (mode === "full") {
      variants.push({ qrCode: text, action: "journalAttendance" });
      variants.push({ qrCode: text });
      variants.push({ code: text });
      variants.push({ data: text });
    }
  }

  const seen = new Set<string>();
  return variants.filter((v) => {
    const key = typeof v === "string" ? v : JSON.stringify(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}
