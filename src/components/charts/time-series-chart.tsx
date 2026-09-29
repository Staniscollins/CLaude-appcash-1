"use client";

import { scaleLinear } from "d3-scale";
import { area as d3area, curveMonotoneX, line as d3line } from "d3-shape";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import { easeInOutCubic, easeOutCubic, evenXs, niceTicks, paddedDomain, resample, tickIndices, type Pt } from "./chart-utils";
import { useMeasure } from "./use-measure";

export interface ChartSeries {
  id: string;
  label: string;
  values: (number | null)[];
  /** CSS colour expression, e.g. "var(--gain)". */
  color: string;
  area?: boolean;
  /** Fill down to the zero line instead of the bottom of the plot. */
  areaToZero?: boolean;
  strokeWidth?: number;
  /** Context series: thinner and more transparent. */
  muted?: boolean;
}

export interface ChartMarker {
  index: number;
  kind: "buy" | "sell" | "dividend";
  label: string;
}

interface Props {
  x: number[];
  series: ChartSeries[];
  height?: number;
  formatValue: (v: number) => string;
  formatAxis?: (v: number) => string;
  formatX: (t: number, index: number) => string;
  formatXTick?: (t: number, index: number) => string;
  baseline?: { value: number; label?: string } | null;
  zeroLine?: boolean;
  onHover?: (index: number | null) => void;
  markers?: ChartMarker[];
  /** Changing it morphs the lines to the new data. */
  animationKey?: string;
  ariaLabel: string;
  showYAxis?: boolean;
  showXAxis?: boolean;
  xTicks?: number;
  tooltip?: boolean;
  /** Pulsing dot on the last point of the first series. */
  liveDot?: boolean;
  className?: string;
}

const MORPH_POINTS = 180;
const MARKER_COLORS = { buy: "var(--gain)", sell: "var(--loss)", dividend: "var(--accent)" } as const;

