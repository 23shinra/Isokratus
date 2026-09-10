import type { ScheduleLesson } from "@/lib/lms/types";

export type LessonSnap = {
  key: string;
  /** Day + time only — ignores subject/teacher/room language flips. */
  structureKey: string;
  slot: string;
  day: number;
  dayName: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
};

export type ScheduleChange = {
  id: string;
  at: string;
  year: string;
  term: string;
  added: LessonSnap[];
  removed: LessonSnap[];
  /** Kept for stored history shape; new diffs never fill this. */
  changed: { before: LessonSnap; after: LessonSnap }[];
  unread: boolean;
};

function normTime(value: string): string {
  const m = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return String(value || "").trim();
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * Identity for history: weekday + start + end.
 * Subject / teacher / room text flips with LMS language and must not count.
 */
export function toLessonSnap(lesson: ScheduleLesson): LessonSnap {
  const startTime = normTime(lesson.startTime);
  const endTime = normTime(lesson.endTime);
  const subject = String(lesson.subject || "").trim();
  const teacher = String(lesson.teacher || "").trim();
  const room = String(lesson.room || "").trim();
  const day = Number(lesson.day) || 0;
  const slot = `${day}|${startTime}`;
  const structureKey = `${day}|${startTime}|${endTime}`;
  return {
    key: structureKey,
    structureKey,
    slot,
    day,
    dayName: lesson.dayName || "",
    startTime,
    endTime,
    subject,
    teacher,
    room,
  };
}

export function fingerprintLessons(lessons: ScheduleLesson[]): string {
  const keys = lessons.map((l) => toLessonSnap(l).structureKey).sort();
  return hashString(keys.join("\n"));
}

export function snapsFromLessons(lessons: ScheduleLesson[]): LessonSnap[] {
  return lessons.map(toLessonSnap).sort((a, b) => a.key.localeCompare(b.key));
}

/** @deprecated Label-only checks unused; kept for old persisted data prune. */
export function isLabelOnlyChange(before: LessonSnap, after: LessonSnap): boolean {
  return before.structureKey === after.structureKey;
}

/**
 * Only real schedule membership changes: slot appeared or disappeared.
 * Same day+time = same pair even if Platonus renamed subject/room in another language.
 */
export function diffLessons(
  prev: LessonSnap[],
  next: LessonSnap[],
): Pick<ScheduleChange, "added" | "removed" | "changed"> {
  const prevByKey = new Map<string, LessonSnap>();
  const nextByKey = new Map<string, LessonSnap>();
  for (const item of prev) prevByKey.set(item.structureKey, item);
  for (const item of next) nextByKey.set(item.structureKey, item);

  const added: LessonSnap[] = [];
  const removed: LessonSnap[] = [];

  for (const item of next) {
    if (!prevByKey.has(item.structureKey)) added.push(item);
  }
  for (const item of prev) {
    if (!nextByKey.has(item.structureKey)) removed.push(item);
  }

  return { added, removed, changed: [] };
}

export function hasDiff(
  diff: Pick<ScheduleChange, "added" | "removed" | "changed">,
): boolean {
  return diff.added.length > 0 || diff.removed.length > 0;
}

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export function formatLessonLine(l: LessonSnap): string {
  const when = [l.dayName || dayLabel(l.day), l.startTime].filter(Boolean).join(" · ");
  const meta = [l.teacher, l.room].filter(Boolean).join(" · ");
  return meta ? `${when} — ${l.subject} (${meta})` : `${when} — ${l.subject}`;
}

function dayLabel(day: number): string {
  const names = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return names[day] || `День ${day}`;
}
