"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretRight, SignOut } from "@phosphor-icons/react";
import { EASE_OUT_EXPO, EASE_SPRING_SOFT } from "@/components/motion";
import { SettingsPanel } from "@/components/settings-panel";
import { UniRequestsAdminPanel } from "@/components/uni-requests-admin-panel";
import { UsageAdminPanel } from "@/components/usage-admin-panel";
import { Button, PageHeader, Panel, Shell } from "@/components/ui";
import { useAuthStore } from "@/lib/auth-store";
import { useT } from "@/lib/use-i18n";

export default function SettingsPage() {
  const router = useRouter();
  const { t } = useT();
  const clearSession = useAuthStore((s) => s.clearSession);
  const fio = useAuthStore((s) => s.session?.fio);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  function confirmLogout() {
    clearSession();
    setConfirmOpen(false);
    router.replace("/login");
  }

  return (
    <Shell>
      <PageHeader title={t("settings")} subtitle={t("settings_sub")} />
      <Panel>
        <SettingsPanel />
        <UniRequestsAdminPanel />
        <UsageAdminPanel />
      </Panel>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="mt-4 flex w-full items-center gap-3 rounded-[1.35rem] border border-pale-red-ink/25 bg-pale-red/15 px-4 py-3.5 text-left transition-[transform,background-color] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-pale-red-ink/20 bg-pale-red/35 text-pale-red-ink">
          <SignOut size={16} weight="regular" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-pale-red-ink">
            {t("logout")}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-pale-red-ink/70">
            {fio ? t("logout_account", { name: fio }) : t("logout_hint")}
          </span>
        </span>
        <CaretRight
          size={14}
          weight="bold"
          className="shrink-0 text-pale-red-ink/55"
        />
      </button>

      <LogoutConfirm
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
    </Shell>
  );
}

function LogoutConfirm({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const reduced = useReducedMotion();
  const { t } = useT();

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="logout-confirm"
          className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 sm:items-center sm:pb-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-confirm-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.28, ease: EASE_OUT_EXPO }}
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/65"
            onClick={onCancel}
          />
          <motion.div
            initial={
              reduced ? { opacity: 1 } : { opacity: 0, y: 28, scale: 0.96 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }
            }
            transition={{
              duration: reduced ? 0 : 0.42,
              ease: EASE_SPRING_SOFT,
            }}
            className="relative w-full max-w-[22rem] rounded-[1.5rem] border border-pale-red-ink/25 bg-pale-red/15 p-1"
          >
            <div className="rounded-[calc(1.5rem-0.25rem)] border border-pale-red-ink/15 bg-[var(--dialog)] px-5 pb-5 pt-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-pale-red-ink/25 bg-pale-red/30 text-pale-red-ink">
                <SignOut size={28} weight="fill" />
              </span>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-pale-red-ink/75">
                {t("logout_confirm_eyebrow")}
              </p>
              <h2
                id="logout-confirm-title"
                className="mt-2 font-display text-2xl font-medium tracking-tight text-ink"
              >
                {t("logout_confirm_title")}
              </h2>
              <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-ink/85">
                {t("logout_confirm_body")}
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full sm:w-auto"
                  onClick={onCancel}
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  className="w-full border-0 bg-pale-red text-pale-red-ink hover:bg-pale-red/80 sm:w-auto"
                  onClick={onConfirm}
                >
                  {t("logout")}
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
