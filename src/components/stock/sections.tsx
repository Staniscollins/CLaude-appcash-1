"use client";

import { Building, ExternalLink, Globe, Landmark, Megaphone, Users } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { RangeBar, TargetBar } from "@/components/charts/range-bar";
import { Card, CardHeader } from "@/components/ui/card";
import { DeltaMoney, DeltaPercent } from "@/components/ui/delta";
import { Money, Price } from "@/components/ui/money";
import { Badge, EmptyState, InfoTip, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useFinancials } from "@/hooks/use-market";
import { formatCompact, formatDate, formatMoney, formatNumber, formatPercent, formatPrice, formatQuantity } from "@/lib/format";
import { countryLabel, sectorLabel } from "@/lib/market/catalog";
import type { AssetSummary, FinancialStatements, Quote, StatementPeriod } from "@/lib/market/types";
import type { Position } from "@/lib/portfolio/engine";
import { TRANSACTION_LABELS, type Transaction } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";

// ——— key statistics ———

function StatItem({ label, value, info }: { label: string; value: ReactNode; info?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm last:border-0">
      <span className="flex items-center gap-1 text-muted">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </span>
      <span className="text-right font-medium tabular">{value ?? "—"}</span>
    </div>
  );
}

const ratio = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : formatNumber(v, { decimals: d }));

