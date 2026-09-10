"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ClockCounterClockwise,
  MinusCircle,
  PlusCircle,
  Swap,
  Trash,
} from "@phosphor-icons/react";
import { EASE_OUT_EXPO, EASE_SPRING_SOFT } from "@/components/motion";
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Shell,
} from "@/components/ui";
import { formatLessonLine } from "@/lib/schedule-history";
import { useScheduleHistoryStore } from "@/lib/schedule-history-store";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

export default function HistoryPage() {
  return (
    <Shell>
      <HistoryView />
    </Shell>
  );
}

function HistoryView() {
  const { lang, t, historyWord } = useT();
  const changes = useScheduleHistoryStore((s) => s.changes);
  const lastCheckedAt = useScheduleHistoryStore((s) => s.lastCheckedAt);
  const markAllRead = useScheduleHistoryStore((s) => s.markAllRead);
  const clearHistory = useScheduleHistoryStore((s) => s.clearHistory);
  const unreadCount = useScheduleHistoryStore((s) => s.unreadCount);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  function confirmClear() {
    clearHistory();
    setConfirmOpen(false);
  }

  const locale = lang === "kz" ? "kk-KZ" : lang === "en" ? "en-GB" : "ru-RU";

  return (
    <>
      <PageHeader
        title={t("history_title")}
        subtitle={t("history_sub")}
        action={
          changes.length ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(true)}
            >
              {t("history_clear")}
            </Button>
          ) : null
        }
      />

      <Panel className="mb-5">
        <p className="text-sm text-muted">
          {t("history_last_check")}{" "}
          <span className="text-ink">
            {formatWhen(lastCheckedAt, locale, t("history_never"))}
          </span>
          {unreadCount > 0 ? (
            <span className="ml-2 text-pale-red-ink">
              {t("history_new", { count: unreadCount })}
            </span>
          ) : null}
        </p>
      </Panel>

      {changes.length === 0 ? (
        <EmptyState
          title={t("history_empty_title")}
          body={t("history_empty_body")}
        />
      ) : (
        <ul className="space-y-4">
          {changes.map((change) => (
            <li key={change.id}>
              <div
                className={cn(
                  "rounded-[1.2rem] border p-1",
                  change.unread
                    ? "border-pale-yellow-ink/25 bg-pale-yellow/10"
                    : "border-white/[0.07] bg-white/[0.03]",
                )}
              >
                <div className="rounded-[calc(1.2rem-0.25rem)] border border-white/[0.05] bg-[var(--chrome)]/80 px-4 py-4 md:px-5">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-sm font-medium text-ink">
                        {formatWhen(change.at, locale, t("history_never"))}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted">
                        {change.year} · {t("history_period", { term: change.term })}
                      </p>
                    </div>
                    <ClockCounterClockwise
                      size={18}
                      weight="light"
                      className="shrink-0 text-muted"
                    />
                  </div>

                  {change.added.length ? (
                    <DiffBlock
                      tone="green"
                      icon={<PlusCircle size={16} weight="fill" />}
                      title={`${t("history_added")} (${change.added.length})`}
                      lines={change.added.map(formatLessonLine)}
                    />
                  ) : null}

                  {change.removed.length ? (
                    <DiffBlock
                      tone="red"
                      icon={<MinusCircle size={16} weight="fill" />}
                      title={`${t("history_removed")} (${change.removed.length})`}
                      lines={change.removed.map(formatLessonLine)}
                    />
                  ) : null}

                  {change.changed.length ? (
                    <div className="mt-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-pale-blue-ink">
                        <Swap size={16} weight="fill" />
                        {t("history_changed")} ({change.changed.length})
                      </p>
                      <ul className="space-y-2">
                        {change.changed.map((row) => (
                          <li
                            key={`${row.before.key}->${row.after.key}`}
                            className="rounded-[12px] border border-white/[0.06] bg-black/25 px-3 py-2.5 text-sm"
                          >
                            <p className="text-muted line-through decoration-white/20">
                              {formatLessonLine(row.before)}
                            </p>
                            <p className="mt-1 flex items-start gap-1.5 text-ink">
                              <ArrowRight
                                size={14}
                                weight="bold"
                                className="mt-1 shrink-0 text-muted"
                              />
                              <span>{formatLessonLine(row.after)}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmClearModal
        open={confirmOpen}
        count={changes.length}
        word={historyWord(changes.length)}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmClear}
      />
    </>
  );
}

function ConfirmClearModal({
  open,
  count,
  word,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  word: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const reduced = useReducedMotion();
  const { t } = useT();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="clear-confirm"
          className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 sm:items-center sm:pb-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-history-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.28, ease: EASE_OUT_EXPO }}
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/65"
            onClick={onCancel}
          />
          <motion.div
            initial={
              reduced ? { opacity: 1 } : { opacity: 0, y: 28, scale: 0.96 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }
            }
            transition={{
              duration: reduced ? 0 : 0.42,
              ease: EASE_SPRING_SOFT,
            }}
            className="relative w-full max-w-[22rem] rounded-[1.5rem] border border-pale-red-ink/25 bg-pale-red/15 p-1"
          >
            <div className="rounded-[calc(1.5rem-0.25rem)] border border-pale-red-ink/15 bg-[var(--dialog)] px-5 pb-5 pt-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-pale-red-ink/25 bg-pale-red/30 text-pale-red-ink">
                <Trash size={28} weight="fill" />
              </span>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-pale-red-ink/75">
                {t("history_clear_eyebrow")}
              </p>
              <h2
                id="clear-history-title"
                className="mt-2 font-display text-2xl font-medium tracking-tight text-ink"
              >
                {t("history_clear_title")}
              </h2>
              <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-ink/85">
                {t("history_clear_body", { count, word })}
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={onCancel}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  className="w-full border-0 bg-pale-red text-pale-red-ink hover:bg-pale-red/80 sm:w-auto"
                  onClick={onConfirm}
                >
                  {t("history_clear_action")}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DiffBlock({
  title,
  lines,
  icon,
  tone,
}: {
  title: string;
  lines: string[];
  icon: ReactNode;
  tone: "green" | "red";
}) {
  return (
    <div className="mt-3">
      <p
        className={cn(
          "mb-2 flex items-center gap-1.5 text-[12px] font-medium",
          tone === "green" ? "text-pale-green-ink" : "text-pale-red-ink",
        )}
      >
        {icon}
        {title}
      </p>
      <ul className="space-y-1.5">
        {lines.map((line) => (
          <li
            key={line}
            className="rounded-[12px] border border-white/[0.06] bg-black/25 px-3 py-2 text-sm text-ink"
          >
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatWhen(iso: string | null, locale: string, never: string): string {
  if (!iso) return never;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
