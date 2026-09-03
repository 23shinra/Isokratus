"use client";

import { useEffect, useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { AppChrome } from "@/components/app-chrome";
import { PeriodFilters, useAcademicPeriod } from "@/components/period-filters";
import { Reveal } from "@/components/motion";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Shell,
  Skeleton,
} from "@/components/ui";
import { apiJournal, apiJournalRecords } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import type { JournalRecord, JournalSubject } from "@/lib/platonus/types";

export default function GradesPage() {
  return (
    <AppChrome>
      <Shell>
        <GradesView />
      </Shell>
    </AppChrome>
  );
}

type SubjectDetail = {
  summary: JournalRecord[];
  currents: JournalRecord[];
  error: string | null;
};

function GradesView() {
  const session = useAuthStore((s) => s.session);
  const period = useAcademicPeriod();
  const [subjects, setSubjects] = useState<JournalSubject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    if (!session || !period.year || !period.term || period.loading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setOpenId(null);
      setDetail(null);
      try {
        const res = await apiJournal(session, {
          year: period.year,
          term: period.term,
        });
        if (!cancelled) setSubjects(res.subjects);
      } catch (err) {
        if (!cancelled) {
          setSubjects([]);
          setError(err instanceof Error ? err.message : "Ошибка журнала");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, period.year, period.term, period.loading]);

  async function toggleSubject(subject: JournalSubject) {
    if (!session) return;
    if (openId === subject.id) {
      setOpenId(null);
      setDetail(null);
      return;
    }

    const localSummary = subject.summary ?? [];
    const localEmbedded = subject.embedded ?? [];

    setOpenId(subject.id);
    setDetail({
      summary: localSummary,
      currents: localEmbedded,
      error: null,
    });
    setRecordsLoading(true);

    try {
      const res = await apiJournalRecords(session, {
        year: period.year,
        term: period.term,
        subjectId: subject.id,
      });

      const fetched = res.records ?? [];
      // Records with dates = текущие занятия; without = сводка
      const fetchedCurrents = fetched.filter((r) => Boolean(r.date));
      const fetchedSummary = fetched.filter((r) => !r.date);

      setDetail({
        summary: mergeRecords(localSummary, fetchedSummary),
        currents: mergeRecords(localEmbedded, fetchedCurrents),
        error: null,
      });
    } catch (err) {
      setDetail({
        summary: localSummary,
        currents: localEmbedded,
        error:
          localSummary.length || localEmbedded.length
            ? null
            : err instanceof Error
              ? err.message
              : "Не удалось загрузить детали",
      });
    } finally {
      setRecordsLoading(false);
    }
  }

  return (
    <>
      <Reveal>
        <PageHeader title="Журнал" />
      </Reveal>

      <Reveal delay={0.08} className="mb-6">
        <Panel>
          <PeriodFilters period={period} />
        </Panel>
      </Reveal>

      {error ? (
        <p className="mb-4 rounded-[12px] bg-pale-red px-3 py-2 text-sm text-pale-red-ink">
          {error}
        </p>
      ) : null}

      {loading || period.loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState title="Предметов нет" body="Проверь учебный год и период." />
      ) : (
        <div className="rounded-[1.35rem] border border-white/[0.07] bg-white/[0.03] p-1.5">
          <ul className="glass-panel overflow-hidden rounded-[calc(1.35rem-0.375rem)] border border-white/[0.05]">
            {subjects.map((subject) => {
              const open = openId === subject.id;
              const preview = previewMarks(subject.summary ?? []);
              return (
                <li
                  key={subject.id}
                  className="border-b border-white/[0.06] last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.04] active:scale-[0.995] md:px-5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium tracking-tight text-ink">{subject.name}</p>
                      {subject.teacher ? (
                        <p className="mt-1 text-sm text-muted">{subject.teacher}</p>
                      ) : null}
                      {!open && preview ? (
                        <p className="mt-2 text-[11px] text-muted">{preview}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {subject.total != null && subject.total !== "" ? (
                        <Badge tone="green">{String(subject.total)}</Badge>
                      ) : null}
                      {subject.letter ? <Badge tone="blue">{String(subject.letter)}</Badge> : null}
                      {open ? (
                        <CaretUp size={16} weight="light" className="text-muted" />
                      ) : (
                        <CaretDown size={16} weight="light" className="text-muted" />
                      )}
                    </div>
                  </button>

                  {open && detail ? (
                    <div className="space-y-4 border-t border-white/[0.06] bg-black/30 px-4 py-4 md:px-5">
                      {recordsLoading ? (
                        <p className="text-xs text-muted">Загрузка оценок…</p>
                      ) : null}

                      {detail.error ? (
                        <p className="text-sm text-pale-red-ink">{detail.error}</p>
                      ) : null}

                      {detail.summary.length > 0 ? (
                        <MarksBlock title="Оценки по предмету" records={detail.summary} />
                      ) : null}

                      {detail.currents.length > 0 ? (
                        <MarksBlock
                          title="Текущие оценки по занятиям"
                          records={detail.currents}
                          showDate
                        />
                      ) : null}

                      {!recordsLoading &&
                      detail.summary.length === 0 &&
                      detail.currents.length === 0 &&
                      !detail.error ? (
                        <p className="text-sm text-muted">
                          По этому предмету пока нет разобранных оценок.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function previewMarks(summary: JournalRecord[]): string {
  const preferred = summary.filter((s) =>
    ["РК", "СР", "Средний", "Рейтинг", "Экзамен", "Итого"].includes(s.type),
  );
  const list = (preferred.length ? preferred : summary).slice(0, 4);
  if (!list.length) return "";
  return list.map((s) => `${s.title}: ${s.mark}`).join(" · ");
}

function MarksBlock({
  title,
  records,
  showDate = false,
}: {
  title: string;
  records: JournalRecord[];
  showDate?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-muted">{title}</p>
      <ul className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-black/35">
        {records.map((record) => (
          <li
            key={record.id}
            className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3 text-sm last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-ink">{record.title}</p>
              {showDate ? (
                <p className="mt-0.5 text-[11px] text-muted">
                  {record.date || "Дата не указана"}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-base font-medium tabular-nums text-ink">
              {record.mark}
            </span>
          </li>
        ))}
      </ul>
    </div>
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
