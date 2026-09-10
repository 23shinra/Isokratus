"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarBlank,
  ClockCounterClockwise,
  GearSix,
  Notebook,
  QrCode,
  User,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import {
  rememberTab,
  useAuthHydrated,
  useAuthStore,
} from "@/lib/auth-store";
import { apiAvatar } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { findUniversityByUrl } from "@/lib/universities";
import { useEffect, useState } from "react";
import { ScheduleWatcher } from "@/components/schedule-watcher";
import { SessionKeepAlive } from "@/components/session-keepalive";
import { useScheduleHistoryStore } from "@/lib/schedule-history-store";
import {
  cacheAvatarForAccount,
  readCachedAvatarForSession,
} from "@/lib/avatar-cache";
import { findCredentialsForSession } from "@/lib/saved-accounts";
import { useT } from "@/lib/use-i18n";
import type { MessageKey } from "@/lib/i18n";

const NAV = [
  { href: "/schedule", labelKey: "nav_schedule" as MessageKey, icon: CalendarBlank },
  { href: "/history", labelKey: "nav_history" as MessageKey, icon: ClockCounterClockwise },
  { href: "/grades", labelKey: "nav_grades" as MessageKey, icon: Notebook },
  { href: "/qr", labelKey: "nav_qr" as MessageKey, icon: QrCode },
] as const;

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const session = useAuthStore((s) => s.session);
  const unreadSchedule = useScheduleHistoryStore((s) => s.unreadCount);
  const { t } = useT();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) router.replace("/login");
  }, [hydrated, session, router]);

  useEffect(() => {
    if (pathname) rememberTab(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!session) {
      setAvatarUrl(null);
      setAvatarFailed(false);
      return;
    }

    let cancelled = false;
    setAvatarFailed(false);

    // Show cached photo immediately — never flash empty if we already have one
    const cached = readCachedAvatarForSession(session);
    if (cached) {
      setAvatarUrl(cached);
    } else {
      const creds = findCredentialsForSession(session);
      if (creds) {
        const byCreds = readCachedAvatarForSession({
          baseUrl: creds.baseUrl,
          login: creds.login,
        });
        if (byCreds) setAvatarUrl(byCreds);
      }
    }

    const load = () => {
      void (async () => {
        try {
          const url = await apiAvatar(session);
          if (cancelled || !url) return;
          const login =
            session.login || findCredentialsForSession(session)?.login;
          if (login) {
            const stored = await cacheAvatarForAccount(
              session.baseUrl,
              login,
              url,
            );
            if (!cancelled) {
              setAvatarUrl(stored);
              setAvatarFailed(false);
            }
          } else if (!cancelled) {
            setAvatarUrl(url);
            setAvatarFailed(false);
          }
        } catch {
          // Keep whatever cached avatar we already showed
        }
      })();
    };

    const timeoutId = window.setTimeout(load, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [session?.baseUrl, session?.token, session?.login]);

  if (!hydrated || !session) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center">
        <p className="font-mono text-xs text-muted">{t("checking_session")}</p>
      </main>
    );
  }

  const initials = getInitials(session.fio || "С");
  const universityLabel =
    session.universityName ||
    findUniversityByUrl(session.baseUrl)?.name ||
    session.baseUrl.replace(/^https?:\/\//, "");
  const isQr = pathname === "/qr";

  return (
    <>
      <ScheduleWatcher />
      <SessionKeepAlive />
      {!isQr ? (
      <header className="relative z-10 w-full shrink-0 bg-transparent">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] md:gap-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.03] p-1">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-pale-blue sm:h-11 sm:w-11">
                {avatarUrl && !avatarFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => {
                      // Prefer cached copy over wiping to initials
                      const cached = session
                        ? readCachedAvatarForSession(session)
                        : null;
                      if (cached && cached !== avatarUrl) {
                        setAvatarUrl(cached);
                        return;
                      }
                      setAvatarFailed(true);
                    }}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-pale-blue-ink">
                    {initials ? (
                      <span className="font-mono text-[11px] font-medium tracking-tight">
                        {initials}
                      </span>
                    ) : (
                      <User size={18} weight="light" />
                    )}
                  </span>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-medium text-ink">
                {session.fio || t("student")}
              </p>
              <p className="truncate text-[11px] text-muted">{universityLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/settings"
              prefetch
              aria-label={t("settings")}
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={cn(
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.1] transition-[color,transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] sm:h-9 sm:w-9",
                pathname === "/settings"
                  ? "bg-white/[0.1] text-ink"
                  : "bg-white/[0.04] text-muted hover:bg-white/[0.07] hover:text-ink",
              )}
            >
              <GearSix
                size={16}
                weight={pathname === "/settings" ? "regular" : "light"}
              />
            </Link>
          </div>
        </div>
      </header>
      ) : null}

      <div className={cn("flex flex-1 flex-col", isQr && "min-h-[100dvh]")}>
        {children}
      </div>

      {!isQr ? (
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div className="ios-no-blur theme-chrome w-full max-w-lg rounded-full border border-white/[0.1] bg-[var(--chrome)] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)] sm:p-1.5">
          <div className="grid grid-cols-4 gap-0.5 sm:gap-1">
            {NAV.map(({ href, labelKey, icon: Icon }) => {
              const active = pathname === href;
              const showBadge = href === "/history" && unreadSchedule > 0;
              return (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  className={cn(
                    "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full px-0.5 py-2 text-[9px] sm:min-h-0 sm:gap-1 sm:px-1.5 sm:py-2.5 sm:text-[11px]",
                    "transition-[color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    active ? "text-ink" : "text-muted hover:text-ink/80",
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-white/[0.08]"
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    />
                  ) : null}
                  <span className="relative z-10 flex h-7 w-7 items-center justify-center">
                    <Icon size={20} weight={active ? "regular" : "light"} />
                    {showBadge ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pale-red px-1 font-mono text-[9px] font-medium text-pale-red-ink">
                        {unreadSchedule > 9 ? "9+" : unreadSchedule}
                      </span>
                    ) : null}
                  </span>
                  <span className="relative z-10">{t(labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      ) : null}
    </>
  );
}

function getInitials(fio: string): string {
  const parts = fio.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
