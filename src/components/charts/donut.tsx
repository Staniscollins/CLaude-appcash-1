"use client";

import { arc as d3arc, pie as d3pie, type PieArcDatum } from "d3-shape";
import { useMemo, type ReactNode } from "react";
import { easeOutCubic } from "./chart-utils";
import { useProgress } from "./use-progress";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Part-to-whole ring (≤ 6 slices) with a sweep-in and hover emphasis. */
export function Donut({
  slices,
  size = 200,
  thickness = 20,
  activeKey,
  onActiveChange,
  center,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  activeKey?: string | null;
  onActiveChange?: (key: string | null) => void;
  center?: ReactNode;
}) {
  const signature = slices.map((s) => s.key).join("|");
  const progress = easeOutCubic(useProgress(signature, 900));

  const arcs = useMemo(
    () =>
      d3pie<DonutSlice>()
        .value((d) => d.value)
        .sort(null)
        .padAngle(slices.length > 1 ? 0.018 : 0)(slices),
    [slices],
  );

  const r = size / 2;
  const total = Math.PI * 2 * progress;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`${-r} ${-r} ${size} ${size}`} role="img" aria-label="Répartition">
        <circle r={r - thickness / 2 - 1} fill="none" style={{ stroke: "var(--surface-2)" }} strokeWidth={thickness} />
        {arcs.map((a: PieArcDatum<DonutSlice>) => {
          const active = activeKey === a.data.key;
          const dimmed = activeKey != null && !active;
          const start = Math.min(a.startAngle, total);
          const end = Math.min(a.endAngle, total);
          if (end <= start) return null;
          const path = d3arc<{ startAngle: number; endAngle: number; padAngle: number }>()
            .innerRadius(r - thickness - (active ? 3 : 1))
            .outerRadius(r - (active ? 0 : 2))
            .cornerRadius(4)({ startAngle: start, endAngle: end, padAngle: a.padAngle });
          return (
            <path
              key={a.data.key}
              d={path ?? ""}
              style={{ fill: a.data.color, opacity: dimmed ? 0.35 : 1, transition: "opacity 200ms" }}
              onPointerEnter={() => onActiveChange?.(a.data.key)}
              onPointerLeave={() => onActiveChange?.(null)}
            />
          );
        })}
      </svg>
      {center && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>}
    </div>
  );
}
