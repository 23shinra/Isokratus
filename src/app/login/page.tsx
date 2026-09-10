"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Trash, User } from "@phosphor-icons/react";
import { apiAvatar, apiLogin } from "@/lib/api-client";
import { readLastTab, useAuthHydrated, useAuthStore } from "@/lib/auth-store";
import { UniversityPicker } from "@/components/university-picker";
import { Button, Field, Input, Panel } from "@/components/ui";
import { useEntranceProps } from "@/components/motion";
import {
  findUniversityByUrl,
  type University,
} from "@/lib/universities";
import {
  accountInitials,
  formatDisplayName,
  makeAccountId,
  readSavedAccounts,
  rememberAccount,
  removeSavedAccount,
  type SavedAccount,
} from "@/lib/saved-accounts";
import {
  cacheAvatarForAccount,
  clearCachedAvatar,
  readCachedAvatar,
} from "@/lib/avatar-cache";
import { cn } from "@/lib/cn";
import type { Session } from "@/lib/lms/types";
import { usePrefsStore } from "@/lib/prefs-store";
import { useT } from "@/lib/use-i18n";

const DEFAULT_URL = process.env.NEXT_PUBLIC_LMS_URL || "";

export default function LoginPage() {
  const router = useRouter();
  const hydrated = useAuthHydrated();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const { lang, t } = useT();
  const brandMotion = useEntranceProps(0);
  const formMotion = useEntranceProps(0.08);

  const [university, setUniversity] = useState<University | null>(() =>
    DEFAULT_URL ? findUniversityByUrl(DEFAULT_URL) ?? null : null,
  );
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedAccount[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  useEffect(() => {
    const list = readSavedAccounts();
    setSaved(list);
    const map: Record<string, string> = {};
    for (const a of list) {
      const url = readCachedAvatar(a.id);
      if (url) map[a.id] = url;
    }
    setAvatars(map);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (session) router.replace(readLastTab());
  }, [hydrated, session, router]);

  async function persistAvatar(sessionLike: Session, loginName: string) {
    try {
      const url = await apiAvatar(sessionLike);
      if (!url) return;
      const cached = await cacheAvatarForAccount(
        sessionLike.baseUrl,
        loginName,
        url,
      );
      const id = makeAccountId(sessionLike.baseUrl, loginName);
      setAvatars((prev) => ({ ...prev, [id]: cached }));
    } catch {
      // keep initials
    }
  }

  async function signIn(opts: {
    university: University;
    login: string;
    password: string;
    quickId?: string;
  }) {
    setError(null);
    setLoading(true);
    setQuickId(opts.quickId ?? null);
    try {
      const result = await apiLogin({
        baseUrl: opts.university.url,
        login: opts.login,
        password: opts.password,
        lang,
      });

      if (!result.auth_token) {
        throw new Error(result.message || t("login_error"));
      }

      const nextSession: Session = {
        baseUrl: result.baseUrl,
        token: result.auth_token,
        login: opts.login,
        sid: result.sid ? String(result.sid) : undefined,
        uid: result.uid ? String(result.uid) : undefined,
        clientId: result.clientId ? String(result.clientId) : undefined,
        cookies: result.cookies,
        personId: result.personID,
        personType: result.personType,
        fio: result.fio,
        universityName: opts.university.name,
        groupId: result.groupId,
        groupName: result.groupName,
        lang: usePrefsStore.getState().lang,
        adminProof: result.adminProof,
      };

      setSession(nextSession);

      setSaved(
        rememberAccount({
          baseUrl: result.baseUrl,
          universityName: opts.university.name,
          login: opts.login,
          password: opts.password,
          fio: result.fio,
        }),
      );

      // Cache photo before leaving login (doesn't block navigation long)
      void persistAvatar(nextSession, opts.login);

      router.replace("/schedule");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login_error"));
    } finally {
      setLoading(false);
      setQuickId(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!university) {
      setError(t("login_pick_uni"));
      return;
    }
    await signIn({ university, login, password });
  }

  async function onQuickLogin(account: SavedAccount) {
    if (loading) return;
    const uni =
      findUniversityByUrl(account.baseUrl) ??
      ({
        id: account.baseUrl,
        name: account.universityName,
        url: account.baseUrl,
        city: "",
        aliases: [],
      } satisfies University);

    setUniversity(uni);
    setLogin(account.login);
    setPassword(account.password);
    await signIn({
      university: uni,
      login: account.login,
      password: account.password,
      quickId: account.id,
    });
  }

  function onRemoveAccount(id: string) {
    clearCachedAvatar(id);
    setAvatars((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSaved(removeSavedAccount(id));
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md">
        <motion.div {...brandMotion} className="mb-6 sm:mb-8">
          <div className="mb-5 flex items-center gap-3 sm:mb-6 sm:gap-3.5">
            <div className="rounded-[1.15rem] border border-white/[0.08] bg-white/[0.03] p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="Sokratus"
                width={56}
                height={56}
                className="h-12 w-12 rounded-[0.85rem] sm:h-14 sm:w-14"
              />
            </div>
            <div className="min-w-0">
              <p className="font-display text-base font-medium tracking-tight text-ink sm:text-lg">
                Sokratus
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {t("login_tagline")}
              </p>
            </div>
          </div>
          <h1 className="font-display text-[2rem] font-semibold leading-none text-ink sm:text-4xl md:text-5xl">
            {t("login_title")}
          </h1>
        </motion.div>

        <motion.div {...formMotion} className="flex flex-col gap-4">
          {saved.length > 0 ? (
            <Panel flush>
              <div className="px-4 pb-3 pt-4 sm:px-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  {t("login_quick")}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {t("login_quick_hint")}
                </p>
              </div>
              <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
                {saved.map((account) => {
                  const busy = loading && quickId === account.id;
                  const title =
                    formatDisplayName(account.fio) || account.login;
                  return (
                    <li key={account.id} className="flex items-stretch">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void onQuickLogin(account)}
                        className={cn(
                          "group flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-[background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:px-5",
                          "hover:bg-white/[0.04] active:scale-[0.99] disabled:opacity-60",
                        )}
                      >
                        <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/[0.1] bg-white/[0.05]">
                          {avatars[account.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={avatars[account.id]}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center font-mono text-[11px] tracking-wide text-ink">
                              {account.fio ? (
                                accountInitials(account)
                              ) : (
                                <User size={16} weight="light" />
                              )}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium tracking-tight text-ink">
                            {title}
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-muted">
                            {account.universityName}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-[background-color,border-color,color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
                            busy
                              ? "border-white/20 bg-white/10 text-ink"
                              : "border-[var(--cta)]/40 bg-[var(--cta)] text-[var(--cta-ink)] group-hover:opacity-90",
                          )}
                        >
                          {busy ? "…" : t("login_submit")}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={t("login_remove_account")}
                        disabled={loading}
                        onClick={() => onRemoveAccount(account.id)}
                        className="flex w-12 shrink-0 items-center justify-center text-muted transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-pale-red-ink disabled:opacity-50"
                      >
                        <Trash size={16} weight="light" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ) : null}

          <Panel>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              {saved.length > 0 ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                  {t("login_other")}
                </p>
              ) : null}

              <UniversityPicker value={university} onChange={setUniversity} />

              <Field label={t("login_login")}>
                <Input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label={t("login_password")}>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>

              {error ? (
                <p className="rounded-[12px] bg-pale-red px-3 py-2 text-sm text-pale-red-ink">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={loading || !university}
                className="mt-1 w-full"
              >
                <span>
                  {loading && !quickId
                    ? t("login_submitting")
                    : t("login_submit")}
                </span>
                {!loading ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
                    <ArrowRight size={14} weight="light" />
                  </span>
                ) : null}
              </Button>
            </form>
          </Panel>
        </motion.div>
      </div>
    </main>
  );
}
