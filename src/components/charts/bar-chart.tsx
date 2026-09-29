"use client";

import { scaleBand, scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { easeOutCubic, niceTicks } from "./chart-utils";
import { useMeasure } from "./use-measure";
import { useProgress } from "./use-progress";

export interface BarSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** Estimated values drawn as a lighter wash. */
  projected?: boolean[];
}

/** Rounded path for a bar: 4px radius on the data end, square at the baseline. */
function barPath(x: number, y0: number, y1: number, w: number, r = 4) {
  const h = Math.abs(y1 - y0);
  const rr = Math.min(r, h, w / 2);
  if (y1 <= y0) {
    // grows upward
    return `M${x},${y0} V${y1 + rr} Q${x},${y1} ${x + rr},${y1} H${x + w - rr} Q${x + w},${y1} ${x + w},${y1 + rr} V${y0} Z`;
  }
  return `M${x},${y0} V${y1 - rr} Q${x},${y1} ${x + rr},${y1} H${x + w - rr} Q${x + w},${y1} ${x + w},${y1 - rr} V${y0} Z`;
}

export function BarChart({
  categories,
  series,
  height = 240,
  formatValue,
  formatAxis,
  formatCategory,
  className,
  ariaLabel,
  highlightIndex,
}: {
  categories: string[];
  series: BarSeries[];
  height?: number;
  formatValue: (v: number) => string;
  formatAxis?: (v: number) => string;
  formatCategory?: (c: string, i: number) => string;
  className?: string;
  ariaLabel: string;
  highlightIndex?: number;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const progress = useProgress(`${categories.join("|")}#${series.map((s) => s.id).join(",")}`, 700 + Math.min(categories.length, 24) * 25);
  const margin = { top: 12, right: 52, bottom: 24, left: 2 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom;

  const domain = useMemo<[number, number]>(() => {
    let min = 0;
    let max = 0;
    for (const s of series)
      for (const v of s.values)
        if (v != null) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
    if (min === max) max = 1;
    const pad = (max - min) * 0.08;
    return [min < 0 ? min - pad : 0, max > 0 ? max + pad : 0];
  }, [series]);

  const x = useMemo(
    () =>
      scaleBand<number>()
        .domain(categories.map((_, i) => i))
        .range([margin.left, margin.left + plotW])
        .paddingInner(0.28)
        .paddingOuter(0.12),
    [categories, plotW, margin.left],
  );
  const y = useMemo(
    () =>
      scaleLinear()
        .domain(domain)
        .nice(4)
        .range([margin.top + plotH, margin.top]),
    [domain, plotH, margin.top],
  );
  const ticks = useMemo(() => niceTicks(y.domain() as [number, number], 4), [y]);
  const band = x.bandwidth();
  const groupGap = 2;
  const barW = Math.min(24, (band - groupGap * (series.length - 1)) / Math.max(1, series.length));
  const groupW = barW * series.length + groupGap * (series.length - 1);
  const zero = y(0);
  const labelEvery = Math.max(1, Math.ceil(categories.length / Math.max(1, Math.floor(plotW / 44))));

  return (
    <div ref={ref} className={cn("relative w-full", className)} style={{ height }} role="img" aria-label={ariaLabel}>
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={y(t)}
                y2={y(t)}
                style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }}
                strokeWidth={1}
              />
              <text x={margin.left + plotW + 8} y={y(t)} dy="0.32em" className="tabular" style={{ fill: "var(--fg-subtle)", fontSize: 11 }}>
                {(formatAxis ?? formatValue)(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const gx = (x(i) ?? 0) + (band - groupW) / 2;
            const dim = hover != null && hover !== i;
            return (
              <g key={`${c}-${i}`} style={{ opacity: dim ? 0.45 : 1, transition: "opacity 150ms" }}>
                {series.map((s, k) => {
                  const v = s.values[i];
                  if (v == null || v === 0) return null;
                  const bx = gx + k * (barW + groupGap);
                  const projected = s.projected?.[i];
                  const lag = (i / Math.max(1, categories.length)) * 0.35;
                  const grow = easeOutCubic(Math.max(0, Math.min(1, (progress - lag) / (1 - lag))));
                  const top = zero + (y(v) - zero) * grow;
                  if (Math.abs(top - zero) < 0.5) return null;
                  return (
                    <path
                      key={s.id}
                      style={{
                        fill: projected ? `color-mix(in oklab, ${s.color} 32%, transparent)` : s.color,
                        stroke: projected ? s.color : undefined,
                        strokeWidth: projected ? 1 : 0,
                      }}
                      d={barPath(bx, zero, top, barW)}
                    />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text
                    x={(x(i) ?? 0) + band / 2}
                    y={height - 6}
                    textAnchor="middle"
                    style={{
                      fill: highlightIndex === i ? "var(--fg)" : "var(--fg-subtle)",
                      fontSize: 11,
                      fontWeight: highlightIndex === i ? 600 : 400,
                    }}
                  >
                    {formatCategory ? formatCategory(c, i) : c}
                  </text>
                )}
                <rect
                  x={x(i)}
                  y={margin.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl bg-surface-3/95 px-3 py-2 text-xs shadow-[var(--shadow-pop)] backdrop-blur-md"
          style={{ left: Math.max(4, Math.min(width - 196, (x(hover) ?? 0) + band / 2 - 96)) }}
        >
          <div className="mb-1 text-[11px] text-muted">{formatCategory ? formatCategory(categories[hover], hover) : categories[hover]}</div>
          {series.map((s) => {
            const v = s.values[hover];
            if (v == null) return null;
            return (
              <div key={s.id} className="flex items-center gap-2 py-0.5">
                <span className="size-2 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="font-semibold text-fg tabular">{formatValue(v)}</span>
                <span className="ml-auto truncate text-muted">
                  {s.label}
                  {s.projected?.[hover] ? " (estimé)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
