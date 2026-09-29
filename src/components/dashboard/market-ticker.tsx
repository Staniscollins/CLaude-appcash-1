"use client";

import Link from "next/link";
import { DeltaPercent } from "@/components/ui/delta";
import { useQuotes } from "@/hooks/use-market";
import { formatPrice } from "@/lib/format";
import { catalogEntry } from "@/lib/market/catalog";

const TICKER = ["^FCHI", "^STOXX50E", "^GDAXI", "^GSPC", "^IXIC", "^N225", "EURUSD=X", "GC=F", "BZ=F", "BTC-EUR", "ETH-EUR", "^TNX"];

const SHORT: Record<string, string> = {
  "^FCHI": "CAC 40",
  "^STOXX50E": "Euro Stoxx 50",
  "^GDAXI": "DAX",
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  "^N225": "Nikkei",
  "EURUSD=X": "EUR/USD",
  "GC=F": "Or",
  "BZ=F": "Brent",
  "BTC-EUR": "Bitcoin",
  "ETH-EUR": "Ether",
  "^TNX": "US 10 ans",
};

/** Infinite, pausable ticker tape of the main markets. */
export function MarketTicker() {
  const { data } = useQuotes(TICKER);
  const items = TICKER.map((s) => data?.[s]).filter((q): q is NonNullable<typeof q> => !!q);
  if (!items.length) return <div className="h-10" />;
  const row = (
    <div className="flex shrink-0 items-center gap-8 pr-8">
      {items.map((q) => (
        <Link
          key={q.symbol}
          href={`/stock/${encodeURIComponent(q.symbol)}`}
          className="flex items-center gap-2 text-[13px] whitespace-nowrap hover:opacity-80"
        >
          <span className="font-medium text-fg">{SHORT[q.symbol] ?? catalogEntry(q.symbol)?.name ?? q.symbol}</span>
          <span className="text-muted tabular">
            {formatPrice(q.price, q.type === "INDEX" || q.type === "CURRENCY" ? undefined : q.currency)}
          </span>
          <DeltaPercent value={q.changePercent} className="text-xs" />
        </Link>
      ))}
    </div>
  );
  return (
    <div className="group relative mb-4 overflow-hidden rounded-2xl bg-surface/60 py-2.5 ring-1 ring-border [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
      <div
        className="flex w-max animate-marquee group-hover:[animation-play-state:paused]"
        style={{ ["--marquee-duration" as string]: "55s" }}
      >
        {row}
        <div aria-hidden className="flex">
          {row}
        </div>
      </div>
    </div>
  );
}
