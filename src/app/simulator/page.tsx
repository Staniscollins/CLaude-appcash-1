"use client";

import { Calculator, Flag, Palmtree, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Slider } from "radix-ui";
import { useDeferredValue, useMemo, useState } from "react";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { AnimatedMoney, Money } from "@/components/ui/money";
import { InfoTip } from "@/components/ui/primitives";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { slicePeriod, summarizePeriod } from "@/lib/portfolio/metrics";
import { project, yearsToReach, type ProjectionInput } from "@/lib/projection";
import { cn } from "@/lib/utils";

function SliderField({
  label,
  info,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  info?: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1 text-muted">
          {label}
          {info && <InfoTip>{info}</InfoTip>}
        </span>
        <span className="font-semibold tabular">{format(value)}</span>
      </div>
      <Slider.Root
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="relative flex h-5 w-full touch-none items-center select-none"
        aria-label={label}
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-3">
          <Slider.Range className="absolute h-full rounded-full bg-linear-to-r from-[#6a5cf0] to-[#8b7dff]" />
        </Slider.Track>
        <Slider.Thumb className="block size-5 rounded-full bg-white shadow-[0_2px_10px_rgb(0_0_0/0.35)] ring-4 ring-accent/25 transition-transform hover:scale-110 focus-visible:ring-accent/50 focus-visible:outline-none" />
      </Slider.Root>
    </div>
  );
}

const PRESETS = [
  { id: "prudent", label: "Prudent", ret: 0.04, vol: 0.08 },
  { id: "equilibre", label: "Équilibré", ret: 0.06, vol: 0.12 },
  { id: "dynamique", label: "Dynamique", ret: 0.08, vol: 0.17 },
];

