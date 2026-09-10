"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  CheckCircle,
  CircleNotch,
  Stop,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import jsQR from "jsqr";
import { Button } from "@/components/ui";
import { apiMarkQr } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/cn";
import { t as translate, type MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/use-i18n";
import { usePrefsStore } from "@/lib/prefs-store";

export default function QrPage() {
  return <QrView />;
}

type Phase = "idle" | "starting" | "scanning" | "sending" | "ok" | "err";
type Kind = "success" | "expired" | "already" | null;

type MarkResult = {
  phase: "ok" | "err";
  kind: Kind;
  title: string;
  headline: string;
  detail: string;
  at: string;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

const LAST_MARK_KEY = "sokratus-last-qr-mark";

function tr(key: MessageKey): string {
  return translate(usePrefsStore.getState().lang, key);
}

function cameraErrorMessage(err: unknown): string {
  const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
  const msg = err instanceof Error ? err.message : "";
  if (name === "NotAllowedError" || /permission|denied|not allowed/i.test(msg)) {
    return tr("qr_cam_denied");
  }
  if (name === "NotFoundError" || /not found|no device/i.test(msg)) {
    return tr("qr_cam_missing");
  }
  if (name === "NotReadableError" || /in use|track/i.test(msg)) {
    return tr("qr_cam_busy");
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return tr("qr_need_https");
  }
  return msg || tr("qr_cam_fail");
}

function buildMarkResult(kind: Kind, ok: boolean): MarkResult {
  const at = new Date().toISOString();

  if (kind === "success" || (ok && !kind)) {
    return {
      phase: "ok",
      kind: kind ?? "success",
      title: tr("qr_marked_title"),
      headline: tr("qr_marked_headline"),
      detail: "",
      at,
    };
  }
  if (kind === "already") {
    return {
      phase: "ok",
      kind,
      title: tr("qr_already_title"),
      headline: tr("qr_already_headline"),
      detail: "",
      at,
    };
  }
  if (kind === "expired") {
    return {
      phase: "err",
      kind,
      title: tr("qr_expired_title"),
      headline: tr("qr_expired_headline"),
      detail: "",
      at,
    };
  }
  return {
    phase: "err",
    kind: null,
    title: tr("qr_notfound_title"),
    headline: tr("qr_notfound_headline"),
    detail: "",
    at,
  };
}

function markFromError(err: unknown): MarkResult {
  const msg = err instanceof Error ? err.message : "";
  const kindField =
    err && typeof err === "object" && "kind" in err
      ? String((err as { kind?: string }).kind)
      : "";

  if (kindField === "expired" || /просроч/i.test(msg)) {
    return buildMarkResult("expired", false);
  }
  if (kindField === "already" || /уже\s+отмечен/i.test(msg)) {
    return buildMarkResult("already", false);
  }
  if (/не ответил|timeout|abort/i.test(msg)) {
    return {
      phase: "err",
      kind: null,
      title: tr("qr_no_response_title"),
      headline: tr("qr_no_response_headline"),
      detail: "",
      at: new Date().toISOString(),
    };
  }
  return buildMarkResult(null, false);
}

function readLastMark(): MarkResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LAST_MARK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MarkResult;
  } catch {
    return null;
  }
}

function writeLastMark(result: MarkResult) {
  try {
    sessionStorage.setItem(LAST_MARK_KEY, JSON.stringify(result));
  } catch {
    // ignore
  }
}

