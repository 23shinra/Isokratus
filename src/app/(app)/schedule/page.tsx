"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { WifiSlash } from "@phosphor-icons/react";
import { PeriodFilters, useAcademicPeriod } from "@/components/period-filters";
import {
  EASE_OUT_EXPO,
  EASE_SPRING_SOFT,
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
import { cn } from "@/lib/cn";
import {
  formatCacheAgeRelative,
  useDataCacheHydrated,
  useDataCacheStore,
} from "@/lib/data-cache-store";
import { useScheduleHistoryStore } from "@/lib/schedule-history-store";
import type { ScheduleLesson } from "@/lib/lms/types";
import { dayNameKeys, type MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/use-i18n";

/** Gaps shorter than this are ignored (pairs back-to-back). */
const GAP_SHOW_MINUTES = 10;
/** Up to this length = перемена; longer = окно. */
const BREAK_MAX_MINUTES = 20;

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
      kind: "gap";
      id: string;
      start: string;
      end: string;
      /** перемена ≤20 мин, окно — дольше */
      gapType: "break" | "window";
    };

type WeekDay = {
  day: number;
  name: string;
  short: string;
  rows: TimelineRow[];
  lessonCount: number;
};

export default function SchedulePage() {
  return (
    <Shell>
      <ScheduleView />
    </Shell>
  );
}

function ScheduleView() {
  const session = useAuthStore((s) => s.session);
  const { t } = useT();
  const period = useAcademicPeriod();
  const ingest = useScheduleHistoryStore((s) => s.ingest);
  const saveSchedule = useDataCacheStore((s) => s.saveSchedule);
  const findSchedule = useDataCacheStore((s) => s.findSchedule);
  const cacheReady = useDataCacheHydrated();
  const reduced = useReducedMotion();
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<{
    savedAt: string;
    reason: "offline" | "error";
  } | null>(null);
  const [online, setOnline] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => todayDayIndex());
  const [direction, setDirection] = useState(0);

  const baseUrl = session?.baseUrl;
  const token = session?.token;
  const sessionLang = session?.lang;

  useEffect(() => {
    function syncOnline() {
      setOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    }
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    if (!cacheReady || !baseUrl || !token || !period.year || !period.term) return;
    let cancelled = false;

    const cached = findSchedule(baseUrl, period.year, period.term);
    if (cached?.lessons?.length) {
      setLessons(cached.lessons);
      setLoading(false);
      if (!online) {
        setStale({ savedAt: cached.savedAt, reason: "offline" });
        setError(null);
        return;
      }
      // Online: keep cache on screen, but don't claim stale until fetch fails
      setStale(null);
    } else {
      setLessons([]);
      setStale(null);
      if (!online) {
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
    }

    (async () => {
      setError(null);
      try {
        const live = useAuthStore.getState().session;
        if (!live) return;
        const res = await apiSchedule(live, {
          year: period.year,
          term: period.term,
          week: "auto",
        });
        if (!cancelled) {
          const list = res.lessons ?? [];
          if (list.length) {
            setLessons(list);
            setStale(null);
            saveSchedule(live.baseUrl, period.year, period.term, list);
            ingest(live.baseUrl, period.year, period.term, list);
          } else {
            const again = useDataCacheStore
              .getState()
              .findSchedule(baseUrl, period.year, period.term);
            if (again?.lessons?.length) {
              setLessons(again.lessons);
              setStale({ savedAt: again.savedAt, reason: "error" });
            } else {
              setLessons([]);
              setStale(null);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          const again = useDataCacheStore
            .getState()
            .findSchedule(baseUrl, period.year, period.term);
          if (again?.lessons?.length) {
            setLessons(again.lessons);
            setStale({
              savedAt: again.savedAt,
              reason: navigator.onLine ? "error" : "offline",
            });
            setError(null);
          } else {
            setStale(null);
            setError(err instanceof Error ? err.message : t("schedule_error"));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cacheReady,
    baseUrl,
    token,
    sessionLang,
    period.year,
    period.term,
    online,
    ingest,
    findSchedule,
    saveSchedule,
    t,
  ]);

  // If we go offline while viewing live data, mark as stale from last cache stamp
  useEffect(() => {
    if (online || !baseUrl || !period.year || !period.term) return;
    const cached = findSchedule(baseUrl, period.year, period.term);
    if (cached?.lessons?.length) {
      setLessons(cached.lessons);
      setStale({ savedAt: cached.savedAt, reason: "offline" });
      setError(null);
      setLoading(false);
    }
  }, [online, baseUrl, period.year, period.term, findSchedule]);

  const weekDays = useMemo(
    () => buildWeekTimeline(lessons, (key) => t(key)),
    [lessons, t],
  );
  const hasAnyLesson = weekDays.some((d) => d.lessonCount > 0);
  const activeDay = weekDays.find((d) => d.day === selectedDay) ?? weekDays[0];

  function selectDay(day: number) {
    if (day === selectedDay) return;
    setDirection(day > selectedDay ? 1 : -1);
    setSelectedDay(day);
  }

  return (
    <>
      <PageHeader title={t("schedule_title")} />

      <div className="mb-4">
        <Panel>
          <PeriodFilters period={period} />
        </Panel>
      </div>

      {stale ? (
        <div className="mb-4 flex gap-3 rounded-[14px] border border-pale-yellow-ink/25 bg-pale-yellow/15 px-3.5 py-3">
          <WifiSlash
            size={20}
            weight="fill"
            className="mt-0.5 shrink-0 text-pale-yellow-ink"
          />
          <div className="min-w-0 text-sm leading-snug">
            <p className="font-medium text-pale-yellow-ink">
              {stale.reason === "offline"
                ? t("schedule_offline")
                : t("schedule_update_failed")}
            </p>
            <p className="mt-0.5 text-ink/80">
              {t("schedule_stale_body", {
                age: formatCacheAgeRelative(stale.savedAt)
                  ? t("schedule_stale_age", {
                      when: formatCacheAgeRelative(stale.savedAt)!,
                    })
                  : "",
              })}
            </p>
          </div>
        </div>
      ) : null}

      {hasAnyLesson || loading ? (
        <DayTabs
          days={weekDays}
          selected={selectedDay}
          onSelect={selectDay}
          disabled={loading && !hasAnyLesson}
        />
      ) : null}

      {error ? (
        <p className="mb-4 whitespace-pre-wrap rounded-[12px] bg-pale-red px-3 py-2 text-sm text-pale-red-ink">
          {error}
        </p>
      ) : null}

      {!cacheReady || (loading && !hasAnyLesson) ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !hasAnyLesson ? (
        <EmptyState
          title={
            online ? t("schedule_empty_online") : t("schedule_empty_offline")
          }
          body={
            online
              ? t("schedule_empty_online_body")
              : t("schedule_empty_offline_body")
          }
        />
      ) : activeDay ? (
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={activeDay.day}
              custom={direction}
              variants={
                reduced
                  ? {
                      enter: { opacity: 1 },
                      center: { opacity: 1 },
                      exit: { opacity: 0 },
                    }
                  : daySlide
              }
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: reduced ? 0 : 0.38,
                ease: EASE_SPRING_SOFT,
              }}
            >
              <DayPanel day={activeDay} />
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </>
  );
}

const daySlide = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? 28 : -28,
  }),
  center: {
    opacity: 1,
    x: 0,
  },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir >= 0 ? -20 : 20,
  }),
};

function DayTabs({
  days,
  selected,
  onSelect,
  disabled,
}: {
  days: WeekDay[];
  selected: number;
  onSelect: (day: number) => void;
  disabled?: boolean;
}) {
  const today = todayDayIndex();
  const { t } = useT();

  return (
    <div className="mb-5">
      <div className="rounded-[1.2rem] border border-white/[0.07] bg-white/[0.03] p-1">
        <div
          role="tablist"
          aria-label={t("schedule_day_aria")}
          className="flex gap-0.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((day) => {
            const active = day.day === selected;
            const isToday = day.day === today;
            return (
              <button
                key={day.day}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                onClick={() => onSelect(day.day)}
                className={cn(
                  "relative flex min-w-[2.85rem] flex-1 flex-col items-center gap-0.5 rounded-[0.95rem] px-1.5 py-2.5",
                  "transition-[color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  "active:scale-[0.96] disabled:opacity-50",
                  active ? "text-[var(--cta-ink)]" : "text-muted hover:text-ink/80",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="schedule-day-pill"
                    className="absolute inset-0 rounded-[0.95rem] bg-[var(--cta)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 34,
                      mass: 0.7,
                    }}
                  />
                ) : null}
                <span className="relative z-[1] font-mono text-[11px] font-medium uppercase tracking-[0.06em]">
                  {day.short}
                </span>
                <span
                  className={cn(
                    "relative z-[1] h-1 w-1 rounded-full transition-opacity duration-300",
                    day.lessonCount > 0
                      ? active
                        ? "bg-[var(--cta-ink)]/40"
                        : "bg-ink/30"
                      : "opacity-0",
                    isToday && !active && day.lessonCount === 0
                      ? "bg-ink/25 opacity-100"
                      : null,
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayPanel({ day }: { day: WeekDay }) {
  const reduced = useReducedMotion();
  const { t } = useT();

  if (day.rows.length === 0) {
    return (
      <div className="rounded-[1.2rem] border border-white/[0.07] bg-white/[0.03] p-1">
        <div className="glass-panel flex flex-col items-center justify-center rounded-[calc(1.2rem-0.25rem)] border border-white/[0.05] px-4 py-10 text-center">
          <p className="text-[15px] font-medium tracking-tight text-ink">
            {t("schedule_day_off")}
          </p>
          <p className="mt-1 text-sm text-muted">{t("schedule_day_off_body")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.2rem] border border-white/[0.07] bg-white/[0.03] p-1">
      <ul className="glass-panel overflow-hidden rounded-[calc(1.2rem-0.25rem)] border border-white/[0.05]">
        {day.rows.map((row, i) =>
          row.kind === "gap" ? (
            <motion.li
              key={row.id}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduced ? 0 : 0.32,
                ease: EASE_OUT_EXPO,
                delay: reduced ? 0 : 0.04 + i * 0.035,
              }}
              className="border-t border-white/[0.04] px-4 py-2.5 first:border-t-0 md:px-5"
            >
              <p
                className={cn(
                  "font-mono text-[13px]",
                  row.gapType === "window" ? "text-pale-yellow-ink/90" : "text-muted",
                )}
              >
                {row.start} – {row.end}
                <span className="mx-2 opacity-50">—</span>
                <span className="font-sans italic">
                  {row.gapType === "window"
                    ? t("schedule_window")
                    : t("schedule_break")}
                </span>
              </p>
            </motion.li>
          ) : (
            <motion.li
              key={row.id}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduced ? 0 : 0.38,
                ease: EASE_OUT_EXPO,
                delay: reduced ? 0 : 0.05 + i * 0.04,
              }}
              className="border-t border-white/[0.06] px-4 py-3.5 first:border-t-0 md:px-5"
            >
              <div className="flex flex-col gap-1 sm:block">
                <p className="font-mono text-[13px] tabular-nums text-muted">
                  {row.start}
                  {row.end ? ` – ${row.end}` : ""}
                </p>
                <p className="text-[15px] font-medium tracking-tight text-ink">
                  {row.title}
                </p>
              </div>
              {row.meta ? (
                <p className="mt-1 text-sm text-muted break-words">{row.meta}</p>
              ) : null}
            </motion.li>
          ),
        )}
      </ul>
    </div>
  );
}

function buildWeekTimeline(
  lessons: ScheduleLesson[],
  translate: (key: MessageKey) => string,
): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const keys = dayNameKeys(index);
    const day = index + 1;
    const dayLessons = lessons
      .filter((l) => normalizeDay(l.day) === day)
      .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    const rows = buildDayRows(dayLessons, day, translate);

    return {
      day,
      name: translate(keys.full),
      short: translate(keys.short),
      rows,
      lessonCount: rows.filter((r) => r.kind === "lesson").length,
    };
  });
}