export default function SimulatorPage() {
  const { snapshot, daily, settings, hydrated } = usePortfolio();
  const base = settings.baseCurrency;
  const history = useMemo(() => summarizePeriod(slicePeriod(daily, null)), [daily]);
  // `initial: null` follows the current portfolio value until the user sets it.
  const [draft, setDraft] = useState<Omit<ProjectionInput, "initial"> & { initial: number | null }>({
    initial: null,
    monthly: 300,
    annualReturn: 0.07,
    volatility: 0.15,
    years: 20,
    inflation: 0.02,
    fees: 0.002,
    contributionGrowth: 0.02,
  });
  const portfolioValue = hydrated && snapshot.totals.value > 0 ? Math.round(snapshot.totals.value / 100) * 100 : 10_000;
  const input: ProjectionInput = useMemo(() => ({ ...draft, initial: draft.initial ?? portfolioValue }), [draft, portfolioValue]);

  const set = (patch: Partial<ProjectionInput>) => setDraft((i) => ({ ...i, ...patch }));
  // Deferred so that dragging a slider stays fluid while the Monte Carlo runs.
  const deferred = useDeferredValue(input);
  const path = useMemo(() => project(deferred), [deferred]);
  const last = path[path.length - 1];
  const gains = last.value - last.contributed;
  const rent = (last.real * 0.04) / 12;
  const milestones = [100_000, 250_000, 500_000, 1_000_000].map((m) => ({ m, y: yearsToReach(path, m) }));
  const historicReturn = history?.annualizedTwr ?? null;

  const x = path.map((p) => p.year);
  const series = [
    { id: "p90", label: "Optimiste (9 sur 10)", values: path.map((p) => p.p90), color: "var(--chart-3)", muted: true, strokeWidth: 1.25 },
    { id: "value", label: "Scénario central", values: path.map((p) => p.value), color: "var(--accent)", area: true, strokeWidth: 2.5 },
    { id: "p10", label: "Pessimiste (1 sur 10)", values: path.map((p) => p.p10), color: "var(--chart-2)", muted: true, strokeWidth: 1.25 },
    {
      id: "contrib",
      label: "Versements cumulés",
      values: path.map((p) => p.contributed),
      color: "var(--chart-muted)",
      muted: true,
      strokeWidth: 1.5,
    },
  ];

  return (
    <>
      <PageHeader
        title="Simulateur"
        description="Projetez votre patrimoine : intérêts composés, versements programmés, inflation et aléas de marché."
      />
      <Stagger className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader title="Hypothèses" icon={<Calculator className="size-4" />} />
          <div className="mb-5 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set({ annualReturn: p.ret, volatility: p.vol })}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium ring-1 transition",
                  Math.abs(input.annualReturn - p.ret) < 1e-9
                    ? "bg-accent-soft text-accent ring-accent/30"
                    : "text-muted ring-border hover:text-fg",
                )}
              >
                {p.label} {formatPercent(p.ret, { decimals: 0 })}
              </button>
            ))}
            {historicReturn != null && historicReturn > -0.5 && (
              <button
                type="button"
                onClick={() => set({ annualReturn: Math.round(Math.max(-0.05, Math.min(0.2, historicReturn)) * 1000) / 1000 })}
                className="h-8 rounded-full px-3 text-xs font-medium text-muted ring-1 ring-border hover:text-fg"
                title="Rendement annualisé (TWR) de votre portefeuille depuis la première opération"
              >
                Mon historique {formatPercent(historicReturn, { decimals: 1 })}
              </button>
            )}
          </div>
          <div className="space-y-6">
            <SliderField
              label="Capital de départ"
              value={input.initial}
              onChange={(v) => set({ initial: v })}
              min={0}
              max={Math.max(500_000, Math.ceil((portfolioValue * 1.5) / 100_000) * 100_000)}
              step={500}
              format={(v) => formatMoney(v, base, { decimals: 0 })}
            />
            <SliderField
              label="Versement mensuel"
              value={input.monthly}
              onChange={(v) => set({ monthly: v })}
              min={0}
              max={5_000}
              step={25}
              format={(v) => formatMoney(v, base, { decimals: 0 })}
            />
            <SliderField
              label="Hausse annuelle des versements"
              info="Indexation de vos versements (ex. suivre vos augmentations de salaire)."
              value={input.contributionGrowth}
              onChange={(v) => set({ contributionGrowth: v })}
              min={0}
              max={0.1}
              step={0.005}
              format={(v) => formatPercent(v, { decimals: 1 })}
            />
            <SliderField
              label="Rendement annuel espéré"
              value={input.annualReturn}
              onChange={(v) => set({ annualReturn: v })}
              min={-0.02}
              max={0.15}
              step={0.0025}
              format={(v) => formatPercent(v, { decimals: 2 })}
            />
            <SliderField
              label="Volatilité"
              info="Amplitude des variations annuelles, utilisée pour les scénarios pessimiste et optimiste (Monte-Carlo, 600 tirages)."
              value={input.volatility}
              onChange={(v) => set({ volatility: v })}
              min={0}
              max={0.4}
              step={0.01}
              format={(v) => formatPercent(v, { decimals: 0 })}
            />
            <SliderField
              label="Durée"
              value={input.years}
              onChange={(v) => set({ years: v })}
              min={1}
              max={45}
              step={1}
              format={(v) => `${v} ans`}
            />
            <SliderField
              label="Frais annuels"
              info="Frais de gestion (TER des ETF, frais de contrat…)."
              value={input.fees}
              onChange={(v) => set({ fees: v })}
              min={0}
              max={0.03}
              step={0.0005}
              format={(v) => formatPercent(v, { decimals: 2 })}
            />
            <SliderField
              label="Inflation"
              value={input.inflation}
              onChange={(v) => set({ inflation: v })}
              min={0}
              max={0.06}
              step={0.0025}
              format={(v) => formatPercent(v, { decimals: 2 })}
            />
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-8">
          <Card className="relative overflow-hidden">
            <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-70" />
            <div className="relative grid gap-6 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <div className="text-sm text-muted">Patrimoine estimé dans {input.years} ans</div>
                <div className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                  <AnimatedMoney value={last.value} currency={base} decimals={0} />
                </div>
                <div className="mt-2 text-sm text-muted">
                  soit <Money value={last.real} currency={base} decimals={0} className="font-medium text-fg" /> en euros
                  d&apos;aujourd&apos;hui
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Versements</span>
                  <Money value={last.contributed} currency={base} decimals={0} className="font-medium" />
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Intérêts composés</span>
                  <Money value={gains} currency={base} decimals={0} className="font-medium text-gain" />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${last.value > 0 ? (last.contributed / last.value) * 100 : 0}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 20 }}
                  />
                </div>
                <div className="text-[11px] text-subtle">
                  {formatPercent(last.value > 0 ? gains / last.value : 0, { decimals: 0 })} du capital final vient des intérêts
                </div>
              </div>
            </div>
            <div className="relative mt-6">
              <TimeSeriesChart
                x={x}
                series={series}
                height={300}
                animationKey="projection"
                formatValue={(v) => formatMoney(v, base, { decimals: 0 })}
                formatAxis={(v) => formatMoney(v, base, { compact: true, decimals: 0 })}
                formatX={(t) => `Année ${formatNumber(t, { decimals: 0 })}`}
                formatXTick={(t) => (t === 0 ? "Aujourd'hui" : `+${formatNumber(t, { decimals: 0 })} ans`)}
                ariaLabel="Projection du patrimoine"
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {series.map((s) => (
                  <span key={s.id} className="flex items-center gap-1.5">
                    <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} /> {s.label}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Jalons" subtitle="Scénario central" icon={<Flag className="size-4" />} />
              <ul className="space-y-3">
                {milestones.map(({ m, y }) => (
                  <li key={m} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-xl text-xs font-semibold ring-1",
                        y != null ? "bg-gain/12 text-gain ring-gain/20" : "bg-surface-2 text-subtle ring-border",
                      )}
                    >
                      {m >= 1_000_000 ? "1M" : `${m / 1000}k`}
                    </span>
                    <span className="flex-1 text-sm">{formatMoney(m, base, { decimals: 0 })}</span>
                    <span className="text-sm font-medium tabular">
                      {y == null ? (
                        <span className="text-subtle">au-delà de {input.years} ans</span>
                      ) : y === 0 ? (
                        "déjà atteint"
                      ) : (
                        `dans ${formatNumber(y, { decimals: 0 })} an${y > 1 ? "s" : ""}`
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Rente possible" subtitle="Règle des 4 % (en euros d'aujourd'hui)" icon={<Palmtree className="size-4" />} />
              <div className="text-3xl font-semibold tracking-tight">
                <AnimatedMoney value={rent} currency={base} decimals={0} />
                <span className="text-base font-normal text-muted"> / mois</span>
              </div>
              <p className="mt-2 text-sm text-muted">
                En retirant 4 % par an du capital final, un portefeuille diversifié a historiquement tenu 30 ans.
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
                <Sparkles className="size-3.5 text-accent" />
                Scénario pessimiste :{" "}
                <Money
                  value={((path[path.length - 1].p10 / Math.pow(1 + input.inflation, input.years)) * 0.04) / 12}
                  currency={base}
                  decimals={0}
                />{" "}
                / mois
              </div>
            </Card>
          </div>
          <p className="text-xs text-subtle">
            Simulation indicative : les performances passées ne préjugent pas des performances futures. Hors fiscalité.
          </p>
        </div>
      </Stagger>
    </>
  );
}