function QrView() {
  const { t } = useT();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const handlingRef = useRef(false);
  const startScannerRef = useRef<() => void>(() => undefined);
  const [phase, setPhase] = useState<Phase>("starting");
  const [result, setResult] = useState<MarkResult | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const last = readLastMark();
    if (last) setResult(last);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [modalOpen]);

  function showMark(mark: MarkResult) {
    setResult(mark);
    writeLastMark(mark);
    setCamError(null);
    setPhase(mark.phase);
    setModalOpen(true);
  }

  function showCamFail(message: string) {
    setCamError(message);
    setPhase("err");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setCamError(null);
    // Resume scanning after result (unless camera failed hard)
    if (!camError) {
      startScannerRef.current();
    } else {
      setPhase("idle");
    }
  }

  function stopLoop() {
    if (loopRef.current != null) {
      window.clearTimeout(loopRef.current);
      loopRef.current = null;
    }
  }

  function stopMedia() {
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }

  function stopScanner(fromUnmount = false) {
    stopLoop();
    stopMedia();
    if (!fromUnmount) {
      setPhase((p) => (p === "scanning" || p === "starting" ? "idle" : p));
    }
  }

  async function onDecoded(decoded: string) {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setPhase("sending");
    setCamError(null);
    stopLoop();
    stopMedia();
    try {
      await submitCode(decoded);
    } catch {
      handlingRef.current = false;
      showMark(markFromError(new Error(tr("qr_send_fail"))));
    }
  }

  function startDecodeLoop(video: HTMLVideoElement) {
    const canvas = canvasRef.current || document.createElement("canvas");
    canvasRef.current = canvas;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let detector: BarcodeDetectorLike | null = null;
    if (typeof window.BarcodeDetector === "function") {
      try {
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }

    const tick = async () => {
      if (handlingRef.current || !streamRef.current) return;
      try {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          if (detector) {
            const codes = await detector.detect(video);
            const value = codes.find((c) => c.rawValue)?.rawValue;
            if (value) {
              await onDecoded(value);
              return;
            }
          } else {
            const w = video.videoWidth;
            const h = video.videoHeight;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const image = ctx.getImageData(0, 0, w, h);
            const code = jsQR(image.data, w, h, { inversionAttempts: "attemptBoth" });
            if (code?.data) {
              await onDecoded(code.data);
              return;
            }
          }
        }
      } catch {
        // keep looping
      }
      loopRef.current = window.setTimeout(() => {
        void tick();
      }, 150);
    };

    void tick();
  }

  function startScanner() {
    const live = useAuthStore.getState().session;
    if (!live) {
      showCamFail(tr("qr_need_login"));
      return;
    }
    if (!window.isSecureContext) {
      showCamFail(tr("qr_need_https"));
      return;
    }
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      showCamFail(
        tr("qr_cam_messenger"),
      );
      return;
    }

    handlingRef.current = false;
    setCamError(null);
    setModalOpen(false);

    stopLoop();
    stopMedia();

    const streamPromise = mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .catch(() => mediaDevices.getUserMedia({ audio: false, video: true }));

    setPhase("starting");

    void streamPromise
      .then(async (stream) => {
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          showCamFail(tr("qr_video_not_ready"));
          return;
        }

        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        setPhase("scanning");

        try {
          await video.play();
        } catch {
          // muted + playsinline
        }

        startDecodeLoop(video);
      })
      .catch((err) => {
        stopMedia();
        showCamFail(cameraErrorMessage(err));
      });
  }

  startScannerRef.current = startScanner;

  async function submitCode(code: string) {
    if (!session || !code.trim()) {
      const fail = buildMarkResult(null, false);
      fail.headline = "QR распознан без данных";
      showMark(fail);
      handlingRef.current = false;
      return;
    }

    setPhase("sending");
    try {
      const res = await apiMarkQr(session, code.trim());
      const kind = res.kind ?? null;
      showMark(buildMarkResult(kind, Boolean(res.ok || res.marked)));
    } catch (err) {
      showMark(markFromError(err));
    } finally {
      handlingRef.current = false;
    }
  }

  // Auto-open camera as soon as we land on /qr
  useEffect(() => {
    if (!session) return;
    const t = window.setTimeout(() => startScannerRef.current(), 80);
    return () => {
      window.clearTimeout(t);
      stopScanner(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const scanning = phase === "scanning";
  const starting = phase === "starting";
  const sending = phase === "sending";
  const idle = phase === "idle";
  const modalOk = camError ? false : result?.phase === "ok";
  const modalTitle = camError ? t("qr_cam_fail_title") : result?.title || "";
  const modalHeadline = camError || result?.headline || "";
  const modalAt = camError ? undefined : result?.at;

  function leaveQr() {
    stopScanner(true);
    router.push("/schedule");
  }

  return (
    <div className="fixed inset-0 z-40 bg-black">
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 z-[1] h-full w-full bg-black object-cover",
          scanning ? "opacity-100" : "opacity-0",
        )}
        playsInline
        muted
        autoPlay
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Dim / overlays */}
      {(starting || idle || sending) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0c0e11] px-6 text-center">
          {starting || sending ? (
            <>
              <CircleNotch size={36} weight="light" className="animate-spin text-ink" />
              <p className="text-lg font-medium tracking-tight text-ink">
                {starting ? t("qr_scanning") : t("qr_sending")}
              </p>
              <p className="max-w-[28ch] text-sm text-muted">
                {starting
                  ? t("qr_allow_camera")
                  : t("qr_wait_reply")}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-medium text-ink">Камера выключена</p>
              <Button type="button" className="mt-2" onClick={startScanner}>
                <Camera size={18} weight="light" />
                <span>{t("qr_open_camera")}</span>
              </Button>
            </>
          )}
        </div>
      )}

      {scanning ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
            <div className="h-[min(68vw,280px)] w-[min(68vw,280px)] rounded-[1.75rem] border border-white/40 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
              QR · посещаемость
            </p>
            <p className="mt-1 text-sm font-medium text-white">Наведи на код с проектора</p>
          </div>
        </>
      ) : null}

      {/* Top close */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={leaveQr}
          aria-label={t("close")}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-ink transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96]"
        >
          <X size={20} weight="bold" />
        </button>
      </div>

      {/* Bottom controls */}
      {scanning ? (
        <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
          <p className="text-center text-[12px] text-white/65">
            Код с экрана — чуть дальше, без бликов
          </p>
          <Button
            type="button"
            variant="ghost"
            className="border-white/20 bg-black/40 text-ink hover:bg-black/55"
            onClick={() => stopScanner()}
          >
            <Stop size={18} weight="light" />
            <span>{t("qr_stop")}</span>
          </Button>
        </div>
      ) : null}

      {modalOpen && modalTitle ? (
        <ResultModal
          ok={Boolean(modalOk)}
          title={modalTitle}
          headline={modalHeadline}
          at={modalAt}
          onClose={closeModal}
        />
      ) : null}
    </div>
  );
}

