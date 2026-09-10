"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowsClockwise, CaretDown } from "@phosphor-icons/react";
import { PeriodFilters, useAcademicPeriod } from "@/components/period-filters";
import { EASE_OUT_EXPO, EASE_SPRING_SOFT } from "@/components/motion";
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Shell,
  Skeleton,
} from "@/components/ui";
import { apiJournal, apiJournalRecords } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { useDataCacheStore } from "@/lib/data-cache-store";
import type { JournalRecord, JournalSubject } from "@/lib/lms/types";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

export default function GradesPage() {
  return (
    <Shell>
      <GradesView />
    </Shell>
  );
}

type SubjectDetail = {
  summary: JournalRecord[];
  currents: JournalRecord[];
  error: string | null;
};

function GradesView() {
  const session = useAuthStore((s) => s.session);
  const { t } = useT();
  const period = useAcademicPeriod();
  const saveJournal = useDataCacheStore((s) => s.saveJournal);
  const findJournal = useDataCacheStore((s) => s.findJournal);
  const reduced = useReducedMotion();
  const [subjects, setSubjects] = useState<JournalSubject[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<Record<string, SubjectDetail>>(
    {},
  );

  const baseUrl = session?.baseUrl;
  const token = session?.token;
  const year = period.year;
  const term = period.term;

  const loadJournal = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!baseUrl || !token || !year || !term) return;
      const soft = Boolean(opts?.soft);
      const hasCache = Boolean(
        useDataCacheStore.getState().findJournal(baseUrl, year, term)?.subjects
          ?.length,
      );

      if (soft) {
        setRefreshing(true);
      } else if (!hasCache) {
        setLoading(true);
      }

      setError(null);

      try {
        const live = useAuthStore.getState().session;
        if (!live) return;
        const res = await apiJournal(live, { year, term });
        const list = res.subjects ?? [];
        if (list.length) {
          setSubjects(list);
          saveJournal(live.baseUrl, year, term, list);
          if (!soft) {
            setDetailsById({});
            setOpenId(null);
          }
        } else {
          const again = useDataCacheStore
            .getState()
            .findJournal(baseUrl, year, term);
          if (again?.subjects?.length) {
            setSubjects(again.subjects);
          } else {
            setSubjects([]);
          }
        }
      } catch (err) {
        const again = useDataCacheStore
          .getState()
          .findJournal(baseUrl, year, term);
        if (again?.subjects?.length) {
          setSubjects(again.subjects);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : t("grades_error"));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [baseUrl, token, year, term, saveJournal, t, session?.lang],
  );

  useEffect(() => {
    if (!baseUrl || !token || !year || !term) return;
    let cancelled = false;

    const cached = findJournal(baseUrl, year, term);
    if (cached?.subjects?.length) {
      setSubjects(cached.subjects);
      setLoading(false);
    } else {
      setLoading(true);
      setSubjects([]);
    }

    void (async () => {
      await loadJournal();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, token, year, term, findJournal, loadJournal, session?.lang]);

  async function toggleSubject(subject: JournalSubject) {
    if (!session) return;
    if (openId === subject.id) {
      setOpenId(null);
      return;
    }

    const localSummary = subject.summary ?? [];
    const localEmbedded = subject.embedded ?? [];
    const subjectId = subject.id;
    const cachedDetail = detailsById[subjectId];

    setOpenId(subjectId);
    if (!cachedDetail) {
      setDetailsById((prev) => ({
        ...prev,
        [subjectId]: {
          summary: localSummary,
          currents: localEmbedded,
          error: null,
        },
      }));
    }

    // Silent background refresh of records — no “loading…” banner
    try {
      const tutorSubjectId =
        subject.tutorSubjectId ||
        (typeof subject.raw?.tutorSubjectID === "string" ||
        typeof subject.raw?.tutorSubjectID === "number"
          ? String(subject.raw.tutorSubjectID)
          : typeof subject.raw?.tutorSubjectId === "string" ||
              typeof subject.raw?.tutorSubjectId === "number"
            ? String(subject.raw.tutorSubjectId)
            : undefined);

      const res = await apiJournalRecords(session, {
        year,
        term,
        subjectId,
        tutorSubjectId,
      });

      const fetched = res.records ?? [];
      const fetchedCurrents = fetched.filter((r) => Boolean(r.date) || r.mark !== "—");
      const fetchedSummary = fetched.filter((r) => !r.date && r.mark !== "—");

      setDetailsById((prev) => ({
        ...prev,
        [subjectId]: {
          summary: mergeRecords(
            prev[subjectId]?.summary ?? localSummary,
            fetchedSummary,
          ),
          currents: mergeRecords(
            prev[subjectId]?.currents ?? localEmbedded,
            fetchedCurrents,
          ),
          error: null,
        },
      }));
    } catch (err) {
      setDetailsById((prev) => {
        const current = prev[subjectId];
        const summary = current?.summary ?? localSummary;
        const currents = current?.currents ?? localEmbedded;
        if (summary.length || currents.length) {
          return {
            ...prev,
            [subjectId]: { summary, currents, error: null },
          };
        }
        return {
          ...prev,
          [subjectId]: {
            summary,
            currents,
            error:
              err instanceof Error
                ? err.message
                : t("grades_detail_error"),
          },
        };
      });
    }
  }

  return (
    <PullToRefresh
      onRefresh={() => loadJournal({ soft: true })}
      disabled={loading || refreshing || !subjects.length}
    >
      <PageHeader
        title={t("grades_title")}
        action={
          <Button
            type="button"
            variant="ghost"
            disabled={loading || refreshing || !session}
            onClick={() => void loadJournal({ soft: true })}
            aria-label={t("grades_refresh")}
            className="h-10 w-10 min-h-10 shrink-0 gap-0 px-0 sm:h-11 sm:w-auto sm:min-h-11 sm:gap-2 sm:px-3.5"
          >
            <ArrowsClockwise
              size={18}
              weight="light"
              className={cn(refreshing && "animate-spin")}
            />
            <span className="hidden sm:inline">{t("grades_refresh_label")}</span>
          </Button>
        }
      />

      <div className="mb-6">
        <Panel>
          <PeriodFilters period={period} />
        </Panel>
      </div>

      {error ? (
        <p className="mb-4 rounded-[12px] bg-pale-red px-3 py-2 text-sm text-pale-red-ink">
          {error}
        </p>
      ) : null}

      {loading && subjects.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          title={t("grades_empty_title")}
          body={t("grades_empty_body")}
        />
      ) : (
        <div className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.03] p-1.5">
          <ul className="glass-panel overflow-hidden rounded-[calc(1.35rem-0.375rem)] border border-white/[0.05]">
            {subjects.map((subject) => {
              const open = openId === subject.id;
              const panelDetail = detailsById[subject.id];
              return (
                <li
                  key={subject.id}
                  className="border-b border-white/[0.06] last:border-b-0"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleSubject(subject)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.04] active:scale-[0.995] md:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium tracking-tight text-ink">
                        {subject.name}
                      </p>
                      {subject.teacher ? (
                        <p className="mt-1 text-sm text-muted">{subject.teacher}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                      {subject.total != null && subject.total !== "" ? (
                        <GradeOrb value={subject.total} />
                      ) : subject.letter ? (
                        <GradeOrb value={subject.letter} letter />
                      ) : null}
                      <motion.span
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.4,
                          ease: EASE_SPRING_SOFT,
                        }}
                        className="inline-flex text-muted"
                      >
                        <CaretDown size={16} weight="light" />
                      </motion.span>
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {open && panelDetail ? (
                      <motion.div
                        key={`panel-${subject.id}`}
                        initial={
                          reduced
                            ? { opacity: 1 }
                            : { height: 0, opacity: 0 }
                        }
                        animate={{ height: "auto", opacity: 1 }}
                        exit={
                          reduced
                            ? { opacity: 0 }
                            : { height: 0, opacity: 0 }
                        }
                        transition={{
                          height: {
                            duration: reduced ? 0 : 0.42,
                            ease: EASE_SPRING_SOFT,
                          },
                          opacity: {
                            duration: reduced ? 0 : 0.28,
                            ease: EASE_OUT_EXPO,
                          },
                        }}
                        className="overflow-hidden"
                      >
                        <motion.div
                          initial={reduced ? false : { y: -8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={reduced ? undefined : { y: -6, opacity: 0 }}
                          transition={{
                            duration: reduced ? 0 : 0.36,
                            ease: EASE_OUT_EXPO,
                            delay: reduced ? 0 : 0.04,
                          }}
                          className="space-y-4 border-t border-white/[0.06] bg-black/30 px-4 py-4 md:px-5"
                        >
                          {panelDetail.error ? (
                            <p className="text-sm text-pale-red-ink">
                              {panelDetail.error}
                            </p>
                          ) : null}

                          {panelDetail.summary.length > 0 ? (
                            <SummaryGrid
                              records={panelDetail.summary}
                              reduced={!!reduced}
                            />
                          ) : null}

                          {panelDetail.currents.length > 0 ? (
                            <MarksBlock
                              title={t("grades_current")}
                              records={panelDetail.currents}
                              showDate
                              reduced={!!reduced}
                            />
                          ) : null}

                          {panelDetail.summary.length === 0 &&
                          panelDetail.currents.length === 0 &&
                          !panelDetail.error ? (
                            <p className="text-sm text-muted">
                              По этому предмету пока нет разобранных оценок.
                            </p>
                          ) : null}
                        </motion.div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </PullToRefresh>
  );
}

/** Pull down at top of page to refresh — same gesture as native apps. */
function PullToRefresh({
  children,
  onRefresh,
  disabled,
}: {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const THRESHOLD = 72;
  const MAX = 112;

  function onTouchStart(e: TouchEvent) {
    if (disabled || busy) return;
    if (typeof window !== "undefined" && window.scrollY > 2) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }

  function onTouchMove(e: TouchEvent) {
    if (!pulling.current || disabled || busy) return;
    if (typeof window !== "undefined" && window.scrollY > 2) {
      pulling.current = false;
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band: diminishing returns
    const damped = Math.min(MAX, dy * 0.45);
    setPull(damped);
  }

  async function onTouchEnd() {
    if (!pulling.current) return;
    pulling.current = false;
    if (pull >= THRESHOLD && !disabled && !busy) {
      setBusy(true);
      setPull(48);
      try {
        await onRefresh();
      } finally {
        setBusy(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const showHint = pull > 8 || busy;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={() => void onTouchEnd()}
      onTouchCancel={() => {
        pulling.current = false;
        if (!busy) setPull(0);
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none flex items-end justify-center overflow-hidden"
        style={{
          height: showHint ? pull : 0,
          transition: pulling.current || busy
            ? undefined
            : reduced
              ? undefined
              : "height 320ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div
          className={cn(
            "mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-[var(--chrome)] text-muted",
            (busy || pull >= THRESHOLD) && "text-ink",
          )}
        >
          <ArrowsClockwise
            size={18}
            weight="light"
            className={cn(
              busy && "animate-spin",
              !busy && pull > 0 && !reduced
                ? undefined
                : null,
            )}
            style={
              !busy && pull > 0
                ? { transform: `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)` }
                : undefined
            }
          />
        </div>
      </div>
      {children}
    </div>
  );
}

function SummaryGrid({
  records,
  reduced = false,
}: {
  records: JournalRecord[];
  reduced?: boolean;
}) {
  const preferred = [
    "Ср.тек. 1",
    "Ср.тек. 2",
    "Орт.ағым. 1",
    "Орт.ағым. 2",
    "РК 1",
    "РК 2",
    "АБ 1",
    "АБ 2",
    "Рейтинг",
    "Экз.",
    "Емт.",
    "Экзамен",
  ];
  const byTitle = new Map(records.map((r) => [r.title, r]));
  const grid: JournalRecord[] = [];
  const seen = new Set<string>();
  for (const title of preferred) {
    const hit = byTitle.get(title);
    if (!hit || seen.has(hit.id)) continue;
    // Prefer one slot per logical column (don't show both РК 1 and АБ 1)
    const slot = title
      .replace(/^Орт\.ағым\./, "Ср.тек.")
      .replace(/^АБ/, "РК")
      .replace(/^Емт\.$/, "Экз.")
      .replace(/^Экзамен$/, "Экз.");
    if ([...seen].some((id) => {
      const r = grid.find((g) => g.id === id);
      if (!r) return false;
      const s = r.title
        .replace(/^Орт\.ағым\./, "Ср.тек.")
        .replace(/^АБ/, "РК")
        .replace(/^Емт\.$/, "Экз.")
        .replace(/^Экзамен$/, "Экз.");
      return s === slot;
    })) {
      continue;
    }
    seen.add(hit.id);
    grid.push(hit);
  }
  // Fall back only if preferred grid is almost empty
  if (grid.length < 2) {
    for (const r of records) {
      if (
        ["Итого", "Буквенная оценка", "GPA", "Процент", "Средний балл"].includes(
          r.title,
        )
      ) {
        continue;
      }
      if (!grid.some((g) => g.id === r.id)) grid.push(r);
    }
  }

  const cells = grid.slice(0, 6);
  if (!cells.length) return null;

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-muted">Рубежный / текущий контроль</p>
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.34, ease: EASE_OUT_EXPO }}
        className="grid grid-cols-3 overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/35"
      >
        {cells.map((record, i) => (
          <div
            key={record.id}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-2 py-3.5 text-center",
              i % 3 !== 2 && "border-r border-white/[0.06]",
              i < 3 && cells.length > 3 && "border-b border-white/[0.06]",
            )}
          >
            <span className="text-[15px] font-semibold tracking-tight text-ink tabular-nums">
              {formatGridMark(record.mark)}
            </span>
            <span className="text-[10px] leading-tight text-muted">{record.title}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function formatGridMark(mark: string): string {
  const n = Number(String(mark).replace(",", "."));
  if (!Number.isNaN(n) && String(mark).trim() !== "") {
    return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2);
  }
  return mark;
}

function MarksBlock({
  title,
  records,
  showDate = false,
  reduced = false,
}: {
  title: string;
  records: JournalRecord[];
  showDate?: boolean;
  reduced?: boolean;
}) {
  const { t } = useT();
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-muted">{title}</p>
      <ul className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/35">
        {records.map((record, i) => (
          <motion.li
            key={record.id}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduced ? 0 : 0.32,
              ease: EASE_OUT_EXPO,
              delay: reduced ? 0 : 0.06 + i * 0.035,
            }}
            className={cn(
              "flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3 text-sm last:border-b-0",
            )}
          >
            <div className="min-w-0">
              <p className="text-ink">{record.title}</p>
              {showDate ? (
                <p className="mt-0.5 text-[11px] text-muted">
                  {record.date || t("grades_date_unknown")}
                </p>
              ) : null}
            </div>
            <span className="shrink-0">
              <GradeOrb value={record.mark} size="sm" />
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function parseScore(value: string | number): number | null {
  const raw = String(value).trim().replace(",", ".");
  const m = raw.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function formatOrbLabel(value: string | number): string {
  const raw = String(value).trim();
  const score = parseScore(raw);
  if (score == null) return raw.slice(0, 3);
  if (Number.isInteger(score) || Math.abs(score - Math.round(score)) < 0.001) {
    return String(Math.round(score));
  }
  return score.toFixed(1);
}

/** ≥95 gold · ≥75 green · ≥50 yellow · else red */
function gradeToneFromScore(score: number): "gold" | "green" | "yellow" | "red" {
  if (score >= 95) return "gold";
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

function letterTone(letter: string): "gold" | "green" | "yellow" | "red" | "muted" {
  const L = letter.trim().toUpperCase();
  if (L === "A" || L.startsWith("A")) return "gold";
  if (L.startsWith("B")) return "green";
  if (L.startsWith("C") || L.startsWith("D")) return "yellow";
  if (L.startsWith("F") || L === "-") return "red";
  return "muted";
}

function GradeOrb({
  value,
  size = "md",
  letter = false,
}: {
  value: string | number;
  size?: "sm" | "md";
  letter?: boolean;
}) {
  const score = letter ? null : parseScore(value);
  const tone = letter
    ? letterTone(String(value))
    : score == null
      ? "muted"
      : gradeToneFromScore(score);
  const label = letter ? String(value).trim().slice(0, 2) : formatOrbLabel(value);

  const tones: Record<string, string> = {
    gold:
      "bg-[rgba(201,162,39,0.18)] text-[#e8d48a] ring-1 ring-[rgba(232,200,120,0.35)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
    green:
      "bg-pale-green text-pale-green-ink ring-1 ring-[rgba(159,212,168,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    yellow:
      "bg-pale-yellow text-pale-yellow-ink ring-1 ring-[rgba(232,200,120,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    red: "bg-pale-red text-pale-red-ink ring-1 ring-[rgba(240,160,160,0.28)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    muted:
      "bg-white/[0.05] text-muted ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
  };

  return (
    <span
      title={String(value)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-mono font-semibold tabular-nums leading-none",
        size === "md" ? "h-11 w-11 text-[13px]" : "h-8 w-8 text-[11px]",
        tones[tone],
      )}
    >
      {label}
    </span>
  );
}

function mergeRecords(a: JournalRecord[], b: JournalRecord[]): JournalRecord[] {
  const map = new Map<string, JournalRecord>();
  for (const item of [...a, ...b]) {
    const key = `${item.title}|${item.date}|${item.mark}|${item.type}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}
