"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, UsersThree } from "@phosphor-icons/react";
import { apiUsage } from "@/lib/api-client";
import { isAdminFio } from "@/lib/admin";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/cn";

type UsageRow = {
  id: string;
  fio: string;
  login: string;
  university: string;
  firstSeenAt: string;
  lastSeenAt: string;
  loginCount: number;
};

export function UsageAdminPanel() {
  const session = useAuthStore((s) => s.session);
  const isAdmin = isAdminFio(session?.fio);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiUsage(session);
      setTotal(data.total);
      setRows(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить");
    } finally {
      setLoading(false);
    }
  }, [session, isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isAdmin) return null;

  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-muted">Пользователи</p>
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
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pale-blue/40 text-pale-blue-ink">
            <UsersThree size={18} weight="regular" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-ink">
              Всего:{" "}
              <span className="font-medium tabular-nums">{total}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              Успешные входы в Sokratus (появятся после входа)
            </p>
          </div>
        </div>

        {error ? (
          <p className="rounded-[10px] bg-pale-red/30 px-3 py-2 text-[12px] text-pale-red-ink">
            {error}
          </p>
        ) : null}

        {!error && rows.length === 0 && !loading ? (
          <p className="text-[12px] text-muted">Пока никого нет</p>
        ) : null}

        {rows.length > 0 ? (
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {rows.map((u) => (
              <li
                key={u.id}
                className="rounded-[12px] border border-white/[0.06] bg-black/25 px-3 py-2.5"
              >
                <p className="truncate text-sm font-medium text-ink">
                  {u.fio || u.login}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  {u.university}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted/80">
                  {u.login} · {formatWhen(u.lastSeenAt)}
                </p>
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
