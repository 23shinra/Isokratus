import { type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-32 pt-6 md:px-6 md:pt-10">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4">
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          Platonus Lite
        </p>
        <h1 className="font-display text-3xl font-medium text-ink md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-[40ch] text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/** Double-bezel glass panel (outer tray + inner core). */
export function Panel({
  children,
  className,
  flush = false,
}: {
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.35rem] border border-white/[0.07] bg-white/[0.03] p-1.5",
        className,
      )}
    >
      <div
        className={cn(
          "glass-panel rounded-[calc(1.35rem-0.375rem)] border border-white/[0.06]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
          flush ? "overflow-hidden p-0" : "p-5 md:p-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-ink">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-muted">{hint}</span> : null}
      {error ? <span className="text-xs text-pale-red-ink">{error}</span> : null}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-[10px] border border-white/[0.08] bg-black/25 px-3.5 text-ink outline-none",
        "transition-[border-color,background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "placeholder:text-muted/70 focus:border-white/20 focus:bg-black/35",
        props.className,
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-11 w-full rounded-[10px] border border-white/[0.08] bg-black/25 px-3.5 text-ink outline-none",
        "transition-[border-color,background-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "focus:border-white/20",
        props.className,
      )}
    />
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "soft";
}) {
  return (
    <button
      {...props}
      className={cn(
        "group inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium",
        "transition-[transform,background-color,opacity,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "active:scale-[0.98] disabled:opacity-50",
        variant === "primary" &&
          "bg-[#eceae4] text-[#111111] hover:bg-white",
        variant === "ghost" &&
          "border border-white/[0.1] bg-transparent text-ink hover:bg-white/[0.04]",
        variant === "soft" && "bg-pale-blue text-pale-blue-ink hover:opacity-90",
        className,
      )}
    />
  );
}

export function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "blue" | "green" | "red" | "yellow";
}) {
  const tones = {
    blue: "bg-pale-blue text-pale-blue-ink",
    green: "bg-pale-green text-pale-green-ink",
    red: "bg-pale-red text-pale-red-ink",
    yellow: "bg-pale-yellow text-pale-yellow-ink",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-white/[0.1] px-6 py-14 text-center">
      <p className="text-base font-medium tracking-tight text-ink">{title}</p>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[12px] bg-white/[0.06]",
        "animate-[skeleton-shimmer_1.6s_cubic-bezier(0.32,0.72,0,1)_infinite]",
        className,
      )}
    />
  );
}
