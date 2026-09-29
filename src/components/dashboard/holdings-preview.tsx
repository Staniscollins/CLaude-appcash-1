"use client";

import { ArrowRight, Wallet } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Sparkline } from "@/components/charts/sparkline";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DeltaPercent } from "@/components/ui/delta";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/primitives";
import { useCharts } from "@/hooks/use-market";
import { formatPercent } from "@/lib/format";

export function HoldingsPreview({ className }: { className?: string }) {
  const { snapshot, settings, hydrated, quotesReady } = usePortfolio();
  const top = snapshot.positions.slice(0, 7);
  const charts = useCharts(
    top.map((p) => p.symbol),
    "1mo",
  );
  const loading = !hydrated || !quotesReady;

  return (
    <Card className={className}>
      <CardHeader
        title="Principales positions"
        subtitle={`${snapshot.positions.length} lignes · classées par poids`}
        icon={<Wallet className="size-4" />}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/portfolio">
              Tout voir <ArrowRight />
            </Link>
          </Button>
        }
      />
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : (
        <div className="-mx-2 overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm sm:min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-subtle">
                <th className="px-2 pb-2 font-medium">Actif</th>
                <th className="hidden px-2 pb-2 font-medium sm:table-cell">Poids</th>
                <th className="hidden px-2 pb-2 font-medium md:table-cell">1 mois</th>
                <th className="px-2 pb-2 text-right font-medium">Valeur</th>
                <th className="hidden px-2 pb-2 text-right font-medium sm:table-cell">Jour</th>
                <th className="hidden px-2 pb-2 text-right font-medium sm:table-cell">+/- latente</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => (
                <motion.tr
                  key={p.symbol}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="group border-t border-border"
                >
                  <td className="px-2 py-2.5">
                    <Link href={`/stock/${encodeURIComponent(p.symbol)}`} className="flex items-center gap-3">
                      <AssetLogo symbol={p.symbol} name={p.name} logoUrl={p.meta.logoUrl} type={p.type} size={32} />
                      <div className="min-w-0">
                        <div className="max-w-[140px] truncate font-medium group-hover:text-accent sm:max-w-[180px]">{p.name}</div>
                        <div className="text-xs text-subtle">
                          {p.symbol}
                          <span className="tabular sm:hidden"> · {formatPercent(p.weight, { decimals: 1 })}</span>
                        </div>
                      </div>
                    </Link>
                  </td>
                  <td className="hidden px-2 py-2.5 sm:table-cell">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                        <motion.div
                          className="h-full rounded-full bg-accent"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, p.weight * 100)}%` }}
                          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.05 * i }}
                        />
                      </div>
                      <span className="text-xs text-muted tabular">{formatPercent(p.weight, { decimals: 1 })}</span>
                    </div>
                  </td>
                  <td className="hidden px-2 py-2.5 md:table-cell">
                    <Sparkline values={charts.data[p.symbol]?.c ?? []} width={84} height={26} />
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular">
                    <Money value={p.value} currency={settings.baseCurrency} />
                    <DeltaPercent value={p.changePercent} className="mt-0.5 flex justify-end text-xs sm:hidden" />
                  </td>
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell">
                    <DeltaPercent value={p.changePercent} className="text-[13px]" />
                  </td>
                  <td className="hidden px-2 py-2.5 text-right sm:table-cell">
                    <DeltaPercent value={p.unrealizedPct} className="text-[13px]" />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
