"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AppChrome } from "@/components/app-chrome";
import { PeriodFilters, useAcademicPeriod } from "@/components/period-filters";
import {
  EASE_OUT_EXPO,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/motion";
import {
  EmptyState,
  PageHeader,
  Panel,
  Shell,
  Skeleton,
} from "@/components/ui";
import { apiSchedule } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import type { ScheduleLesson } from "@/lib/platonus/types";

const DAY_NAMES = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

/** Gap longer than this between pairs counts as «окно». */
const WINDOW_GAP_MINUTES = 10;

type TimelineRow =
  | {
      kind: "lesson";
      id: string;
      start: string;
      end: string;
      title: string;
      meta?: string;
    }
  | {
      kind: "window";
      id: string;
      start: string;
      end: string;
    };

export default function SchedulePage() {
  return (
    <AppChrome>
      <Shell>
        <ScheduleView />
      </Shell>
    </AppChrome>
  );
}

function ScheduleView() {
  const session = useAuthStore((s) => s.session);
  const period = useAcademicPeriod();
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !period.year || !period.term || period.loading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Week comes from Platonus selectedWeek — no manual picker.
        const res = await apiSchedule(session, {
          year: period.year,
          term: period.term,
          week: "auto",
        });
        if (!cancelled) setLessons(res.lessons);
      } catch (err) {
        if (!cancelled) {
          setLessons([]);
          setError(err instanceof Error ? err.message : "Ошибка расписания");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, period.year, period.term, period.loading]);

  const weekDays = useMemo(() => buildWeekTimeline(lessons), [lessons]);
  const hasAnyLesson = weekDays.some((d) => d.rows.some((r) => r.kind === "lesson"));

  return (
    <>
      <Reveal>
        <PageHeader title="Расписание" />
      </Reveal>

      <Reveal delay={0.08} className="mb-6">
        <Panel>
          <PeriodFilters period={period} />
        </Panel>
      </Reveal>

      {error ? (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
          className="mb-4 whitespace-pre-wrap rounded-[12px] bg-pale-red px-3 py-2 text-sm text-pale-red-ink"
        >
          {error}
        </motion.p>
      ) : null}

      {loading || period.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !hasAnyLesson ? (
        <Reveal delay={0.1}>
          <EmptyState
            title="Пар нет"
            body="Смени год или период. Если в веб-Platonus пары есть — перелогинься здесь."
          />
        </Reveal>
      ) : (
        <Stagger className="space-y-5">
          {weekDays.map((day) => (
            <StaggerItem key={day.day}>
              <h2 className="mb-2.5 font-display text-sm font-medium text-ink">
                {day.name}
              </h2>
              <div className="rounded-[1.2rem] border border-white/[0.07] bg-white/[0.03] p-1">
                <ul className="glass-panel overflow-hidden rounded-[calc(1.2rem-0.25rem)] border border-white/[0.05]">
                  {day.rows.length === 0 ? (
                    <li className="px-4 py-3.5 text-sm text-muted md:px-5">Выходной</li>
                  ) : (
                    day.rows.map((row) =>
                      row.kind === "window" ? (
                        <li
                          key={row.id}
                          className="border-t border-white/[0.04] px-4 py-2.5 first:border-t-0 md:px-5"
                        >
                          <p className="font-mono text-[13px] text-muted">
                            {row.start} – {row.end}
                            <span className="mx-2 text-muted/50">—</span>
                            <span className="font-sans italic">Окно</span>
                          </p>
                        </li>
                      ) : (
                        <li
                          key={row.id}
                          className="border-t border-white/[0.06] px-4 py-3.5 first:border-t-0 md:px-5"
                        >
                          <p className="text-[15px] tracking-tight text-ink">
                            <span className="font-mono text-[13px] text-muted">
                              {row.start}
                              {row.end ? ` – ${row.end}` : ""}
                            </span>
                            <span className="mx-2 text-muted/50">—</span>
                            <span className="font-medium">{row.title}</span>
                          </p>
                          {row.meta ? (
                            <p className="mt-1 text-sm text-muted">{row.meta}</p>
                          ) : null}
                        </li>
                      ),
                    )
                  )}
                </ul>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </>
  );
}

function buildWeekTimeline(lessons: ScheduleLesson[]) {
  return DAY_NAMES.map((name, index) => {
    const day = index + 1;
    const dayLessons = lessons
      .filter((l) => normalizeDay(l.day) === day)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));

    return {
      day,
      name,
      rows: buildDayRows(dayLessons, day),
    };
  });
}

function buildDayRows(lessons: ScheduleLesson[], day: number): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const start = formatTime(lesson.startTime);
    const end = formatTime(lesson.endTime);

    if (i > 0) {
      const prev = lessons[i - 1];
      const prevEnd = toMinutes(prev.endTime || prev.startTime);
      const nextStart = toMinutes(lesson.startTime);
      if (prevEnd >= 0 && nextStart >= 0 && nextStart - prevEnd >= WINDOW_GAP_MINUTES) {
        rows.push({
          kind: "window",
          id: `window-${day}-${i}`,
          start: formatTime(prev.endTime || prev.startTime),
          end: formatTime(lesson.startTime),
        });
      }
    }

    rows.push({
      kind: "lesson",
      id: lesson.id || `lesson-${day}-${i}`,
      start,
      end,
      title: lesson.subject || "Пара",
      meta: [lesson.teacher, lesson.room].filter(Boolean).join(" · ") || undefined,
    });
  }

  return rows;
}

function normalizeDay(day: number): number {
  if (!Number.isFinite(day) || day < 1) return 1;
  if (day > 7) return ((day - 1) % 7) + 1;
  return day;
}

function toMinutes(value: string): number {
  const m = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatTime(value: string): string {
  const m = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value || "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
