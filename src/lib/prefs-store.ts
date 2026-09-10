import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "@/lib/lms/types";

export type AppTheme = "dark" | "light";

type PrefsState = {
  theme: AppTheme;
  lang: Lang;
  /** Local notifications when schedule changes. */
  notifySchedule: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setTheme: (theme: AppTheme) => void;
  setLang: (lang: Lang) => void;
  setNotifySchedule: (value: boolean) => void;
};

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "dark",
      lang: "ru",
      notifySchedule: false,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      setNotifySchedule: (notifySchedule) => set({ notifySchedule }),
    }),
    {
      name: "sokratus-prefs",
      partialize: (s) => ({
        theme: s.theme,
        lang: s.lang,
        notifySchedule: s.notifySchedule,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#0c0e11" : "#e8eaef");
  }
}

/** Apply theme immediately with a short cross-fade when the browser supports it. */
export function switchTheme(theme: AppTheme): void {
  if (typeof document === "undefined") {
    usePrefsStore.getState().setTheme(theme);
    return;
  }

  const current = usePrefsStore.getState().theme;
  if (current === theme) {
    applyThemeToDocument(theme);
    return;
  }

  const commit = () => {
    usePrefsStore.getState().setTheme(theme);
    applyThemeToDocument(theme);
  };

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => {
      finished: Promise<void>;
      ready: Promise<void>;
    };
  };

  if (typeof doc.startViewTransition === "function") {
    const root = document.documentElement;
    root.classList.add("theme-animating");
    const transition = doc.startViewTransition(commit);
    void transition.finished.finally(() => {
      root.classList.remove("theme-animating");
    });
    return;
  }

  commit();
}
