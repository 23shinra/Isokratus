import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useState } from "react";
import type { Lang, Session } from "@/lib/lms/types";

type AuthState = {
  session: Session | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setSession: (session: Session) => void;
  clearSession: () => void;
  setLang: (lang: Lang) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      hasHydrated: false,
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
      setLang: (lang) => {
        const current = get().session;
        if (!current) return;
        set({ session: { ...current, lang } });
      },
    }),
    {
      name: "sokratus-auth",
      partialize: (state) => ({ session: state.session }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Wait for localStorage rehydrate before auth redirects (fixes refresh → /login → /schedule). */
export function useAuthHydrated(): boolean {
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const [ready, setReady] = useState(hasHydrated);

  useEffect(() => {
    setReady(useAuthStore.persist.hasHydrated());
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      useAuthStore.getState().setHasHydrated(true);
      setReady(true);
    });
    if (useAuthStore.persist.hasHydrated()) {
      useAuthStore.getState().setHasHydrated(true);
      setReady(true);
    }
    return unsub;
  }, []);

  return ready || hasHydrated;
}

export const LAST_TAB_KEY = "sokratus-last-tab";

export function rememberTab(path: string): void {
  if (typeof window === "undefined") return;
  if (
    path === "/schedule" ||
    path === "/history" ||
    path === "/grades" ||
    path === "/qr"
  ) {
    try {
      localStorage.setItem(LAST_TAB_KEY, path);
    } catch {
      // ignore
    }
  }
}

export function readLastTab(): string {
  if (typeof window === "undefined") return "/schedule";
  try {
    const v = localStorage.getItem(LAST_TAB_KEY);
    if (
      v === "/schedule" ||
      v === "/history" ||
      v === "/grades" ||
      v === "/qr"
    ) {
      return v;
    }
  } catch {
    // ignore
  }
  return "/schedule";
}
