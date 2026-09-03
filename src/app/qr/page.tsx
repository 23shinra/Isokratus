"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { Html5Qrcode } from "html5-qrcode";
import { AppChrome } from "@/components/app-chrome";
import { Button, Field, Input, PageHeader, Panel, Shell } from "@/components/ui";
import { apiMarkQr } from "@/lib/api-client";
import { useAuthStore } from "@/lib/auth-store";

export default function QrPage() {
  return (
    <AppChrome>
      <Shell>
        <QrView />
      </Shell>
    </AppChrome>
  );
}

function QrView() {
  const session = useAuthStore((s) => s.session);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      await scanner.clear();
    } catch {
      // ignore cleanup errors
    }
    scannerRef.current = null;
    setScanning(false);
  }

  async function startScanner() {
    if (!session) return;
    setStatus("idle");
    setMessage(null);
    await stopScanner();

    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;
    setScanning(true);

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        async (decoded) => {
          if (handlingRef.current) return;
          handlingRef.current = true;
          try {
            await submitCode(decoded);
            await stopScanner();
          } finally {
            handlingRef.current = false;
          }
        },
        () => undefined,
      );
    } catch (err) {
      setScanning(false);
      setStatus("err");
      setMessage(
        err instanceof Error
          ? err.message
          : "Не удалось открыть камеру. Разрешите доступ или введите код вручную.",
      );
    }
  }

  async function submitCode(code: string) {
    if (!session || !code.trim()) return;
    setBusy(true);
    setStatus("idle");
    setMessage(null);
    try {
      const res = await apiMarkQr(session, code.trim());
      setStatus("ok");
      setMessage(`Отмечено. Эндпоинт: ${res.path}`);
      setManual("");
    } catch (err) {
      setStatus("err");
      setMessage(err instanceof Error ? err.message : "Ошибка отметки");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="QR" />

      <Panel className="mb-4" flush>
        <div
          id="qr-reader"
          className="min-h-[280px] w-full bg-[#111] [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
      </Panel>

      <div className="mb-6 flex flex-wrap gap-2">
        {!scanning ? (
          <Button type="button" onClick={() => void startScanner()} disabled={busy}>
            Открыть камеру
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={() => void stopScanner()}>
            Остановить
          </Button>
        )}
      </div>

      <Panel>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(manual);
          }}
        >
          <Field label="Или вставь содержимое QR вручную">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Строка из QR"
            />
          </Field>
          <Button type="submit" variant="soft" disabled={busy || !manual.trim()}>
            {busy ? "Отправляем…" : "Отметить"}
          </Button>
        </form>
      </Panel>

      {message ? (
        <div
          className={`mt-4 flex items-start gap-2 rounded-[1.1rem] px-4 py-3 text-sm ${
            status === "ok"
              ? "bg-pale-green text-pale-green-ink"
              : "bg-pale-red text-pale-red-ink"
          }`}
        >
          {status === "ok" ? (
            <CheckCircle size={18} weight="regular" className="mt-0.5 shrink-0" />
          ) : (
            <WarningCircle size={18} weight="regular" className="mt-0.5 shrink-0" />
          )}
          <p>{message}</p>
        </div>
      ) : null}
    </>
  );
}
