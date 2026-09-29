"use client";

import { Bell, BellRing, Plus, Star, Trash } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { RangeBar } from "@/components/charts/range-bar";
import { Sparkline } from "@/components/charts/sparkline";
import { PageHeader } from "@/components/shell/app-shell";
import { SymbolPicker } from "@/components/transactions/symbol-picker";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeltaPercent } from "@/components/ui/delta";
import { Dialog } from "@/components/ui/dialog";
import { AnimatedPrice } from "@/components/ui/money";
import { Badge, EmptyState, Field, Input, Skeleton } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useCharts, useQuotes, useSummaries } from "@/hooks/use-market";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format";
import { parseNumberLoose } from "@/lib/portfolio/csv";
import type { WatchItem } from "@/lib/portfolio/types";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type SortKey = "added" | "change" | "name" | "upside";

export default function WatchlistPage() {
  const watchlist = useAppStore((s) => s.watchlist);
  const hydrated = useAppStore((s) => s.hydrated);
  const addToWatchlist = useAppStore((s) => s.addToWatchlist);
  const removeFromWatchlist = useAppStore((s) => s.removeFromWatchlist);
  const [adding, setAdding] = useState(false);
  const [alertFor, setAlertFor] = useState<WatchItem | null>(null);
  const [range, setRange] = useState<"1d" | "1mo" | "1y">("1mo");
  const [sort, setSort] = useState<SortKey>("added");
  const symbols = useMemo(() => watchlist.map((w) => w.symbol), [watchlist]);
  const quotes = useQuotes(symbols);
  const charts = useCharts(symbols, range);
  const summaries = useSummaries(symbols);

  const rows = useMemo(() => {
    const list = watchlist.map((w) => {
      const q = quotes.data?.[w.symbol];
      const target = summaries[w.symbol]?.analysts?.targetMean;
      return { w, q, upside: q && target ? target / q.price - 1 : null };
    });
    return list.sort((a, b) => {
      if (sort === "change") return (b.q?.changePercent ?? -9) - (a.q?.changePercent ?? -9);
      if (sort === "name") return (a.q?.name ?? a.w.symbol).localeCompare(b.q?.name ?? b.w.symbol);
      if (sort === "upside") return (b.upside ?? -9) - (a.upside ?? -9);
      return b.w.addedAt - a.w.addedAt;
    });
  }, [watchlist, quotes.data, summaries, sort]);

  const remove = (symbol: string) => {
    removeFromWatchlist(symbol);
    toast("Retiré de la watchlist", { description: symbol, action: { label: "Annuler", onClick: () => addToWatchlist(symbol) } });
  };

  const notifications = typeof Notification !== "undefined" ? Notification.permission : "unsupported";

  return (
    <>
      <PageHeader
        title="Watchlist"
        description="Les valeurs que vous surveillez, avec alertes de cours."
        actions={
          <>
            <Segmented
              ariaLabel="Tendance"
              value={range}
              onChange={setRange}
              options={[
                { value: "1d", label: "1J" },
                { value: "1mo", label: "1M" },
                { value: "1y", label: "1A" },
              ]}
            />
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus /> Ajouter
            </Button>
          </>
        }
      />

      {watchlist.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Trier par</span>
          {(
            [
              ["added", "Ajout récent"],
              ["change", "Variation du jour"],
              ["upside", "Potentiel analystes"],
              ["name", "Nom"],
            ] as [SortKey, string][]
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={cn(
                "h-7 rounded-full px-3 font-medium ring-1 transition",
                sort === k ? "bg-accent-soft text-accent ring-accent/30" : "text-muted ring-border hover:text-fg",
              )}
            >
              {l}
            </button>
          ))}
          {notifications === "default" && (
            <button
              type="button"
              onClick={() => void Notification.requestPermission().then((p) => p === "granted" && toast.success("Notifications activées"))}
              className="ml-auto inline-flex items-center gap-1.5 text-accent hover:underline"
            >
              <BellRing className="size-3.5" /> Activer les notifications du navigateur
            </button>
          )}
        </div>
      )}

      {!hydrated ? (
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
      ) : !watchlist.length ? (
        <Card>
          <EmptyState
            icon={<Star />}
            title="Votre watchlist est vide"
            description="Ajoutez des actions, ETF ou cryptos pour suivre leurs cours et recevoir des alertes."
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus /> Ajouter une valeur
              </Button>
            }
          />
        </Card>
      ) : (
        <motion.div layout className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {rows.map(({ w, q, upside }, i) => {
              const hasAlert = w.alertAbove != null || w.alertBelow != null;
              return (
                <motion.div
                  key={w.symbol}
                  layout
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ type: "spring", stiffness: 320, damping: 30, delay: Math.min(i * 0.03, 0.3) }}
                  className="group relative rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-border transition hover:ring-border-strong"
                >
                  <div className="flex items-start gap-3">
                    <Link href={`/stock/${encodeURIComponent(w.symbol)}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <AssetLogo symbol={w.symbol} name={q?.name} logoUrl={q?.logoUrl} type={q?.type} size={40} />
                      <div className="min-w-0">
                        <div className="truncate font-medium group-hover:text-accent">{q?.name ?? w.symbol}</div>
                        <div className="text-xs text-subtle">
                          {w.symbol}
                          {q?.exchange ? ` · ${q.exchange}` : ""}
                        </div>
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1 opacity-60 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setAlertFor(w)}
                        className={cn(
                          "grid size-8 place-items-center rounded-lg hover:bg-surface-2",
                          hasAlert ? "text-warning" : "text-muted",
                        )}
                        aria-label="Alerte de cours"
                      >
                        {hasAlert ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(w.symbol)}
                        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-loss"
                        aria-label="Retirer"
                      >
                        <Trash className="size-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-2xl font-semibold tracking-tight tabular">
                        {q ? <AnimatedPrice value={q.price} currency={q.currency} /> : <Skeleton className="h-7 w-24" />}
                      </div>
                      {q && <DeltaPercent value={q.changePercent} animated className="text-sm" />}
                    </div>
                    <Sparkline
                      values={charts.data[w.symbol]?.c ?? []}
                      baseline={range === "1d" ? q?.previousClose : undefined}
                      width={120}
                      height={44}
                    />
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[11px] text-subtle">
                      <span>52 semaines</span>
                      {q?.fiftyTwoWeekHigh ? (
                        <span>{formatPercent(q.price / q.fiftyTwoWeekHigh - 1, { decimals: 1 })} du plus haut</span>
                      ) : null}
                    </div>
                    <RangeBar low={q?.fiftyTwoWeekLow} high={q?.fiftyTwoWeekHigh} value={q?.price} currency={q?.currency} labels={false} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-surface-2 px-2 py-1.5">
                      <div className="text-subtle">PER</div>
                      <div className="font-medium tabular">{formatNumber(q?.pe ?? null, { decimals: 1 })}</div>
                    </div>
                    <div className="rounded-xl bg-surface-2 px-2 py-1.5">
                      <div className="text-subtle">Rendement</div>
                      <div className="font-medium tabular">{formatPercent(q?.dividendYield ?? null, { decimals: 1 })}</div>
                    </div>
                    <div className="rounded-xl bg-surface-2 px-2 py-1.5">
                      <div className="text-subtle">Objectif</div>
                      <div className={cn("font-medium tabular", upside != null && (upside >= 0 ? "text-gain" : "text-loss"))}>
                        {formatPercent(upside, { sign: true, decimals: 0 })}
                      </div>
                    </div>
                  </div>
                  {hasAlert && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {w.alertAbove != null && <Badge tone="gain">≥ {formatPrice(w.alertAbove, q?.currency)}</Badge>}
                      {w.alertBelow != null && <Badge tone="loss">≤ {formatPrice(w.alertBelow, q?.currency)}</Badge>}
                      {w.alertTriggeredAt && <Badge tone="warning">Déclenchée</Badge>}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <Dialog open={adding} onOpenChange={setAdding} title="Ajouter à la watchlist" size="sm">
        <SymbolPicker
          value=""
          autoFocus
          onChange={(s) => {
            if (!s) return;
            addToWatchlist(s);
            setAdding(false);
            toast.success("Ajouté à la watchlist", { description: s });
          }}
        />
      </Dialog>

      <AlertDialog
        item={alertFor}
        onClose={() => setAlertFor(null)}
        price={alertFor ? quotes.data?.[alertFor.symbol]?.price : undefined}
        currency={alertFor ? quotes.data?.[alertFor.symbol]?.currency : undefined}
      />
    </>
  );
}

function AlertDialog({
  item,
  onClose,
  price,
  currency,
}: {
  item: WatchItem | null;
  onClose: () => void;
  price?: number;
  currency?: string;
}) {
  const update = useAppStore((s) => s.updateWatchItem);
  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      title={`Alerte de cours · ${item?.symbol ?? ""}`}
      description={price ? `Cours actuel : ${formatPrice(price, currency)}` : undefined}
      size="sm"
    >
      {item && (
        <AlertForm
          key={item.symbol}
          item={item}
          price={price}
          onSave={(patch) => {
            update(item.symbol, patch);
            onClose();
            toast.success("Alerte enregistrée");
          }}
        />
      )}
    </Dialog>
  );
}

function AlertForm({ item, price, onSave }: { item: WatchItem; price?: number; onSave: (patch: Partial<WatchItem>) => void }) {
  const [above, setAbove] = useState(
    item.alertAbove != null
      ? String(item.alertAbove).replace(".", ",")
      : price
        ? String(Math.round(price * 1.05 * 100) / 100).replace(".", ",")
        : "",
  );
  const [below, setBelow] = useState(
    item.alertBelow != null
      ? String(item.alertBelow).replace(".", ",")
      : price
        ? String(Math.round(price * 0.95 * 100) / 100).replace(".", ",")
        : "",
  );
  return (
    <div className="flex flex-col gap-4">
      <Field label="Alerter si le cours monte au-dessus de" hint="Laisser vide pour désactiver">
        <Input inputMode="decimal" value={above} onChange={(e) => setAbove(e.target.value)} />
      </Field>
      <Field label="Alerter si le cours descend sous" hint="Laisser vide pour désactiver">
        <Input inputMode="decimal" value={below} onChange={(e) => setBelow(e.target.value)} />
      </Field>
      <p className="text-xs text-subtle">
        Les alertes sont vérifiées à chaque rafraîchissement des cours tant que Lumen est ouvert dans un onglet.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onSave({ alertAbove: undefined, alertBelow: undefined, alertTriggeredAt: undefined })}>
          Supprimer l&apos;alerte
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            onSave({
              alertAbove: parseNumberLoose(above) || undefined,
              alertBelow: parseNumberLoose(below) || undefined,
              alertTriggeredAt: undefined,
            })
          }
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
