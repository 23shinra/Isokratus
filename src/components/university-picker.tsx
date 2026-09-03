"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Buildings } from "@phosphor-icons/react";
import { Field, Input } from "@/components/ui";
import {
  searchUniversities,
  type University,
} from "@/lib/universities";
import { cn } from "@/lib/cn";

type Props = {
  value: University | null;
  onChange: (uni: University | null) => void;
};

export function UniversityPicker({ value, onChange }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = useMemo(() => searchUniversities(query, 8), [query]);

  useEffect(() => {
    if (value) setQuery(value.name);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(uni: University) {
    onChange(uni);
    setQuery(uni.name);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <Field label="Университет" hint={value ? value.url.replace(/^https?:\/\//, "") : undefined}>
        <div className="relative">
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="Начни вводить название вуза"
            className="pl-9"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
              if (value && e.target.value !== value.name) onChange(null);
            }}
            onKeyDown={(e) => {
              if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
                setOpen(true);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && open && results[active]) {
                e.preventDefault();
                pick(results[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            required={!value}
          />
        </div>
      </Field>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-[10px] border border-line bg-[#12141a]/95 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">Ничего не найдено</li>
          ) : (
            results.map((uni, index) => {
              const selected = value?.id === uni.id;
              const highlighted = index === active;
              return (
                <li key={uni.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left transition",
                      highlighted || selected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                    )}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(uni)}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-pale-blue text-pale-blue-ink">
                      <Buildings size={16} weight="bold" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {uni.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                        {uni.city} · {uni.url.replace(/^https?:\/\//, "")}
                      </span>
                    </span>
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
