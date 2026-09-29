"use client";

import { Bitcoin, Coins, Flame, Globe, Landmark, LayoutGrid, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Sparkline } from "@/components/charts/sparkline";
import { Treemap } from "@/components/charts/treemap";
import { PageHeader } from "@/components/shell/app-shell";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { DeltaPercent } from "@/components/ui/delta";
import { AnimatedPrice } from "@/components/ui/money";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useCharts, useMovers, useQuotes } from "@/hooks/use-market";
import { formatCompact, formatNumber, formatPrice } from "@/lib/format";
import {
  catalogEntry,
  COMMODITY_SYMBOLS,
  CRYPTO_SYMBOLS,
  FX_SYMBOLS,
  INDEX_SYMBOLS,
  RATE_SYMBOLS,
  SECTOR_ETFS,
  SECTOR_WEIGHTS,
  sectorLabel,
} from "@/lib/market/catalog";
import type { Quote } from "@/lib/market/types";
import { cn } from "@/lib/utils";

const REGION: Record<string, string> = {
  "^FCHI": "France",
  "^STOXX50E": "Zone euro",
  "^GDAXI": "Allemagne",
  "^FTSE": "Royaume-Uni",
  "^GSPC": "États-Unis",
  "^IXIC": "États-Unis",
  "^DJI": "États-Unis",
  "^N225": "Japon",
  "^HSI": "Hong Kong",
};

function displayName(q: Quote) {
  return catalogEntry(q.symbol)?.name ?? q.shortName ?? q.name;
}

function IndexCard({ q, spark, i }: { q: Quote; spark?: number[]; i: number }) {
  const up = q.changePercent >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 26 }}
    >
      <Link
        href={`/stock/${encodeURIComponent(q.symbol)}`}
        className="group relative block overflow-hidden rounded-2xl bg-surface p-4 ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-border-strong"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: `radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, ${up ? "var(--gain)" : "var(--loss)"} 12%, transparent), transparent 60%)`,
          }}
        />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{displayName(q)}</div>
            <div className="text-[11px] text-subtle">{REGION[q.symbol] ?? q.exchange}</div>
          </div>
          <DeltaPercent value={q.changePercent} className="text-xs" />
        </div>
        <div className="relative mt-3 flex items-end justify-between gap-2">
          <div className="text-lg font-semibold tracking-tight tabular">
            <AnimatedPrice value={q.price} />
          </div>
          <Sparkline values={spark ?? []} baseline={q.previousClose} width={92} height={34} />
        </div>
      </Link>
    </motion.div>
  );
}

function QuoteRow({ q, spark, digits }: { q: Quote; spark?: number[]; digits?: number }) {
  return (
    <li>
      <Link
        href={`/stock/${encodeURIComponent(q.symbol)}`}
        className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
      >
        <AssetLogo symbol={q.symbol} name={displayName(q)} type={q.type} logoUrl={q.logoUrl} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName(q)}</div>
          <div className="text-[11px] text-subtle">{q.symbol}</div>
        </div>
        <Sparkline values={spark ?? []} baseline={q.previousClose} width={70} height={26} className="hidden sm:block" />
        <div className="w-28 text-right">
          <div className="text-sm font-semibold tabular">
            {digits != null
              ? formatNumber(q.price, { decimals: digits, minDecimals: digits })
              : formatPrice(q.price, q.type === "CURRENCY" ? undefined : q.currency)}
          </div>
          <DeltaPercent value={q.changePercent} className="text-xs" />
        </div>
      </Link>
    </li>
  );
}