function TimeSeriesChartImpl({
  x,
  series,
  height = 280,
  formatValue,
  formatAxis,
  formatX,
  formatXTick,
  baseline,
  zeroLine,
  onHover,
  markers,
  animationKey,
  ariaLabel,
  showYAxis = true,
  showXAxis = true,
  xTicks = 5,
  tooltip = true,
  liveDot = false,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, { width }] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = x.length;

  const margin = { top: 14, right: showYAxis ? 58 : 6, bottom: showXAxis ? 26 : 6, left: 2 };
  const plotW = Math.max(0, width - margin.left - margin.right);
  const plotH = Math.max(0, height - margin.top - margin.bottom);

  const domain = useMemo(() => {
    const vals: number[] = [];
    for (const s of series) for (const v of s.values) if (v != null && Number.isFinite(v)) vals.push(v);
    const include: number[] = [];
    if (baseline && Number.isFinite(baseline.value)) include.push(baseline.value);
    if (zeroLine || series.some((s) => s.areaToZero)) include.push(0);
    return paddedDomain(vals, 0.1, include);
  }, [series, baseline, zeroLine]);

  const xScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, Math.max(1, n - 1)])
        .range([margin.left, margin.left + plotW]),
    [n, plotW, margin.left],
  );
  const yScale = useMemo(
    () =>
      scaleLinear()
        .domain(domain)
        .range([margin.top + plotH, margin.top]),
    [domain, plotH, margin.top],
  );

  // Full-resolution pixel points per series.
  const pixelSeries = useMemo(
    () =>
      series.map((s) => {
        const pts: Pt[] = [];
        s.values.forEach((v, i) => {
          if (v != null && Number.isFinite(v)) pts.push([xScale(i), yScale(v)]);
        });
        return { ...s, pts };
      }),
    [series, xScale, yScale],
  );

  const lineGen = useMemo(
    () =>
      d3line<Pt>()
        .x((p) => p[0])
        .y((p) => p[1])
        .curve(curveMonotoneX),
    [],
  );
  const zeroY = yScale(Math.max(domain[0], Math.min(domain[1], 0)));
  const bottomY = margin.top + plotH;

  // ——— entrance / morph animation ———
  const prevPts = useRef(new Map<string, Pt[]>());
  const [anim, setAnim] = useState<{ from: Map<string, Pt[]>; to: Map<string, Pt[]>; t: number; kind: "morph" | "reveal" } | null>(null);
  const signature = `${animationKey ?? ""}|${n}|${series.map((s) => s.id).join(",")}`;
  const lastSignature = useRef<string | null>(null);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useLayoutEffect(() => {
    if (!plotW || !n) return;
    if (lastSignature.current === signature) {
      for (const s of pixelSeries) prevPts.current.set(s.id, s.pts);
      return;
    }
    const first = lastSignature.current === null;
    lastSignature.current = signature;
    if (reduceMotion.current) {
      for (const s of pixelSeries) prevPts.current.set(s.id, s.pts);
      return;
    }
    const xs = evenXs(margin.left, margin.left + plotW, MORPH_POINTS);
    const from = new Map<string, Pt[]>();
    const to = new Map<string, Pt[]>();
    for (const s of pixelSeries) {
      if (!s.pts.length) continue;
      const target = resample(s.pts, xs);
      to.set(s.id, target);
      const prev = prevPts.current.get(s.id);
      from.set(s.id, prev?.length ? resample(prev, xs) : target.map(([px]) => [px, bottomY - plotH * 0.08] as Pt));
    }
    for (const s of pixelSeries) prevPts.current.set(s.id, s.pts);
    const kind = first ? "reveal" : "morph";
    const duration = kind === "reveal" ? 1000 : 620;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      setAnim(t >= 1 ? null : { from, to, t, kind });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setAnim({ from, to, t: 0, kind });
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, plotW > 0]);

  const paths = useMemo(() => {
    return pixelSeries.map((s) => {
      let pts = s.pts;
      let smooth = true;
      if (anim && anim.kind === "morph" && anim.from.has(s.id) && anim.to.has(s.id)) {
        const e = easeInOutCubic(anim.t);
        const a = anim.from.get(s.id) as Pt[];
        const b = anim.to.get(s.id) as Pt[];
        pts = b.map((p, i) => [p[0], a[i][1] + (p[1] - a[i][1]) * e]);
        smooth = true;
      }
      const d = pts.length > 1 ? ((smooth ? lineGen(pts) : null) ?? "") : "";
      let areaD = "";
      if (s.area && pts.length > 1) {
        const base = s.areaToZero ? zeroY : bottomY;
        areaD =
          d3area<Pt>()
            .x((p) => p[0])
            .y0(base)
            .y1((p) => p[1])
            .curve(curveMonotoneX)(pts) ?? "";
      }
      return { id: s.id, d, areaD, s };
    });
  }, [pixelSeries, anim, lineGen, zeroY, bottomY]);

  const revealWidth = anim?.kind === "reveal" ? plotW * easeOutCubic(anim.t) : plotW;

  // ——— hover ———
  const setHoverIndex = useCallback(
    (i: number | null) => {
      setHover(i);
      onHover?.(i);
    },
    [onHover],
  );

  const handleMove = (e: PointerEvent<SVGRectElement>) => {
    if (!n) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left + margin.left;
    const i = Math.round(xScale.invert(px));
    setHoverIndex(Math.max(0, Math.min(n - 1, i)));
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    const step = e.shiftKey ? Math.max(1, Math.round(n / 20)) : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const cur = hover ?? n - 1;
      setHoverIndex(Math.max(0, Math.min(n - 1, cur + (e.key === "ArrowRight" ? step : -step))));
    } else if (e.key === "Home") setHoverIndex(0);
    else if (e.key === "End") setHoverIndex(n - 1);
    else if (e.key === "Escape") setHoverIndex(null);
  };

  const yTicks = useMemo(() => niceTicks(domain, height < 200 ? 3 : 4).filter((t) => t >= domain[0] && t <= domain[1]), [domain, height]);
  const xTickIdx = useMemo(() => tickIndices(n, width < 420 ? Math.min(3, xTicks) : xTicks), [n, width, xTicks]);
  const hx = hover != null ? xScale(hover) : null;
  const main = pixelSeries[0];
  const lastPt = main?.pts[main.pts.length - 1];
  const markerByIndex = useMemo(() => {
    const m = new Map<number, ChartMarker[]>();
    for (const mk of markers ?? []) {
      const list = m.get(mk.index) ?? [];
      list.push(mk);
      m.set(mk.index, list);
    }
    return m;
  }, [markers]);

  const tooltipLeft = hx != null ? Math.max(8, Math.min(width - 188, hx - 90)) : 0;

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full select-none outline-none", className)}
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={handleKey}
      onBlur={() => setHoverIndex(null)}
    >
      {width > 0 && n > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            <clipPath id={`reveal-${uid}`}>
              <rect x={margin.left - 2} y={0} width={revealWidth + 4} height={height} />
            </clipPath>
            {hx != null && (
              <clipPath id={`past-${uid}`}>
                <rect x={0} y={0} width={hx + 0.5} height={height} />
              </clipPath>
            )}
            {paths.map(({ id, s }) =>
              s.area ? (
                <linearGradient key={id} id={`grad-${uid}-${id}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" style={{ stopColor: s.color, stopOpacity: s.areaToZero ? 0.08 : 0.22 }} />
                  <stop offset="100%" style={{ stopColor: s.color, stopOpacity: s.areaToZero ? 0.28 : 0 }} />
                </linearGradient>
              ) : null,
            )}
          </defs>

          {/* grid */}
          {showYAxis &&
            yTicks.map((t) => (
              <g key={t}>
                <line
                  x1={margin.left}
                  x2={margin.left + plotW}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  style={{ stroke: "var(--grid)" }}
                  strokeWidth={1}
                />
                <text
                  x={margin.left + plotW + 8}
                  y={yScale(t)}
                  dy="0.32em"
                  className="tabular"
                  style={{ fill: "var(--fg-subtle)", fontSize: 11 }}
                >
                  {(formatAxis ?? formatValue)(t)}
                </text>
              </g>
            ))}
          {zeroLine && domain[0] < 0 && domain[1] > 0 && (
            <line x1={margin.left} x2={margin.left + plotW} y1={zeroY} y2={zeroY} style={{ stroke: "var(--axis)" }} strokeWidth={1} />
          )}
          {baseline && Number.isFinite(baseline.value) && (
            <g>
              <line
                x1={margin.left}
                x2={margin.left + plotW}
                y1={yScale(baseline.value)}
                y2={yScale(baseline.value)}
                style={{ stroke: "var(--fg-subtle)" }}
                strokeOpacity={0.45}
                strokeWidth={1}
              />
            </g>
          )}

          <g clipPath={`url(#reveal-${uid})`}>
            {paths.map(({ id, d, areaD, s }) => (
              <g key={id}>
                {areaD && (
                  <path
                    d={areaD}
                    style={{ fill: `url(#grad-${uid}-${id})`, opacity: hx != null ? 0.55 : 1, transition: "opacity 200ms" }}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  style={{
                    stroke: s.color,
                    opacity: hx != null ? (s.muted ? 0.3 : 0.32) : s.muted ? 0.75 : 1,
                    transition: "opacity 200ms",
                  }}
                  strokeWidth={s.strokeWidth ?? (s.muted ? 1.5 : 2)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {hx != null && (
                  <path
                    d={d}
                    fill="none"
                    clipPath={`url(#past-${uid})`}
                    style={{ stroke: s.color, opacity: s.muted ? 0.8 : 1 }}
                    strokeWidth={s.strokeWidth ?? (s.muted ? 1.5 : 2)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </g>
            ))}
          </g>

          {/* baseline label above the curves */}
          {baseline?.label && Number.isFinite(baseline.value) && (
            <text
              x={margin.left + 4}
              y={yScale(baseline.value) - 6}
              // A halo in the card colour keeps the label readable where the curve crosses it.
              style={{ fill: "var(--fg-muted)", fontSize: 10.5, stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" }}
              strokeLinejoin="round"
            >
              {baseline.label}
            </text>
          )}

          {/* transaction markers */}
          {main &&
            !anim &&
            (markers ?? []).map((mk, i) => {
              const v = main.values[mk.index];
              if (v == null) return null;
              return (
                <circle
                  key={`${mk.index}-${i}`}
                  cx={xScale(mk.index)}
                  cy={yScale(v)}
                  r={3.5}
                  style={{ fill: MARKER_COLORS[mk.kind], stroke: "var(--surface)" }}
                  strokeWidth={2}
                />
              );
            })}

          {/* live end dot */}
          {liveDot && hx == null && lastPt && !anim && (
            <g>
              <circle
                cx={lastPt[0]}
                cy={lastPt[1]}
                r={9}
                className="origin-center animate-pulse-soft"
                style={{ fill: main.color, opacity: 0.22, transformBox: "fill-box" }}
              />
              <circle cx={lastPt[0]} cy={lastPt[1]} r={4} style={{ fill: main.color, stroke: "var(--surface)" }} strokeWidth={2} />
            </g>
          )}

          {/* crosshair */}
          {hx != null && hover != null && (
            <g pointerEvents="none">
              <line
                x1={hx}
                x2={hx}
                y1={margin.top - 6}
                y2={bottomY}
                style={{ stroke: "var(--fg-muted)" }}
                strokeOpacity={0.5}
                strokeWidth={1}
              />
              {pixelSeries.map((s) => {
                const v = s.values[hover];
                if (v == null) return null;
                const cy = yScale(v);
                return (
                  <g key={s.id}>
                    {!s.muted && <circle cx={hx} cy={cy} r={10} style={{ fill: s.color, opacity: 0.18 }} />}
                    <circle cx={hx} cy={cy} r={4.5} style={{ fill: s.color, stroke: "var(--surface)" }} strokeWidth={2} />
                  </g>
                );
              })}
            </g>
          )}

          {/* x axis */}
          {showXAxis &&
            xTickIdx.map((i, k) => (
              <text
                key={i}
                x={xScale(i)}
                y={height - 6}
                textAnchor={k === 0 ? "start" : k === xTickIdx.length - 1 ? "end" : "middle"}
                style={{ fill: "var(--fg-subtle)", fontSize: 11 }}
              >
                {(formatXTick ?? formatX)(x[i], i)}
              </text>
            ))}

          <rect
            x={margin.left}
            y={0}
            width={plotW}
            height={height}
            fill="transparent"
            style={{ touchAction: "pan-y" }}
            onPointerMove={handleMove}
            onPointerDown={handleMove}
            onPointerLeave={() => setHoverIndex(null)}
          />
        </svg>
      )}

      {tooltip && hover != null && hx != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-44 rounded-xl bg-surface-3/95 px-3 py-2 text-xs shadow-[var(--shadow-pop)] backdrop-blur-md"
          style={{ left: tooltipLeft, transform: "translateY(-4px)" }}
        >
          <div className="mb-1 text-[11px] text-muted">{formatX(x[hover], hover)}</div>
          {series.map((s) => {
            const v = s.values[hover];
            if (v == null) return null;
            return (
              <div key={s.id} className="flex items-center gap-2 py-0.5">
                <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="font-semibold text-fg tabular">{formatValue(v)}</span>
                <span className="ml-auto truncate text-muted">{s.label}</span>
              </div>
            );
          })}
          {(markerByIndex.get(hover) ?? []).map((mk, i) => (
            <div key={i} className="mt-1 flex items-center gap-1.5 border-t border-border pt-1 text-[11px] text-muted">
              <span className="size-2 rounded-full" style={{ background: MARKER_COLORS[mk.kind] }} />
              {mk.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const TimeSeriesChart = memo(TimeSeriesChartImpl);
