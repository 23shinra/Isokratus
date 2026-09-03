"use client";

import { useEffect, useState } from "react";
import { apiStudyYears, apiTerms } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { Field, Select } from "@/components/ui";

export type PeriodState = {
  year: string;
  term: string;
  week: string;
  years: { id: string; label: string }[];
  terms: { id: string; label: string }[];
  loading: boolean;
  error: string | null;
  setYear: (v: string) => void;
  setTerm: (v: string) => void;
  setWeek: (v: string) => void;
};

export function useAcademicPeriod(): PeriodState {
  const session = useAuthStore((s) => s.session);
  const [years, setYears] = useState<{ id: string; label: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; label: string }[]>([]);
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [week, setWeek] = useState("1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [yearsRes, termsRes] = await Promise.all([
          apiStudyYears(session).catch(() => ({ items: [] as { id: string; label: string }[] })),
          apiTerms(session).catch(() => ({ items: [] as { id: string; label: string }[] })),
        ]);
        if (cancelled) return;

        const yItems =
          yearsRes.items.length > 0
            ? yearsRes.items
            : fallbackYears();
        const tItems =
          termsRes.items.length > 0
            ? termsRes.items
            : [
                { id: "1", label: "1 семестр" },
                { id: "2", label: "2 семестр" },
                { id: "3", label: "3 триместр" },
              ];

        setYears(yItems);
        setTerms(tItems);
        setYear((prev) => prev || yItems[0]?.id || "");
        setTerm((prev) => prev || tItems[0]?.id || "1");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки периода");
          const y = fallbackYears();
          setYears(y);
          setYear(y[0].id);
          setTerms([
            { id: "1", label: "1 семестр" },
            { id: "2", label: "2 семестр" },
          ]);
          setTerm("1");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return {
    year,
    term,
    week,
    years,
    terms,
    loading,
    error,
    setYear,
    setTerm,
    setWeek,
  };
}

function fallbackYears() {
  const now = new Date();
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    { id: String(y), label: `${y}-${y + 1}` },
    { id: String(y - 1), label: `${y - 1}-${y}` },
  ];
}

export function PeriodFilters({
  period,
}: {
  period: PeriodState;
  /** @deprecated week picker removed from schedule UI */
  showWeek?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Год">
        <Select
          value={period.year}
          onChange={(e) => period.setYear(e.target.value)}
          disabled={period.loading}
        >
          {period.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Период">
        <Select
          value={period.term}
          onChange={(e) => period.setTerm(e.target.value)}
          disabled={period.loading}
        >
          {period.terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
