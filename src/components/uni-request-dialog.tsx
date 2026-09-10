"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { EASE_OUT_EXPO, EASE_SPRING_SOFT } from "@/components/motion";
import { Button, Field, Input } from "@/components/ui";
import { apiSubmitUniRequest } from "@/lib/api-client";
import { useT } from "@/lib/use-i18n";

type Props = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
};

export function UniRequestDialog({ open, initialName = "", onClose }: Props) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(initialName);
  const [telegram, setTelegram] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setTelegram("");
    setError(null);
    setOk(false);
    setLoading(false);
  }, [open, initialName]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    setError(null);
    try {
      await apiSubmitUniRequest({ universityName: name, telegram });
      setOk(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("login_uni_request_error"),
      );
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="uni-request"
          className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 sm:items-center sm:pb-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="uni-request-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.28, ease: EASE_OUT_EXPO }}
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/65"
            onClick={() => {
              if (!loading) onClose();
            }}
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
            className="relative w-full max-w-[22rem] rounded-[1.5rem] border border-white/[0.1] bg-white/[0.04] p-1"
          >
            <div className="rounded-[calc(1.5rem-0.25rem)] border border-white/[0.06] bg-[var(--dialog)] px-5 pb-5 pt-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.1] bg-pale-blue/35 text-pale-blue-ink">
                <PaperPlaneTilt size={26} weight="fill" />
              </span>
              <h2
                id="uni-request-title"
                className="mt-4 text-center font-display text-2xl font-medium tracking-tight text-ink"
              >
                {t("login_uni_request_title")}
              </h2>
              <p className="mx-auto mt-2 max-w-[34ch] text-center text-sm leading-relaxed text-muted">
                {ok ? t("login_uni_request_ok") : t("login_uni_request_body")}
              </p>

              {ok ? (
                <div className="mt-5">
                  <Button type="button" className="w-full" onClick={onClose}>
                    {t("close")}
                  </Button>
                </div>
              ) : (
                <form className="mt-5 flex flex-col gap-3.5" onSubmit={submit}>
                  <Field label={t("login_uni_request_name")}>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t("login_uni_request_name_ph")}
                      autoComplete="organization"
                      required
                      minLength={2}
                      maxLength={120}
                      autoFocus
                    />
                  </Field>
                  <Field label={t("login_uni_request_tg")}>
                    <Input
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder={t("login_uni_request_tg_ph")}
                      autoComplete="username"
                      inputMode="text"
                      required
                    />
                  </Field>
                  {error ? (
                    <p className="rounded-[10px] bg-pale-red/30 px-3 py-2 text-[12px] text-pale-red-ink">
                      {error}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full sm:w-auto"
                      disabled={loading}
                      onClick={onClose}
                    >
                      {t("cancel")}
                    </Button>
                    <Button
                      type="submit"
                      className="w-full sm:w-auto"
                      disabled={loading}
                    >
                      {loading
                        ? t("login_uni_request_sending")
                        : t("login_uni_request_submit")}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
