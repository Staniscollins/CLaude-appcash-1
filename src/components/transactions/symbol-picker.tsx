"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { AssetLogo } from "@/components/ui/asset-logo";
import { useDebounced } from "@/hooks/use-debounced";
import { useQuote, useSearch } from "@/hooks/use-market";
import { assetTypeLabel } from "@/lib/market/catalog";
import type { AssetType } from "@/lib/market/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Option {
  symbol: string;
  name: string;
  type: AssetType;
  exchange?: string;
}

/** Search-as-you-type security picker (Yahoo search + current holdings). */
export function SymbolPicker({
  value,
  onChange,
  autoFocus,
  invalid,
}: {
  value: string;
  onChange: (symbol: string) => void;
  autoFocus?: boolean;
  invalid?: boolean;
}) {
  const { snapshot } = usePortfolio();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query, 180);
  const search = useSearch(open ? debounced : "");
  const quote = useQuote(value || undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const holdings: Option[] = snapshot.positions.map((p) => ({ symbol: p.symbol, name: p.name, type: p.type, exchange: p.meta.exchange }));
  const q = query.trim().toLowerCase();
  const options: Option[] = q
    ? [
        ...holdings.filter((h) => `${h.symbol} ${h.name}`.toLowerCase().includes(q)),
        ...(search.data?.hits ?? []).filter((h) => !holdings.some((x) => x.symbol === h.symbol)),
      ].slice(0, 9)
    : holdings.slice(0, 8);

  const choose = (o: Option) => {
    onChange(o.symbol);
    setQuery("");
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && open && options[active]) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (value) {
    const q = quote.data;
    return (
      <div className={cn("flex h-14 items-center gap-3 rounded-xl bg-surface-2 px-3 ring-1", invalid ? "ring-loss" : "ring-border")}>
        <AssetLogo symbol={value} name={q?.name} logoUrl={q?.logoUrl} type={q?.type} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">{q?.name ?? value}</div>
          <div className="truncate text-xs text-subtle">
            {value}
            {q?.exchange ? ` · ${q.exchange}` : ""}
            {q ? ` · ${formatPrice(q.price, q.currency)}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange("");
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-fg"
          aria-label="Changer de valeur"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "flex h-11 items-center gap-2 rounded-xl bg-surface-2 px-3 ring-1 focus-within:ring-2 focus-within:ring-accent",
          invalid ? "ring-loss" : "ring-border",
        )}
      >
        {search.isFetching ? <LoaderCircle className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
        <input
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKey}
          placeholder="Nom, ticker ou ISIN (ex. Air Liquide, AAPL, FR0000120073)"
          className="h-full flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
        />
      </div>
      <AnimatePresence>
        {open && options.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-2xl bg-surface-3 p-1.5 shadow-[var(--shadow-pop)] scrollbar-thin"
            role="listbox"
            id={listId}
          >
            {!q && <li className="px-3 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">Vos positions</li>}
            {options.map((o, i) => (
              <li key={o.symbol} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left", i === active && "bg-surface-2")}
                >
                  <AssetLogo symbol={o.symbol} name={o.name} type={o.type} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{o.name}</div>
                    <div className="truncate text-xs text-subtle">
                      {o.symbol} · {assetTypeLabel(o.type)}
                      {o.exchange ? ` · ${o.exchange}` : ""}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
