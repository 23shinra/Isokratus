import { create } from "zustand";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaInstallState = {
  deferred: BeforeInstallPromptEvent | null;
  standalone: boolean;
  setDeferred: (event: BeforeInstallPromptEvent | null) => void;
  setStandalone: (value: boolean) => void;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  deferred: null,
  standalone: false,
  setDeferred: (deferred) => set({ deferred }),
  setStandalone: (standalone) => set({ standalone }),
  promptInstall: async () => {
    const { deferred } = get();
    if (!deferred) return "unavailable";
    await deferred.prompt();
    const choice = await deferred.userChoice;
    set({ deferred: null });
    return choice.outcome;
  },
}));
