"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AnimatedMoney, AnimatedPercent } from "./money";

export function trendClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 1e-12) return "text-muted";
  return value > 0 ? "text-gain" : "text-loss";
}

export function TrendIcon({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 1e-12)
    return <Minus className={cn("size-3.5", className)} aria-hidden />;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return <Icon className={cn("size-3.5", className)} aria-hidden />;
}

/** Signed percentage coloured by direction, with an arrow so colour is never the only cue. */
export function DeltaPercent({
  value,
  className,
  icon = true,
  decimals = 2,
  animated = false,
}: {
  value: number | null | undefined;
  className?: string;
  icon?: boolean;
  decimals?: number;
  animated?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap font-medium tabular", trendClass(value), className)}>
      {icon && <TrendIcon value={value} />}
      {animated && value != null ? <AnimatedPercent value={value} decimals={decimals} /> : formatPercent(value, { sign: true, decimals })}
    </span>
  );
}

export function DeltaMoney({
  value,
  currency = "EUR",
  className,
  compact,
  animated = false,
}: {
  value: number | null | undefined;
  currency?: string;
  className?: string;
  compact?: boolean;
  animated?: boolean;
}) {
  return (
    <span className={cn("whitespace-nowrap font-medium tabular", trendClass(value), className)}>
      {animated && value != null ? (
        <AnimatedMoney value={value} currency={currency} sign />
      ) : (
        <span className="sensitive">{formatMoney(value, currency, { sign: true, compact })}</span>
      )}
    </span>
  );
}

/** Tinted pill: "▲ +1 234 € (+2,3 %)". */
export function DeltaPill({
  amount,
  percent,
  currency = "EUR",
  suffix,
  animated = true,
  className,
}: {
  amount?: number | null;
  percent?: number | null;
  currency?: string;
  suffix?: string;
  animated?: boolean;
  className?: string;
}) {
  const ref = percent ?? amount ?? 0;
  const tone =
    ref > 1e-12
      ? "bg-gain/12 text-gain ring-gain/20"
      : ref < -1e-12
        ? "bg-loss/12 text-loss ring-loss/20"
        : "bg-surface-2 text-muted ring-border";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium ring-1 tabular", tone, className)}
    >
      <TrendIcon value={ref} />
      {amount != null &&
        (animated ? (
          <AnimatedMoney value={amount} currency={currency} sign />
        ) : (
          <span className="sensitive">{formatMoney(amount, currency, { sign: true })}</span>
        ))}
      {percent != null && (
        <span className={cn(amount != null && "opacity-80")}>
          {amount != null && "("}
          {animated ? <AnimatedPercent value={percent} /> : formatPercent(percent, { sign: true })}
          {amount != null && ")"}
        </span>
      )}
      {suffix && <span className="font-normal text-muted">{suffix}</span>}
    </span>
  );
}
