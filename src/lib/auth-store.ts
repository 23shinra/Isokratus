import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang, Session } from "@/lib/platonus/types";

type AuthState = {
  session: Session | null;
  setSession: (session: Session) => void;
  clearSession: () => void;
  setLang: (lang: Lang) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
      setLang: (lang) => {
        const current = get().session;
        if (!current) return;
        set({ session: { ...current, lang } });
      },
    }),
    { name: "platonus-lite-auth" },
  ),
);
