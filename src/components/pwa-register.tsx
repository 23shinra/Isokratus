"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DownloadSimple, X } from "@phosphor-icons/react";
import { BUILD_ID } from "@/lib/build-id";
import { cn } from "@/lib/cn";
import { EASE_OUT_EXPO } from "@/components/motion";
import {
  usePwaInstallStore,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-install-store";
import { useT } from "@/lib/use-i18n";

const DISMISS_KEY = "sokratus-pwa-install-dismissed";
const RELOAD_KEY = "sokratus-sw-reloaded";
const AUTO_HIDE_MS = 3_000;

export function PwaRegister() {
  const { t } = useT();
  const [visible, setVisible] = useState(false);
  const deferred = usePwaInstallStore((s) => s.deferred);
  const standalone = usePwaInstallStore((s) => s.standalone);
  const setDeferred = usePwaInstallStore((s) => s.setDeferred);
  const setStandalone = usePwaInstallStore((s) => s.setStandalone);
  const promptInstall = usePwaInstallStore((s) => s.promptInstall);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setStandalone(isStandalone);

    if ("serviceWorker" in navigator) {
      const swUrl = `/sw.js?v=${encodeURIComponent(BUILD_ID)}`;

      navigator.serviceWorker
        .register(swUrl, { scope: "/" })
        .then((reg) => {
          void reg.update();

          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                worker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {
          // ignore
        });

      const onControllerChange = () => {
        try {
          if (sessionStorage.getItem(RELOAD_KEY) === BUILD_ID) return;
          sessionStorage.setItem(RELOAD_KEY, BUILD_ID);
        } catch {
          // ignore
        }
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      const onMessage = (event: MessageEvent) => {
        if (event.data?.type !== "SOKRATUS_SW_ACTIVATED") return;
        try {
          if (sessionStorage.getItem(RELOAD_KEY) === BUILD_ID) return;
          sessionStorage.setItem(RELOAD_KEY, BUILD_ID);
        } catch {
          // ignore
        }
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("message", onMessage);

      return () => {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          onControllerChange,
        );
        navigator.serviceWorker.removeEventListener("message", onMessage);
      };
    }

    return undefined;
  }, [setStandalone]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (standalone) return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [standalone, setDeferred]);

  useEffect(() => {
    if (!visible || !deferred) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        // ignore
      }
      setVisible(false);
    }, AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [visible, deferred]);

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (standalone) return null;

  return (
    <AnimatePresence>
      {visible && deferred ? (
        <motion.div
          key="pwa-install"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
          transition={{
            duration: reduced ? 0.2 : 0.42,
            ease: EASE_OUT_EXPO,
          }}
          className={cn(
            "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3",
            "top-[calc(0.75rem+env(safe-area-inset-top))]",
          )}
        >
          <div className="pointer-events-auto ios-no-blur theme-chrome flex w-full max-w-md items-center gap-3 rounded-full border border-white/[0.12] bg-[var(--chrome)] p-2 pl-4 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">
                {t("pwa_title")}
              </p>
              <p className="truncate text-[11px] text-muted">{t("pwa_body")}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-[var(--cta)] px-3.5 text-xs font-medium text-[var(--cta-ink)] transition-[transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              onClick={async () => {
                await promptInstall();
                setVisible(false);
                try {
                  sessionStorage.setItem(DISMISS_KEY, "1");
                } catch {
                  // ignore
                }
              }}
            >
              <DownloadSimple size={14} weight="bold" />
              {t("pwa_install")}
            </button>
            <button
              type="button"
              aria-label={t("close")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
              onClick={dismiss}
            >
              <X size={16} weight="bold" />
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
