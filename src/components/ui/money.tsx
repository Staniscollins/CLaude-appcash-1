"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { formatMoney, formatPercent, formatPrice, isSubunitCurrency, currencySymbol, LOCALE, priceDecimals } from "@/lib/format";
import { cn } from "@/lib/utils";

interface MoneyProps {
  value: number | null | undefined;
  currency?: string;
  compact?: boolean;
  sign?: boolean;
  decimals?: number;
  className?: string;
  /** Blurred in privacy mode (default true). */
  sensitive?: boolean;
}

export function Money({ value, currency = "EUR", compact, sign, decimals, className, sensitive = true }: MoneyProps) {
  return (
    <span className={cn(sensitive && "sensitive", "whitespace-nowrap", className)}>
      {formatMoney(value, currency, { compact, sign, decimals })}
    </span>
  );
}

export function Price({ value, currency, className }: { value: number | null | undefined; currency?: string; className?: string }) {
  return <span className={cn("whitespace-nowrap", className)}>{formatPrice(value, currency)}</span>;
}

export function Percent({
  value,
  sign,
  decimals = 2,
  className,
}: {
  value: number | null | undefined;
  sign?: boolean;
  decimals?: number;
  className?: string;
}) {
  return <span className={cn("whitespace-nowrap", className)}>{formatPercent(value, { sign, decimals })}</span>;
}

function moneyFormat(currency: string, decimals: number, sign: boolean): Format {
  if (isSubunitCurrency(currency) || !/^[A-Z]{3}$/.test(currency)) {
    return { minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: sign ? "exceptZero" : "auto" };
  }
  return {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? "exceptZero" : "auto",
  };
}

/** Amount whose digits roll when the value changes. */
export function AnimatedMoney({
  value,
  currency = "EUR",
  sign = false,
  decimals,
  className,
  sensitive = true,
  animated = true,
}: {
  value: number;
  currency?: string;
  sign?: boolean;
  decimals?: number;
  className?: string;
  sensitive?: boolean;
  animated?: boolean;
}) {
  const d = decimals ?? (Math.abs(value) >= 1_000_000 ? 0 : 2);
  const sub = isSubunitCurrency(currency) || !/^[A-Z]{3}$/.test(currency);
  return (
    <NumberFlow
      value={Number.isFinite(value) ? value : 0}
      locales={LOCALE}
      format={moneyFormat(currency, d, sign)}
      suffix={sub ? ` ${currencySymbol(currency)}` : undefined}
      animated={animated}
      className={cn(sensitive && "sensitive", "whitespace-nowrap", className)}
      willChange
    />
  );
}

export function AnimatedPrice({ value, currency, className }: { value: number; currency?: string; className?: string }) {
  if (!currency) {
    const d = priceDecimals(value);
    return (
      <NumberFlow value={value} locales={LOCALE} format={{ minimumFractionDigits: d, maximumFractionDigits: d }} className={className} />
    );
  }
  return <AnimatedMoney value={value} currency={currency} decimals={priceDecimals(value)} sensitive={false} className={className} />;
}

/** Ratio rendered as a rolling percentage (0.0123 → +1,23 %). */
export function AnimatedPercent({
  value,
  sign = true,
  decimals = 2,
  className,
  animated = true,
}: {
  value: number;
  sign?: boolean;
  decimals?: number;
  className?: string;
  animated?: boolean;
}) {
  return (
    <NumberFlow
      value={Number.isFinite(value) ? value : 0}
      locales={LOCALE}
      format={{
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        signDisplay: sign ? "exceptZero" : "auto",
      }}
      animated={animated}
      className={cn("whitespace-nowrap", className)}
    />
  );
}
