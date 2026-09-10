"use client";

import { useEffect } from "react";
import { applyThemeToDocument, usePrefsStore } from "@/lib/prefs-store";
import { useAuthStore } from "@/lib/auth-store";

/** Keep <html lang> + data-theme in sync with stores. */
export function PrefsSync() {
  const theme = usePrefsStore((s) => s.theme);
  const prefsLang = usePrefsStore((s) => s.lang);
  const prefsHydrated = usePrefsStore((s) => s.hasHydrated);
  const sessionLang = useAuthStore((s) => s.session?.lang);

  useEffect(() => {
    const unsub = usePrefsStore.persist.onFinishHydration(() => {
      usePrefsStore.getState().setHasHydrated(true);
      applyThemeToDocument(usePrefsStore.getState().theme);
      // Prefer existing session lang once (upgrade path)
      const session = useAuthStore.getState().session;
      if (session?.lang) {
        usePrefsStore.getState().setLang(session.lang);
      }
    });
    if (usePrefsStore.persist.hasHydrated()) {
      usePrefsStore.getState().setHasHydrated(true);
      applyThemeToDocument(usePrefsStore.getState().theme);
      const session = useAuthStore.getState().session;
      if (session?.lang) {
        usePrefsStore.getState().setLang(session.lang);
      }
    }
    return unsub;
  }, []);

  useEffect(() => {
    if (!prefsHydrated) return;
    applyThemeToDocument(theme);
  }, [theme, prefsHydrated]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const lang = sessionLang ?? prefsLang;
    document.documentElement.lang = lang === "kz" ? "kk" : lang;
  }, [sessionLang, prefsLang]);

  return null;
}
