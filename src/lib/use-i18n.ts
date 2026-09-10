"use client";

import { useCallback } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useDataCacheStore } from "@/lib/data-cache-store";
import {
  historyWord,
  t,
  type MessageKey,
} from "@/lib/i18n";
import { usePrefsStore } from "@/lib/prefs-store";
import type { Lang } from "@/lib/lms/types";

export function useLang(): Lang {
  const prefsLang = usePrefsStore((s) => s.lang);
  const sessionLang = useAuthStore((s) => s.session?.lang);
  return sessionLang ?? prefsLang ?? "ru";
}

export function useT() {
  const lang = useLang();
  const translate = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      t(lang, key, vars),
    [lang],
  );
  return { lang, t: translate, historyWord: (n: number) => historyWord(lang, n) };
}

/** Switch UI + LMS language; drop cached LMS payloads so next load uses new lang. */
export function switchLang(lang: Lang): void {
  usePrefsStore.getState().setLang(lang);
  useAuthStore.getState().setLang(lang);
  useDataCacheStore.setState({ journals: {}, schedules: {} });
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "kz" ? "kk" : lang;
  }
}
