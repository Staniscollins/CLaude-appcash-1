"use client";

import { motion } from "motion/react";
import { formatPercent } from "@/lib/format";
import type { YearReturns } from "@/lib/portfolio/metrics";
import { cn } from "@/lib/utils";
import { divergingFill } from "./treemap";

const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

/** Calendar of monthly returns: a real table, tinted by sign and size. */
export function ReturnsHeatmap({
  years,
  benchmarkYears,
  benchmarkLabel,
}: {
  years: YearReturns[];
  benchmarkYears?: Map<number, number | null>;
  benchmarkLabel?: string;
}) {
  return (
    <div className="-mx-1 overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[720px] border-separate border-spacing-1 text-center text-xs tabular">
        <thead>
          <tr className="text-subtle">
            <th className="w-14 text-left font-medium">Année</th>
            {MONTHS.map((m) => (
              <th key={m} className="font-medium">
                {m}
              </th>
            ))}
            <th className="w-20 font-semibold text-muted">Total</th>
            {benchmarkYears && <th className="w-20 font-medium">{benchmarkLabel ?? "Indice"}</th>}
          </tr>
        </thead>
        <tbody>
          {years.map((y, row) => (
            <tr key={y.year}>
              <th className="text-left font-semibold text-fg">{y.year}</th>
              {y.months.map((m, i) => (
                <motion.td
                  key={i}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(0.6, row * 0.06 + i * 0.015), type: "spring", stiffness: 300, damping: 26 }}
                  className={cn(
                    "h-9 rounded-md font-medium",
                    m == null ? "text-subtle" : Math.abs(m) / 0.08 > 0.55 ? "text-white" : "text-fg",
                  )}
                  style={{ background: m == null ? "transparent" : divergingFill(m, 0.08) }}
                  title={m == null ? undefined : `${MONTHS[i]} ${y.year} : ${formatPercent(m, { sign: true })}`}
                >
                  {m == null ? "·" : formatPercent(m, { sign: true, decimals: 1 })}
                </motion.td>
              ))}
              <td
                className={cn("h-9 rounded-md font-semibold", y.total == null ? "text-subtle" : y.total >= 0 ? "text-gain" : "text-loss")}
                style={{ background: "var(--surface-2)" }}
              >
                {formatPercent(y.total, { sign: true, decimals: 1 })}
              </td>
              {benchmarkYears && (
                <td className="h-9 rounded-md text-muted" style={{ background: "var(--surface-2)" }}>
                  {formatPercent(benchmarkYears.get(y.year) ?? null, { sign: true, decimals: 1 })}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
