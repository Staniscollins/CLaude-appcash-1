"use client";

import { area as d3area, curveMonotoneX, line as d3line } from "d3-shape";
import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

/** Tiny trend line. Colour follows the direction between first and last value unless given. */
export function Sparkline({
  values,
  width = 96,
  height = 32,
  color,
  baseline,
  area = true,
  className,
  strokeWidth = 1.5,
}: {
  values: (number | null | undefined)[];
  width?: number;
  height?: number;
  color?: string;
  baseline?: number | null;
  area?: boolean;
  className?: string;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, "");
  const clean = useMemo(() => values.filter((v): v is number => v != null && Number.isFinite(v)), [values]);
  const geometry = useMemo(() => {
    if (clean.length < 2) return null;
    let min = Math.min(...clean);
    let max = Math.max(...clean);
    if (baseline != null && Number.isFinite(baseline)) {
      min = Math.min(min, baseline);
      max = Math.max(max, baseline);
    }
    const span = max - min || Math.abs(max) * 0.01 || 1;
    const pad = 2;
    const pts: [number, number][] = clean.map((v, i) => [
      (i / (clean.length - 1)) * (width - pad * 2) + pad,
      height - pad - ((v - min) / span) * (height - pad * 2),
    ]);
    const line = d3line<[number, number]>().curve(curveMonotoneX)(pts) ?? "";
    const fill = d3area<[number, number]>().y0(height).curve(curveMonotoneX)(pts) ?? "";
    const by = baseline != null && Number.isFinite(baseline) ? height - pad - ((baseline - min) / span) * (height - pad * 2) : null;
    return { line, fill, by };
  }, [clean, width, height, baseline]);

  const up = clean.length > 1 ? clean[clean.length - 1] >= (baseline ?? clean[0]) : true;
  const stroke = color ?? (up ? "var(--gain)" : "var(--loss)");

  if (!geometry) return <div className={cn("shrink-0", className)} style={{ width, height }} />;
  return (
    <svg width={width} height={height} className={cn("shrink-0 overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: stroke, stopOpacity: 0.25 }} />
          <stop offset="100%" style={{ stopColor: stroke, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {geometry.by != null && (
        <line
          x1={0}
          x2={width}
          y1={geometry.by}
          y2={geometry.by}
          style={{ stroke: "var(--fg-subtle)" }}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      )}
      {area && <path d={geometry.fill} style={{ fill: `url(#sp-${id})` }} />}
      <path d={geometry.line} fill="none" style={{ stroke }} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