function buildDayRows(
  lessons: ScheduleLesson[],
  day: number,
  translate: (key: MessageKey) => string,
): TimelineRow[] {
  const rows: TimelineRow[] = [];

  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const start = formatTime(lesson.startTime);
    const end = formatTime(lesson.endTime);

    if (i > 0) {
      const prev = lessons[i - 1];
      const prevEnd = toMinutes(prev.endTime || prev.startTime);
      const nextStart = toMinutes(lesson.startTime);
      const gap = nextStart - prevEnd;
      if (prevEnd >= 0 && nextStart >= 0 && gap >= GAP_SHOW_MINUTES) {
        rows.push({
          kind: "gap",
          id: `gap-${day}-${i}`,
          start: formatTime(prev.endTime || prev.startTime),
          end: formatTime(lesson.startTime),
          gapType: gap > BREAK_MAX_MINUTES ? "window" : "break",
        });
      }
    }

    rows.push({
      kind: "lesson",
      id: lesson.id || `lesson-${day}-${i}`,
      start,
      end,
      // Subject title stays as Platonus returns it
      title: lesson.subject || translate("schedule_lesson_fallback"),
      meta: [lesson.teacher, lesson.room].filter(Boolean).join(" · ") || undefined,
    });
  }

  return rows;
}

/** JS Sunday=0 → schedule day 7; Mon=1 → 1 … Sat=6 → 6 */
function todayDayIndex(): number {
  const js = new Date().getDay();
  return js === 0 ? 7 : js;
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
