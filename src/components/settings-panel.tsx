"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Bell,
  BellSlash,
  DeviceMobileSpeaker,
  DownloadSimple,
  Moon,
  Sun,
} from "@phosphor-icons/react";
import { ensureNotificationPermission } from "@/lib/notify";
import { switchTheme, usePrefsStore, type AppTheme } from "@/lib/prefs-store";
import { usePwaInstallStore } from "@/lib/pwa-install-store";
import { switchLang, useT } from "@/lib/use-i18n";
import type { Lang } from "@/lib/lms/types";
import { cn } from "@/lib/cn";

const LANGS: Array<{ id: Lang; labelKey: "lang_ru" | "lang_kk" | "lang_en"; hint: string }> = [
  { id: "ru", labelKey: "lang_ru", hint: "RU" },
  { id: "kz", labelKey: "lang_kk", hint: "KK" },
  { id: "en", labelKey: "lang_en", hint: "EN" },
];

const THEMES: Array<{ id: AppTheme; labelKey: "theme_dark" | "theme_light"; icon: typeof Moon }> = [
  { id: "dark", labelKey: "theme_dark", icon: Moon },
  { id: "light", labelKey: "theme_light", icon: Sun },
];

export function SettingsPanel() {
  const reduced = useReducedMotion();
  const { lang, t } = useT();
  const theme = usePrefsStore((s) => s.theme);
  const notifySchedule = usePrefsStore((s) => s.notifySchedule);
  const setNotifySchedule = usePrefsStore((s) => s.setNotifySchedule);
  const standalone = usePwaInstallStore((s) => s.standalone);
  const canInstall = usePwaInstallStore((s) => Boolean(s.deferred));
  const promptInstall = usePwaInstallStore((s) => s.promptInstall);
  const [perm, setPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPerm(Notification.permission);
    }
  }, []);

  async function onInstall() {
    await promptInstall();
  }

  const langLabels = {
    lang_ru: "Русский",
    lang_kk: "Қазақша",
    lang_en: "English",
  } as const;

  return (
    <div className="space-y-6">
      <section>
        <p className="mb-2.5 text-[11px] font-medium text-muted">{t("language")}</p>
        <div className="relative grid grid-cols-3 gap-1.5 rounded-[14px] border border-white/[0.08] bg-black/25 p-1.5">
          {LANGS.map((item) => {
            const active = lang === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchLang(item.id)}
                className={cn(
                  "relative z-[1] rounded-[10px] px-2 py-2.5 text-center",
                  "transition-[color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  active
                    ? "text-ink"
                    : "text-muted hover:text-ink active:scale-[0.98]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="lang-pill"
                    className="absolute inset-0 rounded-[10px] bg-white/[0.1]"
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: 480,
                            damping: 36,
                            mass: 0.7,
                          }
                    }
                  />
                ) : null}
                <span className="relative z-[1] block text-sm font-medium">
                  {item.hint}
                </span>
                <span className="relative z-[1] mt-0.5 block truncate text-[10px] opacity-70">
                  {langLabels[item.labelKey]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-2.5 text-[11px] font-medium text-muted">{t("theme")}</p>
        <div className="relative grid grid-cols-2 gap-1.5 rounded-[14px] border border-white/[0.08] bg-black/25 p-1.5">
          {THEMES.map(({ id, labelKey, icon: Icon }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchTheme(id)}
                className={cn(
                  "relative z-[1] inline-flex items-center justify-center gap-2 rounded-[10px] px-3 py-2.5 text-sm",
                  "transition-[color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  active
                    ? "text-ink"
                    : "text-muted hover:text-ink active:scale-[0.98]",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="theme-pill"
                    className="absolute inset-0 rounded-[10px] bg-white/[0.1]"
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            type: "spring",
                            stiffness: 480,
                            damping: 36,
                            mass: 0.7,
                          }
                    }
                  />
                ) : null}
                <Icon
                  size={16}
                  weight={active ? "regular" : "light"}
                  className="relative z-[1]"
                />
                <span className="relative z-[1]">{t(labelKey)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-2.5 text-[11px] font-medium text-muted">
          {t("notifications")}
        </p>
        <button
          type="button"
          disabled={typeof Notification === "undefined" || perm === "denied"}
          onClick={async () => {
            if (notifySchedule) {
              setNotifySchedule(false);
              return;
            }
            const next = await ensureNotificationPermission();
            setPerm(next);
            if (next === "granted") {
              setNotifySchedule(true);
            }
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-[14px] border border-white/[0.08] bg-black/25 px-3.5 py-3 text-left transition-[transform,opacity] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]",
            perm === "denied" ? "opacity-60" : "active:scale-[0.99]",
          )}
        >
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              notifySchedule && perm === "granted"
                ? "bg-pale-green/40 text-pale-green-ink"
                : "bg-white/[0.06] text-muted",
            )}
          >
            {notifySchedule && perm === "granted" ? (
              <Bell size={16} weight="regular" />
            ) : (
              <BellSlash size={16} weight="light" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink">
              {perm === "denied"
                ? t("notifications_denied")
                : notifySchedule
                  ? t("notifications_on")
                  : t("notifications_off")}
            </span>
            <span className="mt-0.5 block text-[11px] text-muted">
              {perm === "denied"
                ? t("notifications_denied_hint")
                : t("notifications_hint")}
            </span>
          </span>
          <span
            className={cn(
              "h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors duration-400",
              notifySchedule && perm === "granted"
                ? "bg-pale-green-ink/80"
                : "bg-white/[0.12]",
            )}
          >
            <span
              className={cn(
                "block h-5 w-5 rounded-full bg-white transition-transform duration-400",
                notifySchedule && perm === "granted"
                  ? "translate-x-4"
                  : "translate-x-0",
              )}
            />
          </span>
        </button>
      </section>

      <section>
        <p className="mb-2.5 text-[11px] font-medium text-muted">
          {t("install_section")}
        </p>
        {standalone ? (
          <div className="flex items-start gap-3 rounded-[14px] border border-white/[0.08] bg-black/25 px-3.5 py-3">
            <DeviceMobileSpeaker
              size={18}
              weight="light"
              className="mt-0.5 shrink-0 text-pale-green-ink"
            />
            <div>
              <p className="text-sm text-ink">{t("install_done")}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {t("install_done_hint")}
              </p>
            </div>
          </div>
        ) : canInstall ? (
          <button
            type="button"
            onClick={() => void onInstall()}
            className="flex w-full items-center gap-3 rounded-[14px] border border-white/[0.1] bg-[var(--cta)] px-3.5 py-3 text-left text-[var(--cta-ink)] transition-[transform] duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--cta-ink)]/10">
              <DownloadSimple size={16} weight="bold" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("install_cta")}</span>
              <span className="mt-0.5 block text-[11px] opacity-70">
                {t("install_cta_hint")}
              </span>
            </span>
          </button>
        ) : (
          <div className="rounded-[14px] border border-white/[0.08] bg-black/25 px-3.5 py-3">
            <p className="text-sm text-ink">{t("install_manual")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              {t("install_manual_hint")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
