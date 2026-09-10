"use client";

import { useEffect, useRef } from "react";
import { apiSchedule } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import {
  guessAcademicYearId,
  guessTermId,
} from "@/components/period-filters";
import { useDataCacheStore } from "@/lib/data-cache-store";
import { notifyScheduleChange } from "@/lib/notify";
import { usePrefsStore } from "@/lib/prefs-store";
import { useScheduleHistoryStore } from "@/lib/schedule-history-store";

const HOUR_MS = 60 * 60 * 1000;
const FAST_MS = 15 * 60 * 1000;

/**
 * Polls current-period schedule and writes diffs into schedule history.
 * With notifications on — every 15 min; otherwise hourly.
 */
export function ScheduleWatcher() {
  const baseUrl = useAuthStore((s) => s.session?.baseUrl);
  const token = useAuthStore((s) => s.session?.token);
  const notifySchedule = usePrefsStore((s) => s.notifySchedule);
  const running = useRef(false);

  useEffect(() => {
    if (!baseUrl || !token) return;

    const intervalMs = notifySchedule ? FAST_MS : HOUR_MS;

    async function check(force: boolean) {
      const session = useAuthStore.getState().session;
      if (!session || running.current) return;

      const { lastCheckedAt, ingest, setLastCheckedAt } =
        useScheduleHistoryStore.getState();
      const last = lastCheckedAt ? Date.parse(lastCheckedAt) : 0;
      if (!force && last && Date.now() - last < intervalMs - 30_000) return;

      running.current = true;
      try {
        const year = guessAcademicYearId();
        const term = guessTermId();
        const res = await apiSchedule(session, {
          year,
          term,
          week: "auto",
        });
        const lessons = res.lessons ?? [];
        useDataCacheStore
          .getState()
          .saveSchedule(session.baseUrl, year, term, lessons);
        const change = ingest(session.baseUrl, year, term, lessons);
        setLastCheckedAt(new Date().toISOString());

        if (
          change &&
          usePrefsStore.getState().notifySchedule &&
          Notification.permission === "granted"
        ) {
          void notifyScheduleChange(change);
        }
      } catch {
        useScheduleHistoryStore
          .getState()
          .setLastCheckedAt(new Date().toISOString());
      } finally {
        running.current = false;
      }
    }

    void check(true);
    const id = window.setInterval(() => {
      void check(true);
    }, intervalMs);

    const onVis = () => {
      if (document.visibilityState === "visible") void check(false);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [baseUrl, token, notifySchedule]);

  return null;
}