function ResultModal({
  ok,
  title,
  headline,
  at,
  onClose,
}: {
  ok: boolean;
  title: string;
  headline: string;
  at?: string;
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 sm:items-center sm:pb-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-result-title"
    >
      <button
        type="button"
        aria-label={t("close")}
        className="absolute inset-0 bg-black/65 transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-[22rem] origin-bottom animate-[qrModalIn_420ms_cubic-bezier(0.32,0.72,0,1)_both] rounded-[1.5rem] border p-1 sm:origin-center",
          ok
            ? "border-pale-green-ink/30 bg-pale-green/20"
            : "border-pale-red-ink/30 bg-pale-red/20",
        )}
      >
        <div
          className={cn(
            "rounded-[calc(1.5rem-0.25rem)] border px-5 pb-5 pt-6 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
            ok
              ? "border-pale-green-ink/15 bg-[#141a16] text-pale-green-ink"
              : "border-pale-red-ink/15 bg-[#1a1414] text-pale-red-ink",
          )}
        >
          <span
            className={cn(
              "mx-auto flex h-14 w-14 items-center justify-center rounded-full border",
              ok
                ? "border-pale-green-ink/25 bg-pale-green/30"
                : "border-pale-red-ink/25 bg-pale-red/30",
            )}
          >
            {ok ? (
              <CheckCircle size={32} weight="fill" />
            ) : (
              <WarningCircle size={32} weight="fill" />
            )}
          </span>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] opacity-75">
            {ok ? t("qr_success_badge") : t("qr_fail_badge")}
          </p>
          <h2
            id="qr-result-title"
            className="mt-2 font-display text-2xl font-medium tracking-tight text-ink"
          >
            {title}
          </h2>
          <p className="mx-auto mt-2 max-w-[28ch] text-sm leading-relaxed text-ink/85">
            {headline}
          </p>
          {at ? (
            <p className="mt-3 font-mono text-[11px] opacity-60">
              {new Date(at).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          ) : null}
          <Button type="button" className="mt-5 w-full" onClick={onClose}>
            Понятно
          </Button>
        </div>
      </div>
    </div>
  );
}