export default function MarketsPage() {
  const router = useRouter();
  const all = useMemo(
    () => [...INDEX_SYMBOLS, ...FX_SYMBOLS, ...COMMODITY_SYMBOLS, ...CRYPTO_SYMBOLS, ...RATE_SYMBOLS, ...SECTOR_ETFS],
    [],
  );
  const quotes = useQuotes(all);
  const sparkSymbols = useMemo(() => [...INDEX_SYMBOLS, ...FX_SYMBOLS, ...COMMODITY_SYMBOLS, ...CRYPTO_SYMBOLS, ...RATE_SYMBOLS], []);
  const charts = useCharts(sparkSymbols, "1d");
  const movers = useMovers();
  const [moverTab, setMoverTab] = useState<"gainers" | "losers" | "active" | "trending">("gainers");
  const q = (s: string) => quotes.data?.[s];
  const spark = (s: string) => charts.data[s]?.c;
  const list = (symbols: string[]) => symbols.map(q).filter((x): x is Quote => !!x);

  const sectorItems = list(SECTOR_ETFS).map((x) => ({
    key: x.symbol,
    label: sectorLabel(catalogEntry(x.symbol)?.sector),
    sublabel: `${x.symbol} · ${displayName(x)}`,
    value: SECTOR_WEIGHTS[x.symbol] ?? 3,
    change: x.changePercent,
    detail: `≈ ${SECTOR_WEIGHTS[x.symbol] ?? "?"} % du S&P 500`,
  }));
  const moverList = movers.data?.[moverTab] ?? [];

  return (
    <>
      <PageHeader title="Marchés" description="Indices, devises, matières premières, crypto-actifs et secteurs — en un coup d'œil." />
      <Stagger className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <CardHeader title="Indices mondiaux" subtitle="Variation de la séance, courbe intraday" icon={<Globe className="size-4" />} />
          {!quotes.data ? (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {INDEX_SYMBOLS.map((s) => (
                <Skeleton key={s} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list(INDEX_SYMBOLS).map((x, i) => (
                <IndexCard key={x.symbol} q={x} spark={spark(x.symbol)} i={i} />
              ))}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="Secteurs américains"
            subtitle="ETF sectoriels SPDR — taille selon le poids dans le S&P 500"
            icon={<LayoutGrid className="size-4" />}
          />
          {sectorItems.length ? (
            <Treemap items={sectorItems} height={300} scale={0.025} onSelect={(s) => router.push(`/stock/${encodeURIComponent(s)}`)} />
          ) : (
            <Skeleton className="h-[300px] w-full" />
          )}
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="Crypto-actifs" icon={<Bitcoin className="size-4" />} />
          <ul className="space-y-0.5">
            {list(CRYPTO_SYMBOLS).map((x) => (
              <QuoteRow key={x.symbol} q={x} spark={spark(x.symbol)} />
            ))}
          </ul>
          <div className="my-3 h-px bg-border" />
          <CardHeader title="Taux & volatilité" icon={<Percent className="size-4" />} className="mb-2" />
          <ul className="space-y-0.5">
            {list(RATE_SYMBOLS).map((x) => (
              <QuoteRow key={x.symbol} q={x} spark={spark(x.symbol)} digits={2} />
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Devises" subtitle="Taux de change au comptant" icon={<Landmark className="size-4" />} />
          <ul className="space-y-0.5">
            {list(FX_SYMBOLS).map((x) => (
              <QuoteRow key={x.symbol} q={x} spark={spark(x.symbol)} digits={4} />
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader title="Matières premières" subtitle="Contrats à terme, en dollars" icon={<Coins className="size-4" />} />
          <ul className="space-y-0.5">
            {list(COMMODITY_SYMBOLS).map((x) => (
              <QuoteRow key={x.symbol} q={x} spark={spark(x.symbol)} />
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Ça bouge"
            subtitle={moverTab === "trending" ? "Valeurs les plus consultées en France" : "Marché américain, séance en cours"}
            icon={<Flame className="size-4" />}
            action={
              <Segmented
                ariaLabel="Classement"
                value={moverTab}
                onChange={setMoverTab}
                options={[
                  {
                    value: "gainers",
                    label: (
                      <>
                        <TrendingUp className="size-3.5" /> Hausses
                      </>
                    ),
                  },
                  {
                    value: "losers",
                    label: (
                      <>
                        <TrendingDown className="size-3.5" /> Baisses
                      </>
                    ),
                  },
                  { value: "active", label: "Volumes" },
                  { value: "trending", label: "Tendances" },
                ]}
              />
            }
          />
          {movers.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : !moverList.length ? (
            <EmptyState
              title="Classement indisponible"
              description="Yahoo Finance n'a pas renvoyé de données pour ce classement."
              className="py-8"
            />
          ) : (
            <motion.ul key={moverTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-x-8 md:grid-cols-2">
              {moverList.slice(0, 10).map((x, i) => (
                <motion.li key={x.symbol} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                  <Link
                    href={`/stock/${encodeURIComponent(x.symbol)}`}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2"
                  >
                    <span className="w-5 text-right text-xs text-subtle tabular">{i + 1}</span>
                    <AssetLogo symbol={x.symbol} name={x.name} logoUrl={x.logoUrl} type={x.type} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{x.name}</div>
                      <div className="text-[11px] text-subtle">
                        {x.symbol}
                        {x.volume ? ` · vol. ${formatCompact(x.volume)}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular">{formatPrice(x.price, x.currency)}</div>
                      <DeltaPercent value={x.changePercent} className={cn("text-xs")} />
                    </div>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </Card>
      </Stagger>
    </>
  );
}
