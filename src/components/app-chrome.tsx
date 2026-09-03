"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarBlank,
  Notebook,
  QrCode,
  SignOut,
  User,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { useAuthStore } from "@/lib/auth-store";
import { apiAvatar } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { findUniversityByUrl } from "@/lib/universities";
import { useEffect, useState } from "react";
import { EASE_OUT_EXPO, EASE_SPRING_SOFT } from "@/components/motion";

const NAV = [
  { href: "/schedule", label: "Расписание", icon: CalendarBlank },
  { href: "/grades", label: "Журнал", icon: Notebook },
  { href: "/qr", label: "QR", icon: QrCode },
] as const;

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const clearSession = useAuthStore((s) => s.clearSession);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!session) router.replace("/login");
  }, [session, router]);

  useEffect(() => {
    if (!session) {
      setAvatarUrl(null);
      return;
    }

    let cancelled = false;
    setAvatarFailed(false);

    (async () => {
      try {
        const url = await apiAvatar(session);
        if (!cancelled) setAvatarUrl(url);
      } catch {
        if (!cancelled) setAvatarUrl(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center">
        <p className="font-mono text-xs text-muted">Проверка сессии…</p>
      </main>
    );
  }

  const initials = getInitials(session.fio || "С");
  const universityLabel =
    session.universityName ||
    findUniversityByUrl(session.baseUrl)?.name ||
    session.baseUrl.replace(/^https?:\/\//, "");

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -12, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
        className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 pt-5 md:px-6"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.03] p-1">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-pale-blue">
              {avatarUrl && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
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
              {session.fio || "Студент"}
            </p>
            <p className="truncate text-[11px] text-muted">{universityLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearSession();
            router.replace("/login");
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 text-xs text-muted transition-[color,transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.07] hover:text-ink active:scale-[0.98]"
        >
          <SignOut size={14} weight="light" />
          Выйти
        </button>
      </motion.div>

      <div className="flex flex-1 flex-col">{children}</div>

      {/* Floating glass island nav */}
      <motion.nav
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: EASE_SPRING_SOFT, delay: 0.12 }}
        className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(0.85rem,env(safe-area-inset-bottom))]"
      >
        <div className="w-full max-w-md rounded-full border border-white/[0.1] bg-[#0e1014]/75 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <div className="grid grid-cols-3 gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-full px-2 py-2.5 text-[11px]",
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
                  </span>
                  <span className="relative z-10">{label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </motion.nav>
    </>
  );
}

function getInitials(fio: string): string {
  const parts = fio.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
