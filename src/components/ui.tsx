import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-5 md:px-6 md:pt-10">
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
    <header className="mb-6 flex items-start justify-between gap-3 sm:mb-8 sm:gap-4">
      <div className="min-w-0">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          Sokratus
        </p>
        <h1 className="font-display text-[1.75rem] font-medium leading-tight text-ink sm:text-3xl md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-[40ch] text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center self-center">{action}</div>
      ) : null}
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
          flush ? "overflow-hidden p-0" : "p-4 sm:p-5 md:p-6",
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
    <div className="flex flex-col gap-2">
      <span className="text-sm text-ink">{label}</span>
      {children}
      {hint && !error ? <span className="text-xs text-muted">{hint}</span> : null}
      {error ? <span className="text-xs text-pale-red-ink">{error}</span> : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        /* text-base (16px): avoid iOS auto-zoom on focus */
        "h-12 w-full rounded-[10px] border border-white/[0.08] bg-black/25 px-3.5 text-base text-ink outline-none sm:h-11 sm:text-sm",
        "transition-[border-color,background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "placeholder:text-muted/70 focus:border-white/20 focus:bg-black/35",
        props.className,
      )}
    />
  );
}

export type SelectOption = {
  value: string;
  label: string;
};

/** Custom listbox — Cascade glass, not native OS chrome. */
export function Select({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Выбери",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value) ?? null;
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    if (open) setActive(selectedIndex);
  }, [open, selectedIndex]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            if (e.key === "ArrowDown") {
              setActive((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
            } else if (options[active]) {
              pick(options[active].value);
            }
          } else if (e.key === "ArrowUp" && open) {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-3 rounded-[10px] border border-white/[0.08] bg-black/25 px-3.5 text-left text-base text-ink outline-none sm:h-11 sm:text-sm",
          "transition-[border-color,background-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "hover:bg-black/30 focus:border-white/20 focus:bg-black/35",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-white/20 bg-black/35",
        )}
      >
        <span className={cn("min-w-0 truncate", !selected && "text-muted")}>
          {selected?.label || placeholder}
        </span>
        <CaretDown
          size={16}
          weight="bold"
          className={cn(
            "shrink-0 text-muted transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            open && "rotate-180 text-ink",
          )}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-activedescendant={
            options[active] ? `${listId}-opt-${options[active].value}` : undefined
          }
          className={cn(
            "absolute z-40 mt-2 max-h-64 w-full overflow-auto rounded-[14px] border border-white/[0.1]",
            "ios-no-blur bg-[var(--elevated)] py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]",
          )}
        >
          {options.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-muted">Нет вариантов</li>
          ) : (
            options.map((opt, index) => {
              const isSelected = opt.value === value;
              const isActive = index === active;
              return (
                <li
                  key={opt.value}
                  id={`${listId}-opt-${opt.value}`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-sm transition-[background-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      isActive || isSelected
                        ? "bg-white/[0.07] text-ink"
                        : "text-ink/90 hover:bg-white/[0.04]",
                    )}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(opt.value)}
                  >
                    <span className="min-w-0 truncate">{opt.label}</span>
                    {isSelected ? (
                      <Check
                        size={16}
                        weight="bold"
                        className="shrink-0 text-[#eceae4]"
                      />
                    ) : (
                      <span className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
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
        "group inline-flex h-12 min-h-[48px] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium sm:h-11 sm:min-h-11",
        "transition-[transform,background-color,opacity,color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]",
        "active:scale-[0.98] disabled:opacity-50",
        variant === "primary" &&
          "bg-[var(--cta)] text-[var(--cta-ink)] hover:opacity-90",
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
