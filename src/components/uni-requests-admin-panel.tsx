"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowsClockwise,
  Check,
  ChatTeardropText,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import {
  apiUniRequestDone,
  apiUniRequests,
  type UniRequestRow,
} from "@/lib/api-client";
import { isAdminFio } from "@/lib/admin";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/use-i18n";

export function UniRequestsAdminPanel() {
  const { t } = useT();
  const session = useAuthStore((s) => s.session);
  const isAdmin = isAdminFio(session?.fio);
  const [rows, setRows] = useState<UniRequestRow[]>([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiUniRequests(session);
      setPending(data.pending);
      setRows(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [session, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleDone(row: UniRequestRow) {
    if (!session) return;
    setBusyId(row.id);
    try {
      await apiUniRequestDone(session, row.id, !row.done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить");
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">
          {t("admin_uni_requests")}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Обновить список"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
        >
          <ArrowsClockwise
            size={14}
            weight="light"
            className={cn(loading && "animate-spin")}
          />
        </button>
      </div>

      <div className="rounded-[14px] border border-white/[0.08] bg-black/25 px-3.5 py-3">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pale-yellow/40 text-pale-yellow-ink">
            <ChatTeardropText size={18} weight="regular" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-ink">
              {t("admin_uni_pending", { n: pending })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {t("admin_uni_requests_hint")}
            </p>
          </div>
        </div>

        {error ? (
          <p className="rounded-[10px] bg-pale-red/30 px-3 py-2 text-[12px] text-pale-red-ink">
            {error}
          </p>
        ) : null}

        {!error && rows.length === 0 && !loading ? (
          <p className="text-[12px] text-muted">{t("admin_uni_requests_empty")}</p>
        ) : null}

        {rows.length > 0 ? (
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {rows.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-[12px] border border-white/[0.06] bg-black/25 px-3 py-2.5",
                  r.done && "opacity-55",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {r.universityName}
                    </p>
                    <a
                      href={`https://t.me/${r.telegram.replace(/^@/, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 block truncate text-[12px] text-pale-blue-ink underline-offset-2 hover:underline"
                    >
                      {r.telegram}
                    </a>
                    <p className="mt-1 font-mono text-[10px] text-muted/80">
                      {formatWhen(r.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void toggleDone(r)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-1 text-[11px] text-muted transition hover:bg-white/[0.06] hover:text-ink disabled:opacity-50"
                  >
                    {r.done ? (
                      <>
                        <ArrowCounterClockwise size={12} weight="bold" />
                        {t("admin_uni_request_reopen")}
                      </>
                    ) : (
                      <>
                        <Check size={12} weight="bold" />
                        {t("admin_uni_request_done")}
                      </>
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
