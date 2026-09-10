import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScheduleLesson } from "@/lib/lms/types";
import {
  diffLessons,
  fingerprintLessons,
  hasDiff,
  snapsFromLessons,
  type LessonSnap,
  type ScheduleChange,
} from "@/lib/schedule-history";

const MAX_CHANGES = 40;

type SnapshotBucket = {
  year: string;
  term: string;
  fingerprint: string;
  snaps: LessonSnap[];
  updatedAt: string;
};

type ScheduleHistoryState = {
  /** key = `${baseUrl}::${year}::${term}` */
  snapshots: Record<string, SnapshotBucket>;
  changes: ScheduleChange[];
  lastCheckedAt: string | null;
  unreadCount: number;
  ingest: (
    baseUrl: string,
    year: string,
    term: string,
    lessons: ScheduleLesson[],
  ) => ScheduleChange | null;
  setLastCheckedAt: (iso: string) => void;
  markAllRead: () => void;
  clearHistory: () => void;
};

function bucketKey(baseUrl: string, year: string, term: string): string {
  return `${baseUrl.replace(/\/+$/, "")}::${year}::${term}`;
}

/** Keep only add/remove events; drop “changed” noise from language/room renames. */
function pruneNoise(changes: ScheduleChange[]): ScheduleChange[] {
  return changes
    .map((c) => ({
      ...c,
      changed: [],
      added: c.added || [],
      removed: c.removed || [],
    }))
    .filter((c) => (c.added?.length || 0) > 0 || (c.removed?.length || 0) > 0);
}

export const useScheduleHistoryStore = create<ScheduleHistoryState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      changes: [],
      lastCheckedAt: null,
      unreadCount: 0,

      setLastCheckedAt: (iso) => set({ lastCheckedAt: iso }),

      markAllRead: () =>
        set((state) => ({
          changes: state.changes.map((c) => ({ ...c, unread: false })),
          unreadCount: 0,
        })),

      clearHistory: () =>
        set({
          changes: [],
          unreadCount: 0,
        }),

      ingest: (baseUrl, year, term, lessons) => {
        const key = bucketKey(baseUrl, year, term);
        const nextSnaps = snapsFromLessons(lessons);
        const nextFp = fingerprintLessons(lessons);
        const prev = get().snapshots[key];
        const now = new Date().toISOString();

        const cleaned = pruneNoise(get().changes);
        if (cleaned.length !== get().changes.length) {
          set({
            changes: cleaned,
            unreadCount: cleaned.filter((c) => c.unread).length,
          });
        }

        if (!prev) {
          set((state) => ({
            snapshots: {
              ...state.snapshots,
              [key]: {
                year,
                term,
                fingerprint: nextFp,
                snaps: nextSnaps,
                updatedAt: now,
              },
            },
            lastCheckedAt: now,
          }));
          return null;
        }

        if (prev.fingerprint === nextFp) {
          set((state) => ({
            snapshots: {
              ...state.snapshots,
              [key]: { ...prev, snaps: nextSnaps, updatedAt: now },
            },
            lastCheckedAt: now,
          }));
          return null;
        }

        const diff = diffLessons(prev.snaps, nextSnaps);
        if (!hasDiff(diff)) {
          // Same slots — language/room labels only. Quiet refresh.
          set((state) => ({
            snapshots: {
              ...state.snapshots,
              [key]: {
                year,
                term,
                fingerprint: nextFp,
                snaps: nextSnaps,
                updatedAt: now,
              },
            },
            lastCheckedAt: now,
          }));
          return null;
        }

        const change: ScheduleChange = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          at: now,
          year,
          term,
          added: diff.added,
          removed: diff.removed,
          changed: [],
          unread: true,
        };

        set((state) => {
          const changes = [change, ...pruneNoise(state.changes)].slice(
            0,
            MAX_CHANGES,
          );
          return {
            snapshots: {
              ...state.snapshots,
              [key]: {
                year,
                term,
                fingerprint: nextFp,
                snaps: nextSnaps,
                updatedAt: now,
              },
            },
            changes,
            lastCheckedAt: now,
            unreadCount: changes.filter((c) => c.unread).length,
          };
        });

        return change;
      },
    }),
    {
      name: "sokratus-schedule-history",
      partialize: (state) => ({
        snapshots: state.snapshots,
        changes: state.changes,
        lastCheckedAt: state.lastCheckedAt,
        unreadCount: state.unreadCount,
      }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<ScheduleHistoryState>;
        const changes = pruneNoise(p.changes || []);
        return {
          ...current,
          ...p,
          changes,
          unreadCount: changes.filter((c) => c.unread).length,
        };
      },
    },
  ),
);
