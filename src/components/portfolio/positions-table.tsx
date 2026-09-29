"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AssetLogo } from "@/components/ui/asset-logo";
import { DeltaMoney, DeltaPercent } from "@/components/ui/delta";
import { Money, Price } from "@/components/ui/money";
import { Badge } from "@/components/ui/primitives";
import { formatDate, formatPercent, formatQuantity } from "@/lib/format";
import type { Position } from "@/lib/portfolio/engine";
import type { Account } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";

type SortKey = "name" | "value" | "weight" | "day" | "unrealized" | "unrealizedPct" | "total" | "dividends";

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "name", label: "Actif", className: "text-left" },
  { key: "value", label: "Valeur", className: "text-right" },
  { key: "weight", label: "Poids", className: "text-right hidden lg:table-cell" },
  { key: "day", label: "Jour", className: "text-right hidden sm:table-cell" },
  { key: "unrealized", label: "+/- latente", className: "text-right hidden sm:table-cell" },
  { key: "dividends", label: "Dividendes", className: "text-right hidden xl:table-cell" },
  { key: "total", label: "Gain total", className: "text-right hidden md:table-cell" },
];

function sortValue(p: Position, key: SortKey): number | string {
  switch (key) {
    case "name":
      return p.name.toLowerCase();
    case "value":
      return p.value;
    case "weight":
      return p.weight;
    case "day":
      return p.changePercent;
    case "unrealized":
      return p.unrealized;
    case "unrealizedPct":
      return p.unrealizedPct;
    case "total":
      return p.totalReturn;
    case "dividends":
      return p.dividends;
  }
}

export function PositionsTable({ positions, currency, accounts }: { positions: Position[]; currency: string; accounts: Account[] }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 });
  const sorted = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const va = sortValue(a, sort.key);
        const vb = sortValue(b, sort.key);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      }),
    [positions, sort],
  );
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "name" ? 1 : -1 }));

  return (
    <div className="-mx-2 overflow-x-auto scrollbar-thin">
      <table className="w-full text-sm sm:min-w-[640px]">
        <thead>
          <tr className="text-xs text-subtle">
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              const Icon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
              return (
                <th
                  key={c.key}
                  className={cn("px-2 pb-3 font-medium", c.className)}
                  aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className={cn("inline-flex items-center gap-1 rounded-md transition hover:text-fg", active && "text-fg")}
                  >
                    {c.label}
                    <Icon className={cn("size-3", !active && "opacity-40")} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <motion.tr
              key={p.symbol}
              layout="position"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34, delay: Math.min(i * 0.025, 0.4) }}
              onClick={() => router.push(`/stock/${encodeURIComponent(p.symbol)}`)}
              className="group cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60"
            >
              <td className="px-2 py-3">
                <div className="flex items-center gap-3">
                  <AssetLogo symbol={p.symbol} name={p.name} logoUrl={p.meta.logoUrl} type={p.type} size={36} />
                  <div className="min-w-0">
                    <div className="max-w-[150px] truncate font-medium group-hover:text-accent sm:max-w-[240px]">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-subtle">
                      <span className="shrink-0 whitespace-nowrap">{p.symbol}</span>
                      <span>·</span>
                      <span className="max-w-[110px] truncate tabular sm:max-w-none">
                        {formatQuantity(p.quantity)} × <Price value={p.price} currency={p.currency} />
                      </span>
                      {p.accountIds.length > 1
                        ? null
                        : p.accountIds.map((id) => {
                            const acc = accountById.get(id);
                            return acc ? (
                              <span key={id} className="hidden items-center gap-1 sm:inline-flex">
                                <span className="size-1.5 rounded-full" style={{ background: acc.color }} />
                                {acc.name}
                              </span>
                            ) : null;
                          })}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-2 py-3 text-right">
                <div className="font-semibold tabular">
                  <Money value={p.value} currency={currency} />
                </div>
                <div className="text-xs text-subtle">
                  <span className="hidden sm:inline">
                    PRU <Price value={p.avgCost} currency={p.currency} />
                  </span>
                  {/* Phones: the unrealized return replaces the hidden columns. */}
                  <DeltaPercent value={p.unrealizedPct} className="font-normal sm:hidden" />
                </div>
              </td>
              <td className="hidden px-2 py-3 text-right lg:table-cell">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p.weight * 100)}%` }} />
                  </div>
                  <span className="w-12 text-xs tabular">{formatPercent(p.weight, { decimals: 1 })}</span>
                </div>
              </td>
              <td className="hidden px-2 py-3 text-right sm:table-cell">
                <DeltaPercent value={p.changePercent} className="text-[13px]" />
                <div className="text-xs">
                  <DeltaMoney value={p.dayChange} currency={currency} className="font-normal" />
                </div>
              </td>
              <td className="hidden px-2 py-3 text-right sm:table-cell">
                <DeltaMoney value={p.unrealized} currency={currency} className="text-[13px]" />
                <div className="text-xs">
                  <DeltaPercent value={p.unrealizedPct} icon={false} className="font-normal" />
                </div>
              </td>
              <td className="hidden px-2 py-3 text-right text-[13px] xl:table-cell">
                {p.dividends > 0 ? <Money value={p.dividends} currency={currency} /> : <span className="text-subtle">—</span>}
              </td>
              <td className="hidden px-2 py-3 text-right md:table-cell">
                <DeltaMoney value={p.totalReturn} currency={currency} className="text-[13px]" />
                <div className="text-xs">
                  <DeltaPercent value={p.totalReturnPct} icon={false} className="font-normal" />
                </div>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClosedPositions({ positions, currency }: { positions: Position[]; currency: string }) {
  const router = useRouter();
  return (
    <div className="-mx-2 overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs text-subtle">
            <th className="px-2 pb-3 font-medium">Actif</th>
            <th className="px-2 pb-3 font-medium">Période</th>
            <th className="px-2 pb-3 text-right font-medium">Investi</th>
            <th className="px-2 pb-3 text-right font-medium">Plus-value réalisée</th>
            <th className="px-2 pb-3 text-right font-medium">Dividendes</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr
              key={p.symbol}
              onClick={() => router.push(`/stock/${encodeURIComponent(p.symbol)}`)}
              className="cursor-pointer border-t border-border hover:bg-surface-2/60"
            >
              <td className="px-2 py-3">
                <div className="flex items-center gap-3">
                  <AssetLogo symbol={p.symbol} name={p.name} logoUrl={p.meta.logoUrl} type={p.type} size={30} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-subtle">{p.symbol}</div>
                  </div>
                </div>
              </td>
              <td className="px-2 py-3 text-xs text-muted">
                {formatDate(p.firstDate, "monthShort")} → {formatDate(p.lastDate, "monthShort")} <Badge className="ml-1">Soldée</Badge>
              </td>
              <td className="px-2 py-3 text-right tabular">
                <Money value={p.invested} currency={currency} />
              </td>
              <td className="px-2 py-3 text-right">
                <DeltaMoney value={p.realized} currency={currency} />
              </td>
              <td className="px-2 py-3 text-right tabular">
                <Money value={p.dividends} currency={currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
