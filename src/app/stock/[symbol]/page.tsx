"use client";

import { ArrowLeft, Newspaper, Plus, Star } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import { NewsList } from "@/components/news/news-list";
import { buildMeta, usePortfolio } from "@/components/portfolio/portfolio-provider";
import { PriceChart } from "@/components/stock/price-chart";
import { Analysts, Earnings, Financials, FundCard, KeyStats, PositionCard, Profile } from "@/components/stock/sections";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { useQuote, useSummary } from "@/hooks/use-market";
import { assetTypeLabel } from "@/lib/market/catalog";
import { useAppStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const STATE_LABEL = { REGULAR: "Marché ouvert", PRE: "Pré-ouverture", POST: "Après-bourse", CLOSED: "Marché fermé" } as const;

export default function StockPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol ?? "").toUpperCase();
  const router = useRouter();
  const quote = useQuote(symbol);
  const summary = useSummary(symbol);
  const { snapshot, settings, transactions } = usePortfolio();
  const watchlist = useAppStore((s) => s.watchlist);
  const addToWatchlist = useAppStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useAppStore((s) => s.removeFromWatchlist);
  const openTransaction = useUiStore((s) => s.openTransaction);

  const q = quote.data;
  const s = summary.data;
  const meta = useMemo(() => buildMeta(symbol, q, s), [symbol, q, s]);
  const position = snapshot.positions.find((p) => p.symbol === symbol) ?? snapshot.closed.find((p) => p.symbol === symbol);
  const txs = useMemo(() => transactions.filter((t) => t.symbol === symbol), [transactions, symbol]);
  const watched = watchlist.some((w) => w.symbol === symbol);
  const notFound = quote.isError || (quote.isSuccess && !quote.isPlaceholderData && !q);

  const toggleWatch = () => {
    if (watched) {
      removeFromWatchlist(symbol);
      toast("Retiré de la watchlist", { description: symbol });
    } else {
      addToWatchlist(symbol);
      toast.success("Ajouté à la watchlist", { description: symbol });
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-2xl font-semibold">Valeur introuvable</h1>
        <p className="mt-2 text-muted">Aucune cotation pour « {symbol} ». Vérifiez le ticker (ex. MC.PA pour LVMH, AAPL pour Apple).</p>
        <Button className="mt-6" onClick={() => router.back()}>
          <ArrowLeft /> Retour
        </Button>
      </div>
    );
  }

  const isFund = meta.type === "ETF" || meta.type === "MUTUALFUND";

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <AssetLogo symbol={symbol} name={meta.name} logoUrl={meta.logoUrl} type={meta.type} size={56} />
          </motion.div>
          <div className="min-w-0">
            {q || s ? (
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-[28px]">{meta.name}</h1>
            ) : (
              <Skeleton className="h-8 w-64" />
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="font-medium text-fg">{symbol}</span>
              {meta.exchange && <span>· {meta.exchange}</span>}
              <Badge>{assetTypeLabel(meta.type)}</Badge>
              {q?.marketState && (
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span className={cn("size-1.5 rounded-full", q.marketState === "REGULAR" ? "bg-gain animate-pulse-soft" : "bg-subtle")} />
                  {STATE_LABEL[q.marketState]}
                </span>
              )}
              <span className="text-xs text-subtle">· cotation en {q?.currency ?? meta.currency}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant={watched ? "subtle" : "secondary"} onClick={toggleWatch} aria-pressed={watched}>
            <Star className={cn(watched && "fill-current")} /> {watched ? "Suivie" : "Suivre"}
          </Button>
          <Button variant="primary" onClick={() => openTransaction({ initial: { type: "BUY", symbol } })}>
            <Plus /> Transaction
          </Button>
        </div>
      </div>

      <Stagger className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <PriceChart
            symbol={symbol}
            name={meta.name}
            quote={q}
            transactions={txs}
            avgCost={position && position.quantity > 0 ? position.avgCost : undefined}
          />
          <KeyStats quote={q} summary={s} />
          {meta.type === "EQUITY" && <Financials symbol={symbol} />}
          <Earnings summary={s} currency={q?.currency} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4">
          <PositionCard
            position={position}
            transactions={txs}
            currency={settings.baseCurrency}
            onEdit={(id) => openTransaction({ editId: id })}
          />
          {isFund ? <FundCard summary={s} /> : <Analysts summary={s} quote={q} />}
          <Profile summary={s} />
          <Card>
            <CardHeader title="Actualités" icon={<Newspaper className="size-4" />} />
            <NewsList symbols={[symbol]} limit={5} columns={1} />
          </Card>
          <Link href="/markets" className="text-center text-xs text-subtle hover:text-muted">
            Données Yahoo Finance · cours différés selon la place de cotation
          </Link>
        </div>
      </Stagger>
    </>
  );
}
