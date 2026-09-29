"use client";

import { Archive, LayoutGrid, Plus, Rows3, Search, SquareDashed, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { Treemap } from "@/components/charts/treemap";
import { AllocationCard } from "@/components/dashboard/allocation-card";
import { Onboarding } from "@/components/dashboard/onboarding";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { ClosedPositions, PositionsTable } from "@/components/portfolio/positions-table";
import { PageHeader } from "@/components/shell/app-shell";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { DeltaMoney, DeltaPercent, trendClass } from "@/components/ui/delta";
import { AnimatedMoney, Money } from "@/components/ui/money";
import { EmptyState, InfoTip, Input, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useCharts } from "@/hooks/use-market";
import { formatNumber, formatPercent, parentCurrency } from "@/lib/format";
import { assetTypeLabel } from "@/lib/market/catalog";
import type { AssetType } from "@/lib/market/types";
import { diversification } from "@/lib/portfolio/allocation";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

type View = "table" | "cards" | "heatmap";

export default function PortfolioPage() {
  const { snapshot, settings, accounts, hydrated, quotesReady, isEmpty } = usePortfolio();
  const openTransaction = useUiStore((s) => s.openTransaction);
  const router = useRouter();
  const [view, setView] = useState<View>("table");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | AssetType>("all");
  const [heatMode, setHeatMode] = useState<"day" | "total">("day");
  const base = settings.baseCurrency;
  const t = snapshot.totals;

  const types = useMemo(() => [...new Set(snapshot.positions.map((p) => p.type))], [snapshot.positions]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.positions.filter(
      (p) => (type === "all" || p.type === type) && (!q || `${p.symbol} ${p.name}`.toLowerCase().includes(q)),
    );
  }, [snapshot.positions, query, type]);
  const div = useMemo(() => diversification(snapshot.positions), [snapshot.positions]);
  const usdShare = useMemo(() => {
    const total = snapshot.positions.reduce((s, p) => s + p.value, 0);
    const foreign = snapshot.positions.filter((p) => parentCurrency(p.currency) !== base).reduce((s, p) => s + p.value, 0);
    return total > 0 ? foreign / total : 0;
  }, [snapshot.positions, base]);
  const top3 = snapshot.positions.slice(0, 3).reduce((s, p) => s + p.weight, 0);

  if (hydrated && isEmpty) return <Onboarding />;
  const loading = !hydrated || !quotesReady;

  return (
    <>
      <PageHeader
        title="Portefeuille"
        description={
          loading ? "Chargement des cours…" : `${snapshot.positions.length} positions ouvertes · ${snapshot.closed.length} soldées`
        }
        actions={
          <>
            <Segmented
              ariaLabel="Affichage"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "table",
                  label: (
                    <>
                      <Rows3 className="size-3.5" /> Tableau
                    </>
                  ),
                },
                {
                  value: "cards",
                  label: (
                    <>
                      <LayoutGrid className="size-3.5" /> Cartes
                    </>
                  ),
                },
                {
                  value: "heatmap",
                  label: (
                    <>
                      <SquareDashed className="size-3.5" /> Carte thermique
                    </>
                  ),
                },
              ]}
            />
            <Button variant="primary" onClick={() => openTransaction()}>
              <Plus /> Ajouter
            </Button>
          </>
        }
      />

      <Stagger className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryTile label="Valeur des positions" loading={loading}>
            <AnimatedMoney value={t.securities} currency={base} decimals={0} />
            <div className="mt-1 text-xs text-muted">
              {t.cash !== 0 ? (
                <>
                  + <Money value={t.cash} currency={base} decimals={0} /> de liquidités
                </>
              ) : (
                <>
                  prix de revient <Money value={t.costBasis} currency={base} decimals={0} />
                </>
              )}
            </div>
          </SummaryTile>
          <SummaryTile label="Plus-values latentes" loading={loading}>
            <span className={trendClass(t.unrealized)}>
              <AnimatedMoney value={t.unrealized} currency={base} sign decimals={0} />
            </span>
            <div className="mt-1 text-xs">
              <DeltaPercent value={t.unrealizedPct} />
            </div>
          </SummaryTile>
          <SummaryTile label="Variation du jour" loading={loading}>
            <span className={trendClass(t.dayChange)}>
              <AnimatedMoney value={t.dayChange} currency={base} sign decimals={0} />
            </span>
            <div className="mt-1 text-xs">
              <DeltaPercent value={t.dayChangePct} />
            </div>
          </SummaryTile>
          <SummaryTile
            label="Diversification"
            loading={loading}
            info="Score basé sur l'indice de Herfindahl de vos lignes : un ETF compte comme ~50 lignes, une action comme une seule. 100 = très diversifié."
          >
            <span>{div.score}/100</span>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full rounded-full"
                style={{ background: div.score >= 70 ? "var(--gain)" : div.score >= 40 ? "var(--warning)" : "var(--loss)" }}
                initial={{ width: 0 }}
                animate={{ width: `${div.score}%` }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              />
            </div>
          </SummaryTile>
        </div>

        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrer les positions…" className="h-9 pl-9" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", ...types] as ("all" | AssetType)[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium ring-1 transition",
                    type === k ? "bg-accent-soft text-accent ring-accent/30" : "text-muted ring-border hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {k === "all" ? "Tout" : assetTypeLabel(k)}
                </button>
              ))}
            </div>
            {view === "heatmap" && (
              <Segmented
                className="sm:ml-auto"
                ariaLabel="Couleur"
                value={heatMode}
                onChange={setHeatMode}
                options={[
                  { value: "day", label: "Variation du jour" },
                  { value: "total", label: "+/- latente" },
                ]}
              />
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !filtered.length ? (
            <EmptyState icon={<Wallet />} title="Aucune position" description="Aucune ligne ne correspond à ce filtre." />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                {view === "table" && <PositionsTable positions={filtered} currency={base} accounts={accounts} />}
                {view === "cards" && <PositionCards positions={filtered} currency={base} />}
                {view === "heatmap" && (
                  <Treemap
                    height={460}
                    scale={heatMode === "day" ? 0.03 : 0.5}
                    items={filtered.map((p) => ({
                      key: p.symbol,
                      label: p.symbol.replace(/\.(PA|AS|DE|MI|MC|L|SW|CO)$/, ""),
                      sublabel: p.name,
                      value: p.value,
                      change: heatMode === "day" ? p.changePercent : p.unrealizedPct,
                      detail: `${formatPercent(p.weight, { decimals: 1 })} du portefeuille`,
                    }))}
                    onSelect={(s) => router.push(`/stock/${encodeURIComponent(s)}`)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <AllocationCard dimensions={["sector", "region", "currency"]} className="lg:col-span-2" />
          <Card>
            <CardHeader title="Points d'attention" subtitle="Lecture rapide de votre exposition" />
            <ul className="space-y-4 text-sm">
              <Insight label="Poids des 3 premières lignes" value={formatPercent(top3, { decimals: 1 })} tone={top3 > 0.6 ? "warn" : "ok"}>
                {top3 > 0.6 ? "Portefeuille concentré : une baisse de ces titres pèserait fortement." : "Concentration raisonnable."}
              </Insight>
              <Insight
                label="Exposition hors devise de référence"
                value={formatPercent(usdShare, { decimals: 1 })}
                tone={usdShare > 0.5 ? "warn" : "ok"}
              >
                Part de vos positions cotées dans une autre devise que l&apos;{base} (risque de change).
              </Insight>
              <Insight
                label="Nombre effectif de lignes"
                value={formatNumber(div.effectiveCount, { decimals: 1 })}
                tone={div.effectiveCount < 8 ? "warn" : "ok"}
              >
                Équivalent en lignes de même poids, ETF décomposés.
              </Insight>
              <Insight label="Frais de courtage payés" value={<Money value={t.tradeFees} currency={base} />} tone="ok">
                Cumul des frais de transaction saisis.
              </Insight>
            </ul>
          </Card>
        </div>

        {snapshot.closed.length > 0 && (
          <Card>
            <CardHeader
              title="Positions soldées"
              subtitle="Plus-values réalisées sur les lignes entièrement vendues"
              icon={<Archive className="size-4" />}
              action={<DeltaMoney value={snapshot.closed.reduce((s, p) => s + p.realized, 0)} currency={base} />}
            />
            <ClosedPositions positions={snapshot.closed} currency={base} />
          </Card>
        )}
      </Stagger>
    </>
  );
}

function SummaryTile({ label, info, loading, children }: { label: string; info?: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-1 text-[13px] text-muted">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{loading ? <Skeleton className="h-7 w-28" /> : children}</div>
    </Card>
  );
}

function Insight({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: React.ReactNode;
  tone: "ok" | "warn";
  children: React.ReactNode;
}) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-muted">
          <span className={cn("size-1.5 rounded-full", tone === "warn" ? "bg-warning" : "bg-gain")} />
          {label}
        </span>
        <span className="font-semibold tabular">{value}</span>
      </div>
      <p className="mt-1 pl-3.5 text-xs text-subtle">{children}</p>
    </li>
  );
}

function PositionCards({ positions, currency }: { positions: ReturnType<typeof usePortfolio>["snapshot"]["positions"]; currency: string }) {
  const charts = useCharts(
    positions.map((p) => p.symbol),
    "1mo",
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {positions.map((p, i) => (
        <motion.div
          key={p.symbol}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.03, 0.4) }}
        >
          <Link
            href={`/stock/${encodeURIComponent(p.symbol)}`}
            className="group block rounded-2xl bg-surface-2/50 p-4 ring-1 ring-border transition hover:-translate-y-0.5 hover:bg-surface-2 hover:ring-border-strong"
          >
            <div className="flex items-center gap-3">
              <AssetLogo symbol={p.symbol} name={p.name} logoUrl={p.meta.logoUrl} type={p.type} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium group-hover:text-accent">{p.name}</div>
                <div className="text-xs text-subtle">
                  {p.symbol} · {formatPercent(p.weight, { decimals: 1 })}
                </div>
              </div>
              <DeltaPercent value={p.changePercent} className="text-sm" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold tracking-tight">
                  <Money value={p.value} currency={currency} />
                </div>
                <DeltaMoney value={p.unrealized} currency={currency} className="text-xs" />{" "}
                <span className={cn("text-xs", trendClass(p.unrealizedPct))}>({formatPercent(p.unrealizedPct, { sign: true })})</span>
              </div>
              <Sparkline values={charts.data[p.symbol]?.c ?? []} width={110} height={40} />
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
