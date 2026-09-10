"use client";

import { useCallback, useEffect, useState } from "react";
import { apiStudyYears, apiTerms } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { Field, Select } from "@/components/ui";
import { useT } from "@/lib/use-i18n";
import { t as translate } from "@/lib/i18n";
import { usePrefsStore } from "@/lib/prefs-store";

export type PeriodItem = { id: string; label: string; selected?: boolean };

export type PeriodState = {
  year: string;
  term: string;
  week: string;
  years: PeriodItem[];
  terms: PeriodItem[];
  /** True while lists refresh from API — year/term already set for data fetch. */
  loading: boolean;
  error: string | null;
  setYear: (v: string) => void;
  setTerm: (v: string) => void;
  setWeek: (v: string) => void;
};

const PERIOD_KEY = "sokratus-period";

type StoredPeriod = { year: string; term: string };

/** Academic year start (Aug/Sep). */
export function guessAcademicYearId(now = new Date()): string {
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return String(y);
}

/** Semester: Aug–Jan → 1, Feb–Jul → 2. Trimester: Sep–Nov / Dec–Feb / Mar–Aug. */
export function guessTermId(now = new Date(), termCount = 2): string {
  const m = now.getMonth(); // 0–11
  if (termCount >= 3) {
    if (m >= 8 && m <= 10) return "1";
    if (m === 11 || m <= 1) return "2";
    return "3";
  }
  if (m >= 7 || m === 0) return "1";
  return "2";
}

function fallbackYears(): PeriodItem[] {
  const y = Number(guessAcademicYearId());
  return [
    { id: String(y), label: `${y}-${y + 1}` },
    { id: String(y - 1), label: `${y - 1}-${y}` },
  ];
}

function fallbackTerms(count = 2, translate?: (key: "period_semester" | "period_trimester", vars: { n: number }) => string): PeriodItem[] {
  const tr =
    translate ??
    ((key, vars) =>
      key === "period_trimester"
        ? `${vars.n} триместр`
        : `${vars.n} семестр`);
  if (count >= 3) {
    return [
      { id: "1", label: tr("period_trimester", { n: 1 }) },
      { id: "2", label: tr("period_trimester", { n: 2 }) },
      { id: "3", label: tr("period_trimester", { n: 3 }) },
    ];
  }
  return [
    { id: "1", label: tr("period_semester", { n: 1 }) },
    { id: "2", label: tr("period_semester", { n: 2 }) },
  ];
}

function readStoredPeriod(): StoredPeriod | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERIOD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPeriod;
    if (parsed?.year && parsed?.term) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function writeStoredPeriod(year: string, term: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PERIOD_KEY, JSON.stringify({ year, term }));
  } catch {
    // ignore
  }
}

function yearScore(item: PeriodItem, preferred: string): number {
  const id = item.id.trim();
  const label = item.label.trim();
  if (id === preferred) return 100;
  if (label === preferred) return 95;
  if (label.startsWith(`${preferred}-`) || label.startsWith(`${preferred}/`)) return 90;
  if (label.includes(preferred)) return 80;
  const n = Number(id);
  if (!Number.isNaN(n)) return n;
  const m = label.match(/(\d{4})/);
  if (m) return Number(m[1]);
  return 0;
}

export function pickCurrentYear(items: PeriodItem[], preferred = guessAcademicYearId()): string {
  if (!items.length) return preferred;
  const selected = items.find((i) => i.selected);
  if (selected) return selected.id;

  let best = items[0];
  let bestScore = yearScore(best, preferred);
  for (const item of items.slice(1)) {
    const s = yearScore(item, preferred);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best.id;
}

export function pickCurrentTerm(
  items: PeriodItem[],
  preferred = guessTermId(new Date(), items.length || 2),
): string {
  if (!items.length) return preferred;
  const selected = items.find((i) => i.selected);
  if (selected) return selected.id;
  if (items.some((i) => i.id === preferred)) return preferred;
  const byLabel = items.find((i) => new RegExp(`(^|\\D)${preferred}(\\D|$)`).test(i.label));
  if (byLabel) return byLabel.id;
  return items[0].id;
}

export function useAcademicPeriod(): PeriodState {
  const session = useAuthStore((s) => s.session);
  const [years, setYears] = useState<PeriodItem[]>(() => fallbackYears());
  const [terms, setTerms] = useState<PeriodItem[]>(() => fallbackTerms(2));
  const [year, setYearState] = useState(() => guessAcademicYearId());
  const [term, setTermState] = useState(() => guessTermId());
  const [week, setWeek] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const remembered = readStoredPeriod();
    if (!remembered) return;
    setYearState(remembered.year);
    setTermState(remembered.term);
  }, []);

  const setYear = useCallback((v: string) => {
    setYearState(v);
    setTermState((t) => {
      writeStoredPeriod(v, t);
      return t;
    });
  }, []);

  const setTerm = useCallback((v: string) => {
    setTermState(v);
    setYearState((y) => {
      writeStoredPeriod(y, v);
      return y;
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const baseUrl = session.baseUrl;
    const token = session.token;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const live = useAuthStore.getState().session;
        if (!live || live.baseUrl !== baseUrl || live.token !== token) return;
        const [yearsRes, termsRes] = await Promise.all([
          apiStudyYears(live).catch(() => ({ items: [] as PeriodItem[] })),
          apiTerms(live).catch(() => ({ items: [] as PeriodItem[] })),
        ]);
        if (cancelled) return;

        const yItems = yearsRes.items.length > 0 ? yearsRes.items : fallbackYears();
        const lang = usePrefsStore.getState().lang;
        const tItems =
          termsRes.items.length > 0
            ? termsRes.items
            : fallbackTerms(2, (key, vars) => translate(lang, key, vars));

        const termCount = tItems.length >= 3 ? 3 : 2;
        const preferredYear = guessAcademicYearId();
        const preferredTerm = guessTermId(new Date(), termCount);
        const remembered = readStoredPeriod();

        // Keep user's last year/term if still valid — don't jump away from journal data
        const nextYear =
          remembered && yItems.some((i) => i.id === remembered.year)
            ? remembered.year
            : pickCurrentYear(yItems, preferredYear);
        const nextTerm =
          remembered && tItems.some((i) => i.id === remembered.term)
            ? remembered.term
            : pickCurrentTerm(tItems, preferredTerm);

        setYears(yItems);
        setTerms(tItems);
        setYearState(nextYear);
        setTermState(nextTerm);
        writeStoredPeriod(nextYear, nextTerm);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : translate(usePrefsStore.getState().lang, "period_error"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.baseUrl, session?.token]);

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

export function PeriodFilters({
  period,
}: {
  period: PeriodState;
  showWeek?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
      <Field label={t("period_year_short")}>
        <Select
          value={period.year}
          onChange={period.setYear}
          options={period.years.map((y) => ({ value: y.id, label: y.label }))}
          placeholder={t("period_year")}
        />
      </Field>
      <Field label={t("period_term_short")}>
        <Select
          value={period.term}
          onChange={period.setTerm}
          options={period.terms.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
          placeholder={t("period_term_placeholder")}
        />
      </Field>
    </div>
  );
}
