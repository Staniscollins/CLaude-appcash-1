import { scaleLinear } from "d3-scale";

export type Pt = [number, number];

/** Linear interpolation of a polyline (sorted by x) at the given x positions. */
export function resample(points: Pt[], xs: number[]): Pt[] {
  if (!points.length) return xs.map((x) => [x, 0]);
  const out: Pt[] = [];
  let j = 0;
  for (const x of xs) {
    while (j < points.length - 2 && points[j + 1][0] < x) j++;
    const a = points[j];
    const b = points[Math.min(j + 1, points.length - 1)];
    if (x <= a[0] || a[0] === b[0]) out.push([x, a[1]]);
    else if (x >= b[0]) out.push([x, b[1]]);
    else out.push([x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]);
  }
  return out;
}

export function evenXs(x0: number, x1: number, n: number): number[] {
  if (n <= 1) return [x0];
  const step = (x1 - x0) / (n - 1);
  return Array.from({ length: n }, (_, i) => x0 + i * step);
}

/** y-domain covering every value, padded so lines never touch the edges. */
export function paddedDomain(values: number[], pad = 0.08, include?: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  for (const v of include ?? []) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.02 || 1;
    return [min - d, max + d];
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

export function niceTicks(domain: [number, number], count = 4): number[] {
  return scaleLinear().domain(domain).nice(count).ticks(count);
}

/** Indices at which to place x-axis labels. */
export function tickIndices(n: number, count: number): number[] {
  if (n <= 1) return [0];
  const k = Math.max(2, Math.min(count, n));
  const out = new Set<number>();
  for (let i = 0; i < k; i++) out.add(Math.round((i * (n - 1)) / (k - 1)));
  return [...out];
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
