"use client";

import { CalendarDays, Coins, Megaphone } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { useNow } from "@/hooks/use-now";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Card, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { addDays, dayKeyToUTC } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { forecastDividends } from "@/lib/portfolio/dividends";

interface Event {
  key: string;
  symbol: string;
  name: string;
  logoUrl?: string | null;
  kind: "earnings" | "dividend";
  date: number;
  label: string;
  amount?: number;
  estimated?: boolean;
}

export function useUpcomingEvents(horizonDays = 90) {
  const { snapshot, tables, today } = usePortfolio();
  const now = useNow();
  return useMemo(() => {
    const limit = dayKeyToUTC(addDays(today, horizonDays));
    const events: Event[] = [];
    for (const p of snapshot.positions) {
      const q = tables.quote(p.symbol);
      if (q?.earningsDate && q.earningsDate > now - 86_400_000 && q.earningsDate < limit) {
        events.push({
          key: `e-${p.symbol}`,
          symbol: p.symbol,
          name: p.name,
          logoUrl: p.meta.logoUrl,
          kind: "earnings",
          date: q.earningsDate,
          label: "Publication de résultats",
        });
      }
      if (q?.dividendDate && q.dividendDate > now - 86_400_000 && q.dividendDate < limit) {
        events.push({
          key: `d-${p.symbol}`,
          symbol: p.symbol,
          name: p.name,
          logoUrl: p.meta.logoUrl,
          kind: "dividend",
          date: q.dividendDate,
          label: "Versement du dividende",
        });
      }
    }
    const forecast = forecastDividends(snapshot.positions, tables, today);
    for (const pay of forecast.projected) {
      const t = dayKeyToUTC(pay.date);
      if (t < now - 86_400_000 || t > limit) continue;
      if (events.some((e) => e.kind === "dividend" && e.symbol === pay.symbol && Math.abs(e.date - t) < 20 * 86_400_000)) continue;
      const p = snapshot.positions.find((x) => x.symbol === pay.symbol);
      events.push({
        key: `p-${pay.symbol}-${pay.date}`,
        symbol: pay.symbol,
        name: p?.name ?? pay.symbol,
        logoUrl: p?.meta.logoUrl,
        kind: "dividend",
        date: t,
        label: "Détachement estimé",
        amount: pay.amount,
        estimated: true,
      });
    }
    return events.sort((a, b) => a.date - b.date);
  }, [snapshot.positions, tables, today, horizonDays, now]);
}

function relativeDays(t: number) {
  const days = Math.round((t - Date.now()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `dans ${days} j`;
}

export function EventsCard({ className }: { className?: string }) {
  const { settings, hydrated, quotesReady } = usePortfolio();
  const events = useUpcomingEvents().slice(0, 6);
  return (
    <Card className={className}>
      <CardHeader title="À venir" subtitle="Résultats et dividendes des 90 prochains jours" icon={<CalendarDays className="size-4" />} />
      {!hydrated || !quotesReady ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !events.length ? (
        <EmptyState
          icon={<CalendarDays />}
          title="Calendrier calme"
          description="Aucun événement connu sur vos lignes dans les 90 jours."
          className="py-8"
        />
      ) : (
        <ul className="space-y-1">
          {events.map((e, i) => (
            <motion.li key={e.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link
                href={`/stock/${encodeURIComponent(e.symbol)}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-surface-2"
              >
                <div className="relative">
                  <AssetLogo symbol={e.symbol} name={e.name} logoUrl={e.logoUrl} size={32} />
                  <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full bg-surface-3 ring-2 ring-surface">
                    {e.kind === "earnings" ? <Megaphone className="size-2.5 text-accent" /> : <Coins className="size-2.5 text-gain" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.name}</div>
                  <div className="truncate text-xs text-muted">
                    {e.label}
                    {e.amount ? (
                      <>
                        {" "}
                        · ≈ <Money value={e.amount} currency={settings.baseCurrency} />
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium">{formatDate(e.date, "short")}</div>
                  <div className="text-[11px] text-subtle">{relativeDays(e.date)}</div>
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </Card>
  );
}
