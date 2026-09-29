"use client";

import { motion } from "motion/react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Low–high track with the current value marker (52-week range, day range…). */
export function RangeBar({
  low,
  high,
  value,
  currency,
  className,
  labels = true,
}: {
  low: number | null | undefined;
  high: number | null | undefined;
  value: number | null | undefined;
  currency?: string;
  className?: string;
  labels?: boolean;
}) {
  if (low == null || high == null || value == null || !(high > low)) {
    return <div className={cn("text-xs text-subtle", className)}>—</div>;
  }
  const pos = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-1.5 rounded-full bg-surface-3">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: "linear-gradient(90deg, var(--loss), color-mix(in oklab, var(--loss) 30%, var(--gain)), var(--gain))",
            opacity: 0.55,
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pos * 100}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
        />
        <motion.div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-surface"
          initial={{ left: "0%" }}
          animate={{ left: `${pos * 100}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
        />
      </div>
      {labels && (
        <div className="mt-1.5 flex justify-between text-[11px] text-subtle tabular">
          <span>{formatPrice(low, currency)}</span>
          <span>{formatPrice(high, currency)}</span>
        </div>
      )}
    </div>
  );
}

/** Analyst price targets: low / mean / high with the current price. */
export function TargetBar({
  low,
  mean,
  high,
  current,
  currency,
}: {
  low: number;
  mean: number;
  high: number;
  current: number;
  currency?: string;
}) {
  const min = Math.min(low, current) * 0.97;
  const max = Math.max(high, current) * 1.03;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const clamp = (v: number) => Math.max(12, Math.min(88, v));
  return (
    <div className="pt-6 pb-1">
      <div className="relative">
        <div
          className="absolute -top-6 -translate-x-1/2 text-center text-[11px] font-semibold whitespace-nowrap text-accent tabular"
          style={{ left: `${clamp(pct(mean))}%` }}
        >
          Moyen {formatPrice(mean, currency)}
        </div>
        <div className="relative h-2 rounded-full bg-surface-3">
          <div className="absolute inset-y-0 rounded-full bg-accent/35" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
          <div
            className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{ left: `${pct(mean)}%` }}
          />
          <motion.div
            className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-[3px] ring-surface"
            initial={{ left: "0%" }}
            animate={{ left: `${pct(current)}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            title={`Cours actuel ${formatPrice(current, currency)}`}
          />
        </div>
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-subtle tabular">
        <span>Bas {formatPrice(low, currency)}</span>
        <span>Haut {formatPrice(high, currency)}</span>
      </div>
    </div>
  );
}
