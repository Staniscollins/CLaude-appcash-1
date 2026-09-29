"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useQuotes } from "@/hooks/use-market";
import { formatPrice } from "@/lib/format";
import { useAppStore } from "@/lib/store";

/** Checks watchlist price alerts on every quote refresh and notifies once per alert. */
export function AlertWatcher() {
  const watchlist = useAppStore((s) => s.watchlist);
  const hydrated = useAppStore((s) => s.hydrated);
  const updateWatchItem = useAppStore((s) => s.updateWatchItem);
  const armed = useMemo(() => watchlist.filter((w) => (w.alertAbove || w.alertBelow) && !w.alertTriggeredAt), [watchlist]);
  const symbols = useMemo(() => armed.map((w) => w.symbol), [armed]);
  const quotes = useQuotes(symbols, { enabled: hydrated && symbols.length > 0 });

  useEffect(() => {
    if (!quotes.data) return;
    for (const w of armed) {
      const q = quotes.data[w.symbol];
      if (!q) continue;
      const above = w.alertAbove != null && q.price >= w.alertAbove;
      const below = w.alertBelow != null && q.price <= w.alertBelow;
      if (!above && !below) continue;
      updateWatchItem(w.symbol, { alertTriggeredAt: Date.now() });
      const threshold = formatPrice(above ? w.alertAbove : w.alertBelow, q.currency);
      const text = `${q.name} ${above ? "a franchi à la hausse" : "est passé sous"} ${threshold} (cours ${formatPrice(q.price, q.currency)}).`;
      toast(`Alerte de cours · ${w.symbol}`, { description: text, duration: 12_000 });
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`Lumen · ${w.symbol}`, { body: text });
        } catch {
          // Notifications can be blocked by the browser.
        }
      }
    }
  }, [quotes.data, armed, updateWatchItem]);

  return null;
}
