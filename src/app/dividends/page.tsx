"use client";

import { CalendarDays, ChartColumn, Coins, HandCoins, History, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { Onboarding } from "@/components/dashboard/onboarding";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { AnimatedMoney, Money, Price } from "@/components/ui/money";
import { Badge, EmptyState, InfoTip, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { addMonths, addYears, monthKey } from "@/lib/dates";
import { capitalize, formatDate, formatMoney, formatPercent } from "@/lib/format";
import { byMonth, forecastDividends, receivedDividends } from "@/lib/portfolio/dividends";
import { cn } from "@/lib/utils";

const MONTH_LABELS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export default function DividendsPage() {
  const { snapshot, tables, settings, today, hydrated, isEmpty, quotesReady, meta } = usePortfolio();
  const [view, setView] = useState<"months" | "years">("months");
  const base = settings.baseCurrency;

  const received = useMemo(() => receivedDividends(snapshot.dividendTransactions, tables), [snapshot.dividendTransactions, tables]);
  const forecast = useMemo(() => forecastDividends(snapshot.positions, tables, today), [snapshot.positions, tables, today]);

  const yearAgo = addYears(today, -1);
  const last12 = received.filter((r) => r.date > yearAgo).reduce((s, r) => s + r.net, 0);
  const total = received.reduce((s, r) => s + r.net, 0);
  const value = snapshot.totals.securities;
  const cost = snapshot.totals.costBasis;
  const autoShare = received.length ? received.filter((r) => r.auto).length / received.length : 0;

  // Monthly bars: 24 months back + 12 months projected.
  const monthly = useMemo(() => {
    const recv = byMonth(received, (r) => r.net);
    const proj = byMonth(forecast.projected, (p) => p.amount);
    const keys: string[] = [];
    for (let i = -23; i <= 12; i++) keys.push(monthKey(addMonths(`${today.slice(0, 7)}-01`, i)));
    const current = monthKey(today);
    return keys.map((k) => {
      const past = k < current;
      const isCurrent = k === current;
      const r = recv.get(k) ?? 0;
      const p = proj.get(k) ?? 0;
      return { key: k, value: past ? r : isCurrent ? Math.max(r, r + p) : p, projected: !past && !(isCurrent && r > 0 && p === 0) };
    });
  }, [received, forecast.projected, today]);

  const yearly = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of received) map.set(Number(r.date.slice(0, 4)), (map.get(Number(r.date.slice(0, 4))) ?? 0) + r.net);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [received]);

  const calendar = useMemo(() => {
    const groups = new Map<string, typeof forecast.projected>();
    for (const p of forecast.projected) {
      if (p.date <= today) continue;
      const k = monthKey(p.date);
      const list = groups.get(k) ?? [];
      list.push(p);
      groups.set(k, list);
    }
    return [...groups.entries()].slice(0, 4);
  }, [forecast, today]);

  if (hydrated && isEmpty) return <Onboarding />;
  const loading = !hydrated || !quotesReady;

  return (
    <>
      <PageHeader title="Dividendes" description="Revenus perçus, prochains détachements et projection de vos revenus passifs." />
      <Stagger className="grid gap-4 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-4 lg:col-span-12 lg:grid-cols-5">
          <Tile label="Perçus depuis le début" loading={loading}>
            <AnimatedMoney value={total} currency={base} decimals={0} />
          </Tile>
          <Tile label="12 derniers mois" loading={loading}>
            <AnimatedMoney value={last12} currency={base} decimals={0} />
          </Tile>
          <Tile
            label="Revenu annuel prévu"
            loading={loading}
            info="Dividende annoncé (ou des 12 derniers mois) × quantité détenue, converti au taux du jour."
          >
            <span className="text-gain">
              <AnimatedMoney value={forecast.annualTotal} currency={base} decimals={0} />
            </span>
            <div className="mt-0.5 text-xs text-muted">
              soit <Money value={forecast.annualTotal / 12} currency={base} decimals={0} /> / mois
            </div>
          </Tile>
          <Tile label="Rendement actuel" loading={loading} info="Revenu annuel prévu / valeur actuelle des positions.">
            {formatPercent(value > 0 ? forecast.annualTotal / value : null)}
          </Tile>
          <Tile label="Rendement sur coût" loading={loading} info="Revenu annuel prévu / prix de revient des positions (yield on cost).">
            {formatPercent(cost > 0 ? forecast.annualTotal / cost : null)}
          </Tile>
        </div>

        <Card className="lg:col-span-8">
          <CardHeader
            title="Revenus de dividendes"
            subtitle={view === "months" ? "24 derniers mois perçus et 12 prochains estimés" : "Total net perçu par année"}
            icon={<ChartColumn className="size-4" />}
            action={
              <Segmented
                ariaLabel="Vue"
                value={view}
                onChange={setView}
                options={[
                  { value: "months", label: "Mois" },
                  { value: "years", label: "Années" },
                ]}
              />
            }
          />
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : view === "months" ? (
            <>
              <div className="mb-2 flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-gain" /> Perçus
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] border border-gain bg-gain/30" /> Estimés
                </span>
              </div>
              <BarChart
                categories={monthly.map((m) => m.key)}
                series={[
                  {
                    id: "div",
                    label: "Dividendes",
                    color: "var(--gain)",
                    values: monthly.map((m) => m.value || null),
                    projected: monthly.map((m) => m.projected),
                  },
                ]}
                height={260}
                formatValue={(v) => formatMoney(v, base)}
                formatAxis={(v) => formatMoney(v, base, { decimals: 0 })}
                formatCategory={(k) => `${MONTH_LABELS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`}
                highlightIndex={23}
                ariaLabel="Dividendes mensuels perçus et estimés"
              />
            </>
          ) : yearly.length ? (
            <BarChart
              categories={yearly.map(([y]) => String(y))}
              series={[{ id: "y", label: "Dividendes nets", color: "var(--gain)", values: yearly.map(([, v]) => v) }]}
              height={260}
              formatValue={(v) => formatMoney(v, base)}
              formatAxis={(v) => formatMoney(v, base, { decimals: 0 })}
              ariaLabel="Dividendes annuels"
            />
          ) : (
            <EmptyState icon={<Coins />} title="Aucun dividende perçu" />
          )}
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader
            title="Calendrier estimé"
            subtitle="Prochains détachements (d'après l'historique)"
            icon={<CalendarDays className="size-4" />}
          />
          {!calendar.length ? (
            <EmptyState
              icon={<CalendarDays />}
              title="Rien de prévu"
              description="Aucune de vos lignes n'a versé de dividende ces 12 derniers mois."
              className="py-8"
            />
          ) : (
            <div className="space-y-4">
              {calendar.map(([month, items], gi) => (
                <motion.div key={month} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-fg">{capitalize(formatDate(`${month}-01`, "month"))}</span>
                    <Money value={items.reduce((s, i) => s + i.amount, 0)} currency={base} className="text-gain" />
                  </div>
                  <ul className="space-y-1">
                    {items.map((p) => {
                      const m = meta(p.symbol);
                      return (
                        <li key={p.symbol + p.date}>
                          <Link
                            href={`/stock/${encodeURIComponent(p.symbol)}`}
                            className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-surface-2"
                          >
                            <AssetLogo symbol={p.symbol} name={m.name} logoUrl={m.logoUrl} type={m.type} size={22} />
                            <span className="min-w-0 flex-1 truncate">{m.name}</span>
                            <span className="text-xs text-subtle">{formatDate(p.date, "short")}</span>
                            <Money value={p.amount} currency={base} className="w-20 text-right text-xs tabular" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Par position"
            subtitle="Dividende annuel, rendement et revenu estimé"
            icon={<HandCoins className="size-4" />}
          />
          {!forecast.items.length ? (
            <EmptyState
              icon={<HandCoins />}
              title="Aucune ligne distribuant un dividende"
              description="Les ETF capitalisants réinvestissent leurs dividendes : ils n'en versent pas."
            />
          ) : (
            <div className="-mx-2 overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[640px] text-sm tabular">
                <thead>
                  <tr className="text-xs text-subtle">
                    <th className="px-2 pb-2 text-left font-medium">Actif</th>
                    <th className="px-2 pb-2 text-right font-medium">Dividende / action</th>
                    <th className="px-2 pb-2 text-right font-medium">Rendement</th>
                    <th className="px-2 pb-2 text-right font-medium">Sur coût</th>
                    <th className="px-2 pb-2 text-right font-medium">Versements / an</th>
                    <th className="px-2 pb-2 text-right font-medium">Revenu annuel</th>
                    <th className="px-2 pb-2 text-right font-medium">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.items.map((it) => {
                    const m = meta(it.symbol);
                    const pos = snapshot.positions.find((p) => p.symbol === it.symbol);
                    return (
                      <tr key={it.symbol} className="border-t border-border">
                        <td className="px-2 py-2.5">
                          <Link href={`/stock/${encodeURIComponent(it.symbol)}`} className="flex items-center gap-3 hover:text-accent">
                            <AssetLogo symbol={it.symbol} name={m.name} logoUrl={m.logoUrl} type={m.type} size={28} />
                            <span className="max-w-[220px] truncate font-medium">{m.name}</span>
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <Price value={it.perShare} currency={pos?.currency} />
                        </td>
                        <td className="px-2 py-2.5 text-right">{formatPercent(it.yield)}</td>
                        <td className={cn("px-2 py-2.5 text-right", it.yieldOnCost > it.yield ? "text-gain" : "")}>
                          {formatPercent(it.yieldOnCost)}
                        </td>
                        <td className="px-2 py-2.5 text-right text-muted">{it.paymentsPerYear}</td>
                        <td className="px-2 py-2.5 text-right font-medium">
                          <Money value={it.annualIncome} currency={base} />
                        </td>
                        <td className="px-2 py-2.5 text-right text-muted">
                          {formatPercent(forecast.annualTotal ? it.annualIncome / forecast.annualTotal : null, { decimals: 1 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Historique des versements"
            subtitle={
              autoShare > 0 ? "Les montants « Auto » sont estimés (bruts) à partir des données de marché" : "Dividendes enregistrés"
            }
            icon={<History className="size-4" />}
          />
          {!received.length ? (
            <EmptyState
              icon={<Coins />}
              title="Aucun dividende"
              description="Les dividendes de vos lignes apparaîtront ici automatiquement."
            />
          ) : (
            <ul className="grid gap-x-8 md:grid-cols-2">
              {received.slice(0, 24).map((r, i) => {
                const m = r.symbol ? meta(r.symbol) : null;
                return (
                  <li key={`${r.symbol}-${r.date}-${i}`} className="flex items-center gap-3 border-t border-border py-2.5">
                    {m ? (
                      <AssetLogo symbol={m.symbol} name={m.name} logoUrl={m.logoUrl} type={m.type} size={28} />
                    ) : (
                      <Coins className="size-5 text-gain" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm font-medium">
                        {m?.name ?? "Dividende"}
                        {r.auto && (
                          <Badge tone="accent">
                            <Sparkles className="size-3" /> Auto
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-subtle">{formatDate(r.date, "medium")}</div>
                    </div>
                    <Money value={r.net} currency={base} className="text-sm font-semibold text-gain" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </Stagger>
    </>
  );
}

function Tile({ label, info, loading, children }: { label: string; info?: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-1 text-[13px] text-muted">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{loading ? <Skeleton className="h-7 w-24" /> : children}</div>
    </Card>
  );
}
