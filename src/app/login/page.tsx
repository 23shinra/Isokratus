"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";
import { apiLogin } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { UniversityPicker } from "@/components/university-picker";
import { Button, Field, Input, Panel } from "@/components/ui";
import { EASE_OUT_EXPO, EASE_SPRING_SOFT } from "@/components/motion";
import {
  findUniversityByUrl,
  type University,
} from "@/lib/universities";
import type { Lang } from "@/lib/platonus/types";

const DEFAULT_URL = process.env.NEXT_PUBLIC_PLATONUS_URL || "";

export default function LoginPage() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);

  const [university, setUniversity] = useState<University | null>(() =>
    DEFAULT_URL ? findUniversityByUrl(DEFAULT_URL) ?? null : null,
  );
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [lang, setLang] = useState<Lang>("ru");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace("/schedule");
  }, [session, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!university) {
      setError("Выбери университет из списка");
      return;
    }

    setLoading(true);
    try {
      const result = await apiLogin({
        baseUrl: university.url,
        login,
        password,
        lang,
      });

      if (!result.auth_token) {
        throw new Error(result.message || "Токен не получен");
      }

      setSession({
        baseUrl: result.baseUrl,
        token: result.auth_token,
        sid: result.sid ? String(result.sid) : undefined,
        uid: result.uid ? String(result.uid) : undefined,
        clientId: result.clientId ? String(result.clientId) : undefined,
        cookies: result.cookies,
        personId: result.personID,
        personType: result.personType,
        fio: result.fio,
        universityName: university.name,
        groupId: result.groupId,
        groupName: result.groupName,
        lang,
      });
      router.replace("/schedule");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.85, ease: EASE_OUT_EXPO }}
          className="mb-8"
        >
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            Platonus Lite
          </p>
          <h1 className="font-display text-4xl font-semibold text-ink md:text-5xl">
            Вход
          </h1>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: EASE_SPRING_SOFT, delay: 0.1 }}
        >
          <Panel>
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <UniversityPicker value={university} onChange={setUniversity} />

              <Field label="Логин">
                <Input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                  required
                />
              </Field>

              <Field label="Пароль">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>

              <Field label="Язык">
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["ru", "RU"],
                      ["kz", "KZ"],
                      ["en", "EN"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLang(value)}
                      className={`h-10 rounded-full border text-sm transition-[background-color,color,transform,border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${
                        lang === value
                          ? "border-[#eceae4] bg-[#eceae4] text-[#111111]"
                          : "border-white/[0.1] bg-black/20 text-muted hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
                <span>{loading ? "Входим…" : "Войти"}</span>
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
