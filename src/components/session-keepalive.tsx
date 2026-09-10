"use client";

import { useEffect, useRef } from "react";
import { silentRefreshSession } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { findCredentialsForSession } from "@/lib/saved-accounts";

/** Refresh session token before it dies (and when tab becomes visible). */
const INTERVAL_MS = 25 * 60 * 1000;
const VISIBLE_MIN_AGE_MS = 12 * 60 * 1000;

export function SessionKeepAlive() {
  const session = useAuthStore((s) => s.session);
  const lastRun = useRef(0);

  useEffect(() => {
    if (!session) return;

    async function tick(force: boolean) {
      const live = useAuthStore.getState().session;
      if (!live) return;
      if (!findCredentialsForSession(live)) return;

      const age = Date.now() - lastRun.current;
      if (!force && age < VISIBLE_MIN_AGE_MS) return;

      const next = await silentRefreshSession(force);
      if (next) lastRun.current = Date.now();
    }

    // Warm shortly after open (lets cookies settle), then on a timer
    const boot = window.setTimeout(() => {
      void tick(true);
    }, 8_000);

    const id = window.setInterval(() => {
      void tick(true);
    }, INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") void tick(false);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearTimeout(boot);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [session?.baseUrl, session?.token, session?.login]);

  return null;
}