export function KeyStats({ quote, summary }: { quote?: Quote; summary?: AssetSummary }) {
  const s = summary?.stats ?? {};
  const ccy = quote?.currency;
  const fin = s.financialCurrency ?? ccy;
  const isEquity = (quote?.type ?? summary?.type) === "EQUITY";
  const groups: { title: string; items: { label: string; value: ReactNode; info?: string }[] }[] = [
    {
      title: "Séance",
      items: [
        { label: "Ouverture", value: formatPrice(quote?.open, ccy) },
        { label: "Clôture précédente", value: formatPrice(quote?.previousClose, ccy) },
        { label: "Volume", value: quote?.volume ? formatCompact(quote.volume) : "—" },
        {
          label: "Volume moyen (3 mois)",
          value: quote?.avgVolume ? formatCompact(quote.avgVolume) : s.averageVolume ? formatCompact(s.averageVolume) : "—",
        },
        { label: "Moyenne mobile 50 j", value: formatPrice(quote?.fiftyDayAverage, ccy) },
        { label: "Moyenne mobile 200 j", value: formatPrice(quote?.twoHundredDayAverage, ccy) },
      ],
    },
    {
      title: "Valorisation",
      items: [
        {
          label: "Capitalisation",
          value:
            (s.marketCap ?? quote?.marketCap) ? formatMoney(s.marketCap ?? quote?.marketCap ?? null, fin ?? "USD", { compact: true }) : "—",
        },
        { label: "Valeur d'entreprise", value: s.enterpriseValue ? formatMoney(s.enterpriseValue, fin ?? "USD", { compact: true }) : "—" },
        { label: "PER (12 mois)", value: ratio(s.pe ?? quote?.pe, 1), info: "Cours / bénéfice par action des 12 derniers mois." },
        { label: "PER prévisionnel", value: ratio(s.forwardPe ?? quote?.forwardPe, 1) },
        {
          label: "PEG",
          value: ratio(s.peg),
          info: "PER rapporté à la croissance attendue des bénéfices. Autour de 1 : valorisation cohérente avec la croissance.",
        },
        { label: "Cours / valeur comptable", value: ratio(s.priceToBook ?? quote?.priceToBook) },
        { label: "Cours / ventes", value: ratio(s.priceToSales) },
        { label: "VE / EBITDA", value: ratio(s.evToEbitda, 1) },
      ],
    },
    {
      title: "Rentabilité & santé",
      items: [
        { label: "Marge brute", value: formatPercent(s.grossMargin ?? null, { decimals: 1 }) },
        { label: "Marge opérationnelle", value: formatPercent(s.operatingMargin ?? null, { decimals: 1 }) },
        { label: "Marge nette", value: formatPercent(s.profitMargin ?? null, { decimals: 1 }) },
        { label: "ROE", value: formatPercent(s.returnOnEquity ?? null, { decimals: 1 }), info: "Rentabilité des capitaux propres." },
        { label: "Croissance du CA", value: formatPercent(s.revenueGrowth ?? null, { decimals: 1, sign: true }) },
        { label: "Dette / capitaux propres", value: s.debtToEquity != null ? formatNumber(s.debtToEquity / 100, { decimals: 2 }) : "—" },
        { label: "Liquidité générale", value: ratio(s.currentRatio) },
        { label: "Free cash-flow", value: s.freeCashflow ? formatMoney(s.freeCashflow, fin ?? "USD", { compact: true }) : "—" },
      ],
    },
    {
      title: "Dividende & risque",
      items: [
        { label: "Dividende annuel", value: formatPrice(s.dividendRate ?? quote?.dividendRate, ccy) },
        { label: "Rendement", value: formatPercent(s.dividendYield ?? quote?.dividendYield ?? null) },
        { label: "Taux de distribution", value: formatPercent(s.payoutRatio ?? null, { decimals: 1 }) },
        { label: "Rendement moyen 5 ans", value: formatPercent(s.fiveYearAvgDividendYield ?? null) },
        { label: "Détachement", value: s.exDividendDate ? formatDate(s.exDividendDate, "medium") : "—" },
        {
          label: "Bêta",
          value: ratio(s.beta ?? quote?.beta),
          info: "Sensibilité au marché : 1,2 = varie en moyenne 20 % de plus que l'indice.",
        },
        { label: "Détention institutionnelle", value: formatPercent(s.heldByInstitutions ?? null, { decimals: 1 }) },
        { label: "Vente à découvert (flottant)", value: formatPercent(s.shortPercentOfFloat ?? null, { decimals: 1 }) },
      ],
    },
  ];
  const visible = isEquity ? groups : [groups[0], { ...groups[3], items: groups[3].items.slice(0, 2) }];

  return (
    <Card>
      <CardHeader title="Statistiques clés" subtitle="Séance, valorisation et fondamentaux" />
      <div className="mb-5 grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-xs text-muted">Écart du jour</div>
          <RangeBar low={quote?.dayLow} high={quote?.dayHigh} value={quote?.price} currency={ccy} />
        </div>
        <div>
          <div className="mb-2 text-xs text-muted">Sur 52 semaines</div>
          <RangeBar
            low={quote?.fiftyTwoWeekLow ?? s.fiftyTwoWeekLow}
            high={quote?.fiftyTwoWeekHigh ?? s.fiftyTwoWeekHigh}
            value={quote?.price}
            currency={ccy}
          />
        </div>
      </div>
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        {visible.map((g) => (
          <div key={g.title}>
            <div className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">{g.title}</div>
            {g.items.map((it) => (
              <StatItem key={it.label} {...it} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ——— financial statements ———

type Statement = "income" | "balance" | "cashflow";

const ROWS: Record<Statement, { key: string; label: string; strong?: boolean }[]> = {
  income: [
    { key: "totalRevenue", label: "Chiffre d'affaires", strong: true },
    { key: "grossProfit", label: "Marge brute" },
    { key: "operatingIncome", label: "Résultat opérationnel" },
    { key: "EBITDA", label: "EBITDA" },
    { key: "netIncome", label: "Résultat net", strong: true },
    { key: "dilutedEPS", label: "BPA dilué" },
  ],
  balance: [
    { key: "totalAssets", label: "Total de l'actif", strong: true },
    { key: "cashAndCashEquivalents", label: "Trésorerie" },
    { key: "currentAssets", label: "Actif courant" },
    { key: "totalDebt", label: "Dette totale" },
    { key: "netDebt", label: "Dette nette" },
    { key: "stockholdersEquity", label: "Capitaux propres", strong: true },
  ],
  cashflow: [
    { key: "operatingCashFlow", label: "Flux opérationnels", strong: true },
    { key: "capitalExpenditure", label: "Investissements (capex)" },
    { key: "freeCashFlow", label: "Free cash-flow", strong: true },
    { key: "cashDividendsPaid", label: "Dividendes versés" },
    { key: "repurchaseOfCapitalStock", label: "Rachats d'actions" },
  ],
};

const CHART_KEYS: Record<Statement, [string, string, string, string]> = {
  income: ["totalRevenue", "netIncome", "Chiffre d'affaires", "Résultat net"],
  balance: ["totalAssets", "stockholdersEquity", "Actif total", "Capitaux propres"],
  cashflow: ["operatingCashFlow", "freeCashFlow", "Flux opérationnels", "Free cash-flow"],
};

function periodLabel(date: string, period: StatementPeriod) {
  if (period === "annual") return date.slice(0, 4);
  const m = Number(date.slice(5, 7));
  return `T${Math.ceil(m / 3)} ${date.slice(2, 4)}`;
}

export function Financials({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState<StatementPeriod>("annual");
  const [statement, setStatement] = useState<Statement>("income");
  const q = useFinancials(symbol, period);
  const data = q.data as FinancialStatements | undefined;
  const rows = (data?.[statement] ?? []) as ({ date: string } & Record<string, number | undefined>)[];
  const last = rows.slice(-8);
  const [k1, k2, l1, l2] = CHART_KEYS[statement];
  const ccy = data?.currency ?? "USD";

  return (
    <Card>
      <CardHeader
        title="États financiers"
        subtitle={
          data
            ? `En ${ccy}, ${period === "annual" ? "exercices annuels" : "trimestres"}`
            : "Compte de résultat, bilan et flux de trésorerie"
        }
        action={
          <Segmented
            ariaLabel="Période"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "annual", label: "Annuel" },
              { value: "quarterly", label: "Trimestriel" },
            ]}
          />
        }
      />
      <Segmented
        ariaLabel="État"
        value={statement}
        onChange={setStatement}
        options={[
          { value: "income", label: "Compte de résultat" },
          { value: "balance", label: "Bilan" },
          { value: "cashflow", label: "Flux de trésorerie" },
        ]}
        className="mb-4 max-w-full overflow-x-auto scrollbar-none"
      />
      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !last.length ? (
        <EmptyState
          title="Pas de données financières"
          description="Les états financiers ne sont pas disponibles pour ce type d'actif."
          className="py-8"
        />
      ) : (
        <>
          <div className="mb-2 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-1)]" /> {l1}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-2)]" /> {l2}
            </span>
          </div>
          <BarChart
            categories={last.map((r) => periodLabel(r.date, period))}
            series={[
              { id: k1, label: l1, color: "var(--chart-1)", values: last.map((r) => r[k1] ?? null) },
              { id: k2, label: l2, color: "var(--chart-2)", values: last.map((r) => r[k2] ?? null) },
            ]}
            height={220}
            formatValue={(v) => formatMoney(v, ccy, { compact: true })}
            formatAxis={(v) => formatCompact(v)}
            ariaLabel={`${l1} et ${l2}`}
          />
          <div className="mt-4 -mx-2 overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[520px] text-sm tabular">
              <thead>
                <tr className="text-xs text-subtle">
                  <th className="px-2 pb-2 text-left font-medium" />
                  {last.map((r) => (
                    <th key={r.date} className="px-2 pb-2 text-right font-medium">
                      {periodLabel(r.date, period)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS[statement].map((row) => (
                  <tr key={row.key} className="border-t border-border">
                    <td className={cn("px-2 py-2 whitespace-nowrap", row.strong ? "font-medium text-fg" : "text-muted")}>{row.label}</td>
                    {last.map((r) => {
                      const v = r[row.key];
                      return (
                        <td key={r.date} className={cn("px-2 py-2 text-right", row.strong && "font-medium")}>
                          {v == null ? "—" : row.key === "dilutedEPS" ? formatNumber(v, { decimals: 2 }) : formatCompact(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {statement === "income" && (
                  <tr className="border-t border-border">
                    <td className="px-2 py-2 text-muted">Marge nette</td>
                    {last.map((r) => (
                      <td key={r.date} className="px-2 py-2 text-right text-muted">
                        {r.totalRevenue && r.netIncome != null ? formatPercent(r.netIncome / r.totalRevenue, { decimals: 1 }) : "—"}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

// ——— analysts ———

const REC_LABELS = ["Achat fort", "Achat", "Conserver", "Vente", "Vente forte"];

const GRADES: Record<string, string> = {
  "strong buy": "Achat fort",
  buy: "Achat",
  "conviction buy": "Achat (conviction)",
  "top pick": "Valeur favorite",
  outperform: "Surperformance",
  "market outperform": "Surperformance",
  "sector outperform": "Surperformance",
  overweight: "Surpondérer",
  accumulate: "Accumuler",
  add: "Renforcer",
  positive: "Positif",
  neutral: "Neutre",
  hold: "Conserver",
  "equal-weight": "Pondération neutre",
  "market perform": "Performance de marché",
  "sector perform": "Performance du secteur",
  "peer perform": "En ligne",
  "in-line": "En ligne",
  underperform: "Sous-performance",
  underweight: "Sous-pondérer",
  reduce: "Alléger",
  sell: "Vente",
  "strong sell": "Vente forte",
  negative: "Négatif",
};

function gradeLabel(g?: string) {
  if (!g) return "";
  return GRADES[g.toLowerCase()] ?? g;
}
const REC_COLORS = [
  "var(--gain)",
  "color-mix(in oklab, var(--gain) 55%, var(--surface-3))",
  "var(--chart-muted)",
  "color-mix(in oklab, var(--loss) 55%, var(--surface-3))",
  "var(--loss)",
];

export function Analysts({ summary, quote }: { summary?: AssetSummary; quote?: Quote }) {
  const a = summary?.analysts;
  if (!a) return null;
  const mean = a.recommendationMean;
  const current = quote?.price;
  const upside = a.targetMean && current ? a.targetMean / current - 1 : null;
  const consensus = mean == null ? null : mean < 1.5 ? 0 : mean < 2.5 ? 1 : mean < 3.5 ? 2 : mean < 4.5 ? 3 : 4;
  const periodName = (p: string) => (p === "0m" ? "Ce mois" : p === "-1m" ? "M-1" : p === "-2m" ? "M-2" : p === "-3m" ? "M-3" : p);

  return (
    <Card>
      <CardHeader title="Avis des analystes" subtitle={a.analystCount ? `${a.analystCount} analystes` : "Consensus"} />
      {consensus != null && mean != null && (
        <div className="mb-5">
          <div className="flex items-end justify-between">
            <div
              className={cn("text-2xl font-semibold tracking-tight", consensus < 2 ? "text-gain" : consensus > 2 ? "text-loss" : "text-fg")}
            >
              {REC_LABELS[consensus]}
            </div>
            <div className="text-xs text-muted">note moyenne {formatNumber(mean, { decimals: 2 })} / 5</div>
          </div>
          <div className="relative mt-3 h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${REC_COLORS.join(",")})` }}>
            <motion.div
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-[3px] ring-surface"
              initial={{ left: "50%" }}
              animate={{ left: `${((mean - 1) / 4) * 100}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-subtle">
            <span>Achat fort</span>
            <span>Vente forte</span>
          </div>
        </div>
      )}
      {a.targetMean && current && a.targetLow && a.targetHigh && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Objectif de cours moyen</span>
            <span className="font-semibold">
              {formatPrice(a.targetMean, quote?.currency)} <DeltaPercent value={upside} className="ml-1 text-xs" />
            </span>
          </div>
          <TargetBar low={a.targetLow} mean={a.targetMean} high={a.targetHigh} current={current} currency={quote?.currency} />
        </div>
      )}
      {a.trend.length > 0 && (
        <div className="space-y-2">
          {a.trend.slice(0, 4).map((t) => {
            const values = [t.strongBuy, t.buy, t.hold, t.sell, t.strongSell];
            const total = values.reduce((s, v) => s + v, 0) || 1;
            return (
              <div key={t.period} className="flex items-center gap-3 text-xs">
                <span className="w-16 shrink-0 text-muted">{periodName(t.period)}</span>
                <div className="flex h-3 flex-1 gap-[2px] overflow-hidden rounded-full">
                  {values.map((v, i) =>
                    v > 0 ? (
                      <motion.div
                        key={i}
                        title={`${REC_LABELS[i]} : ${v}`}
                        className="h-full first:rounded-l-full last:rounded-r-full"
                        style={{ background: REC_COLORS[i] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(v / total) * 100}%` }}
                        transition={{ type: "spring", stiffness: 120, damping: 20, delay: i * 0.04 }}
                      />
                    ) : null,
                  )}
                </div>
                <span className="w-6 text-right text-muted tabular">{total}</span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-subtle">
            {REC_LABELS.map((l, i) => (
              <span key={l} className="flex items-center gap-1">
                <span className="size-2 rounded-[2px]" style={{ background: REC_COLORS[i] }} /> {l}
              </span>
            ))}
          </div>
        </div>
      )}
      {a.changes.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">Dernières révisions</div>
          <ul className="space-y-2 text-xs">
            {a.changes.slice(0, 5).map((c, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-subtle">{formatDate(c.date, "short")}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{c.firm}</span>
                <Badge tone={c.action === "up" ? "gain" : c.action === "down" ? "loss" : "neutral"}>
                  {c.action === "up" ? "Relève" : c.action === "down" ? "Abaisse" : c.action === "init" ? "Initie" : "Maintient"}
                </Badge>
                <span className="text-muted">{gradeLabel(c.toGrade)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ——— earnings ———

export function Earnings({ summary, currency }: { summary?: AssetSummary; currency?: string }) {
  const e = summary?.earnings;
  const history = (e?.history ?? []).filter((h) => h.actual != null || h.estimate != null);
  if (!e || (!history.length && !e.nextDate)) return null;
  return (
    <Card>
      <CardHeader title="Résultats" subtitle="Bénéfice par action publié vs attendu" icon={<Megaphone className="size-4" />} />
      {e.nextDate && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-accent-soft px-4 py-3 text-sm ring-1 ring-accent/20">
          <span className="text-fg">
            Prochaine publication : <span className="font-semibold">{formatDate(e.nextDate, "long")}</span>
          </span>
          {e.nextEpsEstimate != null && <span className="text-muted">BPA attendu {formatNumber(e.nextEpsEstimate, { decimals: 2 })}</span>}
        </div>
      )}
      {history.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-muted)]" /> Estimé
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-1)]" /> Publié
            </span>
          </div>
          <BarChart
            categories={history.map((h) => h.label)}
            series={[
              { id: "est", label: "Estimé", color: "var(--chart-muted)", values: history.map((h) => h.estimate ?? null) },
              { id: "act", label: "Publié", color: "var(--chart-1)", values: history.map((h) => h.actual ?? null) },
            ]}
            height={180}
            formatValue={(v) => formatNumber(v, { decimals: 2 })}
            ariaLabel="BPA publié et estimé"
          />
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
            {history.slice(-8).map((h) => (
              <div key={h.label} className="rounded-xl bg-surface-2 px-2 py-1.5 text-center">
                <div className="text-[10px] text-subtle">{h.label}</div>
                <div className={cn("text-xs font-semibold tabular", (h.surprise ?? 0) >= 0 ? "text-gain" : "text-loss")}>
                  {h.surprise != null ? formatPercent(h.surprise, { sign: true, decimals: 1 }) : "—"}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-subtle">
            Surprise = écart entre le BPA publié et le consensus{currency ? ` (${currency})` : ""}.
          </p>
        </>
      )}
    </Card>
  );
}

// ——— profile ———

export function Profile({ summary }: { summary?: AssetSummary }) {
  const [expanded, setExpanded] = useState(false);
  const p = summary?.profile;
  if (!p) return <Skeleton className="h-48 w-full rounded-[var(--radius-card)]" />;
  const desc = p.description ?? "";
  const long = desc.length > 420;
  const domain = p.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <Card>
      <CardHeader
        title="Profil"
        subtitle={[sectorLabel(p.sector), p.industry].filter((x) => x && x !== "Non classé").join(" · ") || undefined}
        icon={<Building className="size-4" />}
      />
      {desc && (
        <p className="text-sm leading-relaxed text-muted">
          {long && !expanded ? `${desc.slice(0, 420).trim()}…` : desc}
          {long && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="ml-1 font-medium text-accent hover:underline">
              {expanded ? "Réduire" : "Lire la suite"}
            </button>
          )}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {p.country && (
          <div className="flex items-center gap-2 text-muted">
            <Landmark className="size-4" /> {countryLabel(p.country)}
            {p.city ? `, ${p.city}` : ""}
          </div>
        )}
        {p.employees != null && (
          <div className="flex items-center gap-2 text-muted">
            <Users className="size-4" /> {formatNumber(p.employees, { decimals: 0 })} salariés
          </div>
        )}
        {domain && (
          <a href={p.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-accent hover:underline">
            <Globe className="size-4" /> {domain} <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {p.officers && p.officers.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">Direction</div>
          <ul className="space-y-1 text-sm">
            {p.officers.slice(0, 4).map((o) => (
              <li key={o.name + o.title} className="flex justify-between gap-3">
                <span className="truncate font-medium">{o.name}</span>
                <span className="truncate text-right text-muted">{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ——— fund composition ———

export function FundCard({ summary }: { summary?: AssetSummary }) {
  const f = summary?.fund;
  if (!f) return null;
  const maxSector = Math.max(...f.sectors.map((s) => s.weight), 0.01);
  return (
    <Card>
      <CardHeader title="Composition du fonds" subtitle={[f.family, f.category].filter(Boolean).join(" · ") || undefined} />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <div className="text-xs text-muted">Frais annuels</div>
          <div className="text-lg font-semibold">{formatPercent(f.expenseRatio ?? null)}</div>
        </div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3">
          <div className="text-xs text-muted">Encours</div>
          <div className="text-lg font-semibold">
            {f.totalAssets ? formatMoney(f.totalAssets, summary?.currency ?? "EUR", { compact: true }) : "—"}
          </div>
        </div>
      </div>
      {f.sectors.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Secteurs</div>
          {f.sectors.slice(0, 8).map((s, i) => (
            <div key={s.sector} className="flex items-center gap-3 text-xs">
              <span className="w-36 shrink-0 truncate text-muted">{sectorLabel(s.sector)}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  className="h-full rounded-full bg-[var(--chart-1)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.weight / maxSector) * 100}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 20, delay: i * 0.03 }}
                />
              </div>
              <span className="w-12 text-right tabular">{formatPercent(s.weight, { decimals: 1 })}</span>
            </div>
          ))}
        </div>
      )}
      {f.holdings.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Principales lignes</div>
          <ul className="text-sm">
            {f.holdings.slice(0, 10).map((h) => (
              <li key={h.symbol + h.name} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-0">
                <Link href={`/stock/${encodeURIComponent(h.symbol)}`} className="min-w-0 truncate hover:text-accent">
                  {h.name}
                </Link>
                <span className="text-muted tabular">{formatPercent(h.weight, { decimals: 2 })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ——— your position ———

export function PositionCard({
  position,
  transactions,
  currency,
  onEdit,
}: {
  position?: Position;
  transactions: Transaction[];
  currency: string;
  onEdit: (id: string) => void;
}) {
  const sorted = useMemo(() => [...transactions].sort((a, b) => b.date.localeCompare(a.date)), [transactions]);
  if (!position && !transactions.length) return null;
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-60" />
      <CardHeader
        title="Votre position"
        subtitle={
          position
            ? `${formatQuantity(position.quantity)} titres · ${formatPercent(position.weight, { decimals: 1 })} du portefeuille`
            : "Position soldée"
        }
      />
      {position && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted">Valeur</div>
            <div className="text-xl font-semibold tracking-tight">
              <Money value={position.value} currency={currency} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">PRU</div>
            <div className="text-xl font-semibold tracking-tight">
              <Price value={position.avgCost} currency={position.currency} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">+/- latente</div>
            <DeltaMoney value={position.unrealized} currency={currency} className="text-base" />
            <div className="text-xs">
              <DeltaPercent value={position.unrealizedPct} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Gain total</div>
            <DeltaMoney value={position.totalReturn} currency={currency} className="text-base" />
            <div className="text-xs text-muted">
              dont dividendes <Money value={position.dividends} currency={currency} />
            </div>
          </div>
        </div>
      )}
      {sorted.length > 0 && (
        <div className="mt-5 border-t border-border pt-3">
          <div className="mb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Vos opérations</div>
          <ul className="max-h-60 overflow-y-auto text-sm scrollbar-thin">
            {sorted.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onEdit(t.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-surface-2"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn("size-1.5 rounded-full", t.type === "BUY" ? "bg-gain" : t.type === "SELL" ? "bg-loss" : "bg-accent")}
                    />
                    <span className="text-muted">{formatDate(t.date, "medium")}</span>
                    <span>{TRANSACTION_LABELS[t.type]}</span>
                  </span>
                  <span className="text-muted tabular">
                    {t.quantity != null
                      ? `${formatQuantity(t.quantity)} × ${formatPrice(t.price, t.currency)}`
                      : formatMoney(t.amount ?? 0, t.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
