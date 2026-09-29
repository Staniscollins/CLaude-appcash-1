"use client";

import { scaleLinear } from "d3-scale";
import { memo, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { niceTicks, paddedDomain, tickIndices } from "./chart-utils";
import { useMeasure } from "./use-measure";
import { useProgress } from "./use-progress";

interface Props {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v?: number[];
  height?: number;
  formatValue: (v: number) => string;
  formatX: (t: number) => string;
  formatXTick: (t: number) => string;
  formatVolume?: (v: number) => string;
  onHover?: (index: number | null) => void;
  animationKey?: string;
  ariaLabel: string;
}

/** OHLC candles with a volume strip, crosshair and OHLC readout. */
function CandleChartImpl({
  t,
  o,
  h,
  l,
  c,
  v,
  height = 340,
  formatValue,
  formatX,
  formatXTick,
  formatVolume,
  onHover,
  animationKey,
  ariaLabel,
}: Props) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const progress = useProgress(animationKey ?? `${t.length}`, 650);
  const n = c.length;
  const margin = { top: 14, right: 58, bottom: 26, left: 2 };
  const volH = v ? Math.round((height - margin.top - margin.bottom) * 0.18) : 0;
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = height - margin.top - margin.bottom - volH - (v ? 8 : 0);

  const domain = useMemo(
    () =>
      paddedDomain(
        [...l, ...h].filter((x) => Number.isFinite(x)),
        0.06,
      ),
    [l, h],
  );
  const x = useMemo(
    () =>
      scaleLinear()
        .domain([-0.5, Math.max(0.5, n - 0.5)])
        .range([margin.left, margin.left + plotW]),
    [n, plotW, margin.left],
  );
  const y = useMemo(
    () =>
      scaleLinear()
        .domain(domain)
        .range([margin.top + plotH, margin.top]),
    [domain, plotH, margin.top],
  );
  const maxVol = useMemo(() => (v ? Math.max(...v, 1) : 1), [v]);
  const bw = Math.max(1, Math.min(14, (plotW / Math.max(1, n)) * 0.68));
  const volTop = margin.top + plotH + 8;
  const ticks = useMemo(() => niceTicks(domain, 4).filter((tk) => tk >= domain[0] && tk <= domain[1]), [domain]);
  const xTicks = useMemo(() => tickIndices(n, width < 420 ? 3 : 5), [n, width]);

  const set = (i: number | null) => {
    setHover(i);
    onHover?.(i);
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(x.invert(e.clientX - rect.left + margin.left));
    set(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    set(Math.max(0, Math.min(n - 1, (hover ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const hv = hover != null ? { o: o[hover], h: h[hover], l: l[hover], c: c[hover], v: v?.[hover] } : null;

  return (
    <div
      ref={ref}
      className="relative w-full outline-none"
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      onBlur={() => set(null)}
    >
      {width > 0 && n > 0 && (
        <svg width={width} height={height} className="block">
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={margin.left} x2={margin.left + plotW} y1={y(tk)} y2={y(tk)} style={{ stroke: "var(--grid)" }} />
              <text
                x={margin.left + plotW + 8}
                y={y(tk)}
                dy="0.32em"
                className="tabular"
                style={{ fill: "var(--fg-subtle)", fontSize: 11 }}
              >
                {formatValue(tk)}
              </text>
            </g>
          ))}
          {c.map((close, i) => {
            const open = o[i];
            const up = close >= open;
            const color = up ? "var(--gain)" : "var(--loss)";
            const cx = x(i);
            const lag = (i / Math.max(1, n)) * 0.5;
            const grow = Math.max(0, Math.min(1, (progress - lag) / 0.5));
            const mid = (y(open) + y(close)) / 2;
            const top = mid + (Math.min(y(open), y(close)) - mid) * grow;
            const bottom = mid + (Math.max(y(open), y(close)) - mid) * grow;
            const dim = hover != null && hover !== i;
            return (
              <g key={i} style={{ opacity: dim ? 0.55 : 1 }}>
                <line
                  x1={cx}
                  x2={cx}
                  y1={mid + (y(h[i]) - mid) * grow}
                  y2={mid + (y(l[i]) - mid) * grow}
                  style={{ stroke: color }}
                  strokeWidth={1}
                />
                <rect
                  x={cx - bw / 2}
                  y={top}
                  width={bw}
                  height={Math.max(1, bottom - top)}
                  rx={Math.min(1.5, bw / 4)}
                  style={{ fill: color }}
                />
                {v && (
                  <rect
                    x={cx - bw / 2}
                    y={volTop + volH - (v[i] / maxVol) * volH * grow}
                    width={bw}
                    height={(v[i] / maxVol) * volH * grow}
                    style={{ fill: color, opacity: 0.35 }}
                  />
                )}
              </g>
            );
          })}
          {hover != null && (
            <g pointerEvents="none">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={margin.top}
                y2={volTop + volH}
                style={{ stroke: "var(--fg-muted)" }}
                strokeOpacity={0.5}
              />
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={y(c[hover])}
                y2={y(c[hover])}
                style={{ stroke: "var(--fg-muted)" }}
                strokeOpacity={0.35}
              />
              <rect x={margin.left + plotW + 2} y={y(c[hover]) - 10} width={56} height={20} rx={6} style={{ fill: "var(--surface-3)" }} />
              <text
                x={margin.left + plotW + 8}
                y={y(c[hover])}
                dy="0.32em"
                className="tabular"
                style={{ fill: "var(--fg)", fontSize: 11, fontWeight: 600 }}
              >
                {formatValue(c[hover])}
              </text>
            </g>
          )}
          {xTicks.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={height - 6}
              textAnchor={k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle"}
              style={{ fill: "var(--fg-subtle)", fontSize: 11 }}
            >
              {formatXTick(t[i])}
            </text>
          ))}
          <rect
            x={margin.left}
            y={0}
            width={plotW}
            height={height}
            fill="transparent"
            style={{ touchAction: "pan-y" }}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => set(null)}
          />
        </svg>
      )}
      {hv && hover != null && (
        <div className="pointer-events-none absolute top-0 left-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface-3/90 px-2.5 py-1 text-[11px] text-muted shadow-[var(--shadow-pop)] backdrop-blur tabular">
          <span className="font-medium text-fg">{formatX(t[hover])}</span>
          <span>O {formatValue(hv.o)}</span>
          <span>H {formatValue(hv.h)}</span>
          <span>B {formatValue(hv.l)}</span>
          <span className={cn("font-semibold", hv.c >= hv.o ? "text-gain" : "text-loss")}>C {formatValue(hv.c)}</span>
          {hv.v != null && formatVolume && <span>Vol. {formatVolume(hv.v)}</span>}
        </div>
      )}
    </div>
  );
}

export const CandleChart = memo(CandleChartImpl);
