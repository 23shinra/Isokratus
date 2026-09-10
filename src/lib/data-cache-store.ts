import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { JournalSubject, ScheduleLesson } from "@/lib/lms/types";

function cacheKey(baseUrl: string, year: string, term: string): string {
  return `${baseUrl.replace(/\/+$/, "")}::${year}::${term}`;
}

function basePrefix(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}::`;
}

type ScheduleEntry = {
  lessons: ScheduleLesson[];
  savedAt: string;
  year?: string;
  term?: string;
};

type JournalEntry = {
  subjects: JournalSubject[];
  savedAt: string;
  year?: string;
  term?: string;
};

type DataCacheState = {
  schedules: Record<string, ScheduleEntry>;
  journals: Record<string, JournalEntry>;
  saveSchedule: (
    baseUrl: string,
    year: string,
    term: string,
    lessons: ScheduleLesson[],
  ) => void;
  getSchedule: (
    baseUrl: string,
    year: string,
    term: string,
  ) => ScheduleEntry | null;
  /** Exact match, else newest non-empty schedule for this uni. */
  findSchedule: (
    baseUrl: string,
    year: string,
    term: string,
  ) => ScheduleEntry | null;
  saveJournal: (
    baseUrl: string,
    year: string,
    term: string,
    subjects: JournalSubject[],
  ) => void;
  getJournal: (
    baseUrl: string,
    year: string,
    term: string,
  ) => JournalEntry | null;
  findJournal: (
    baseUrl: string,
    year: string,
    term: string,
  ) => JournalEntry | null;
};

const MAX_BUCKETS = 16;

function trimMap<T>(map: Record<string, T>): Record<string, T> {
  const entries = Object.entries(map);
  if (entries.length <= MAX_BUCKETS) return map;
  const sorted = entries.sort((a, b) => {
    const aAt = (a[1] as { savedAt?: string }).savedAt || "";
    const bAt = (b[1] as { savedAt?: string }).savedAt || "";
    return bAt.localeCompare(aAt);
  });
  return Object.fromEntries(sorted.slice(0, MAX_BUCKETS));
}

function newestNonEmpty<T extends { savedAt: string }>(
  map: Record<string, T>,
  prefix: string,
  hasData: (entry: T) => boolean,
): T | null {
  let best: T | null = null;
  for (const [key, entry] of Object.entries(map)) {
    if (!key.startsWith(prefix)) continue;
    if (!hasData(entry)) continue;
    if (!best || entry.savedAt > best.savedAt) best = entry;
  }
  return best;
}

export const useDataCacheStore = create<DataCacheState>()(
  persist(
    (set, get) => ({
      schedules: {},
      journals: {},

      saveSchedule: (baseUrl, year, term, lessons) => {
        const key = cacheKey(baseUrl, year, term);
        // Never wipe a good cache with an empty live response
        if (!lessons.length) {
          const prev = get().schedules[key];
          if (prev?.lessons?.length) return;
        }
        set((state) => ({
          schedules: trimMap({
            ...state.schedules,
            [key]: {
              lessons,
              savedAt: new Date().toISOString(),
              year,
              term,
            },
          }),
        }));
      },

      getSchedule: (baseUrl, year, term) => {
        return get().schedules[cacheKey(baseUrl, year, term)] ?? null;
      },

      findSchedule: (baseUrl, year, term) => {
        const exact = get().schedules[cacheKey(baseUrl, year, term)];
        if (exact?.lessons?.length) return exact;
        return newestNonEmpty(
          get().schedules,
          basePrefix(baseUrl),
          (e) => Boolean(e.lessons?.length),
        );
      },

      saveJournal: (baseUrl, year, term, subjects) => {
        const key = cacheKey(baseUrl, year, term);
        if (!subjects.length) {
          const prev = get().journals[key];
          if (prev?.subjects?.length) return;
        }
        set((state) => ({
          journals: trimMap({
            ...state.journals,
            [key]: {
              subjects,
              savedAt: new Date().toISOString(),
              year,
              term,
            },
          }),
        }));
      },

      getJournal: (baseUrl, year, term) => {
        return get().journals[cacheKey(baseUrl, year, term)] ?? null;
      },

      findJournal: (baseUrl, year, term) => {
        const exact = get().journals[cacheKey(baseUrl, year, term)];
        if (exact?.subjects?.length) return exact;
        return newestNonEmpty(
          get().journals,
          basePrefix(baseUrl),
          (e) => Boolean(e.subjects?.length),
        );
      },
    }),
    {
      name: "sokratus-data-cache",
      partialize: (state) => ({
        schedules: state.schedules,
        journals: state.journals,
      }),
    },
  ),
);

export function formatCacheAge(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Human relative age for offline banners. */
export function formatCacheAgeRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн. назад`;
  return formatCacheAge(iso);
}

/** Wait for localStorage rehydrate of schedule/journal cache. */
export function useDataCacheHydrated(): boolean {
  const [ready, setReady] = useState(() =>
    typeof window === "undefined"
      ? false
      : useDataCacheStore.persist.hasHydrated(),
  );

  useEffect(() => {
    setReady(useDataCacheStore.persist.hasHydrated());
    const unsub = useDataCacheStore.persist.onFinishHydration(() => {
      setReady(true);
    });
    return unsub;
  }, []);

  return ready;
}
