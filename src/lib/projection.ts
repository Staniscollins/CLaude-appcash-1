export interface ProjectionInput {
  initial: number;
  monthly: number;
  /** Expected annual return (ratio). */
  annualReturn: number;
  /** Annual volatility used by the Monte Carlo bands. */
  volatility: number;
  years: number;
  inflation: number;
  /** Annual fees (ratio), deducted from the return. */
  fees: number;
  /** Yearly increase of the monthly contribution (ratio). */
  contributionGrowth: number;
}

export interface ProjectionYear {
  year: number;
  contributed: number;
  value: number;
  real: number;
  p10: number;
  p50: number;
  p90: number;
}

/** Small deterministic PRNG (mulberry32) so the bands do not flicker. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(next: () => number) {
  const u1 = Math.max(next(), 1e-12);
  const u2 = next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Deterministic compound growth plus Monte Carlo percentiles (monthly steps). */
export function project(input: ProjectionInput, simulations = 600): ProjectionYear[] {
  const months = Math.max(1, Math.round(input.years * 12));
  const net = input.annualReturn - input.fees;
  const monthlyRate = Math.pow(1 + net, 1 / 12) - 1;
  const monthlyInflation = Math.pow(1 + input.inflation, 1 / 12) - 1;
  const contribution = (m: number) => input.monthly * Math.pow(1 + input.contributionGrowth, Math.floor(m / 12));

  // Deterministic path.
  const det: { value: number; contributed: number }[] = [{ value: input.initial, contributed: input.initial }];
  let value = input.initial;
  let contributed = input.initial;
  for (let m = 0; m < months; m++) {
    value = value * (1 + monthlyRate) + contribution(m);
    contributed += contribution(m);
    if ((m + 1) % 12 === 0 || m === months - 1) det.push({ value, contributed });
  }

  // Monte Carlo on log-normal monthly returns with the same expected return.
  const sigma = input.volatility / Math.sqrt(12);
  const mu = Math.log(1 + monthlyRate) - (sigma * sigma) / 2;
  const snapshots: number[][] = det.map(() => []);
  const next = rng(0xc0ffee);
  for (let s = 0; s < simulations; s++) {
    let v = input.initial;
    snapshots[0].push(v);
    let k = 1;
    for (let m = 0; m < months; m++) {
      v = v * Math.exp(mu + sigma * gaussian(next)) + contribution(m);
      if ((m + 1) % 12 === 0 || m === months - 1) snapshots[k++].push(v);
    }
  }
  const pct = (arr: number[], p: number) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  };

  return det.map((d, i) => {
    const yearsElapsed = i === det.length - 1 ? months / 12 : i;
    return {
      year: yearsElapsed,
      contributed: d.contributed,
      value: d.value,
      real: d.value / Math.pow(1 + monthlyInflation, yearsElapsed * 12),
      p10: pct(snapshots[i], 0.1),
      p50: pct(snapshots[i], 0.5),
      p90: pct(snapshots[i], 0.9),
    };
  });
}

/** First year at which the deterministic value reaches `target` (null if never). */
export function yearsToReach(path: ProjectionYear[], target: number): number | null {
  const hit = path.find((p) => p.value >= target);
  return hit ? hit.year : null;
}
