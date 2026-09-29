"use client";

import { motion } from "motion/react";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
  stretch?: boolean;
}

/** Segmented control with a sliding selection pill. */
export function Segmented<T extends string>({ options, value, onChange, size = "sm", className, ariaLabel, stretch }: SegmentedProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, index: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    let next = index;
    for (let i = 0; i < options.length; i++) {
      next = (next + dir + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center rounded-xl bg-surface-2/70 p-1 ring-1 ring-border",
        stretch && "flex w-full",
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            disabled={opt.disabled}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors duration-200 disabled:opacity-40",
              size === "sm" ? "h-7 rounded-lg px-2.5 text-xs" : "h-8 rounded-[10px] px-3.5 text-[13px]",
              stretch && "flex-1",
              active ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 -z-10 rounded-[inherit] bg-surface-3 shadow-[0_1px_2px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.06)] ring-1 ring-border-strong"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
