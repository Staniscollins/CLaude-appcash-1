import { assetTypeLabel, countryLabel, regionFromName, sectorLabel } from "../market/catalog";
import { parentCurrency } from "../format";
import type { Position, Lot } from "./engine";
import type { MarketTables } from "./market-tables";
import type { Account } from "./types";

export type AllocationDimension = "asset" | "type" | "sector" | "region" | "currency" | "account";

export const ALLOCATION_LABELS: Record<AllocationDimension, string> = {
  asset: "Actifs",
  type: "Classes",
  sector: "Secteurs",
  region: "Géographie",
  currency: "Devises",
  account: "Comptes",
};

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  weight: number;
  symbols: string[];
  /** Account color, when the dimension is "account". */
  color?: string;
}

const CASH_LABEL = "Liquidités";

function add(map: Map<string, AllocationSlice>, key: string, label: string, value: number, symbol?: string, color?: string) {
  if (!(value > 0)) return;
  const slice = map.get(key) ?? { key, label, value: 0, weight: 0, symbols: [], color };
  slice.value += value;
  if (symbol && !slice.symbols.includes(symbol)) slice.symbols.push(symbol);
  map.set(key, slice);
}

export function computeAllocation(
  dimension: AllocationDimension,
  positions: Position[],
  opts: { cash?: number; lots?: Lot[]; tables?: MarketTables; accounts?: Account[]; cashByAccount?: Record<string, number> } = {},
): AllocationSlice[] {
  const map = new Map<string, AllocationSlice>();
  const cash = opts.cash ?? 0;

  switch (dimension) {
    case "asset":
      for (const p of positions) add(map, p.symbol, p.name, p.value, p.symbol);
      break;
    case "type":
      for (const p of positions) add(map, p.meta.type, assetTypeLabel(p.meta.type), p.value, p.symbol);
      break;
    case "sector":
      for (const p of positions) {
        const m = p.meta;
        if (m.type === "CRYPTOCURRENCY") add(map, "crypto", "Crypto-actifs", p.value, p.symbol);
        else if (m.sectorWeights?.length) {
          const total = m.sectorWeights.reduce((s, w) => s + w.weight, 0) || 1;
          for (const w of m.sectorWeights) add(map, sectorLabel(w.sector), sectorLabel(w.sector), (p.value * w.weight) / total, p.symbol);
        } else if (m.type === "ETF" || m.type === "MUTUALFUND") {
          const label = m.sector === "Or" || /gold|\bor\b/i.test(m.name) ? "Or" : "Fonds diversifiés";
          add(map, label, label, p.value, p.symbol);
        } else add(map, sectorLabel(m.sector), sectorLabel(m.sector), p.value, p.symbol);
      }
      break;
    case "region":
      for (const p of positions) {
        const m = p.meta;
        let label: string;
        if (m.type === "CRYPTOCURRENCY") label = "Crypto (mondial)";
        else if (m.type === "EQUITY") label = countryLabel(m.country);
        else label = m.region ?? regionFromName(m.name) ?? "Monde";
        add(map, label, label, p.value, p.symbol);
      }
      break;
    case "currency":
      for (const p of positions) {
        const c = parentCurrency(p.currency);
        add(map, c, c, p.value, p.symbol);
      }
      break;
    case "account": {
      const byId = new Map((opts.accounts ?? []).map((a) => [a.id, a]));
      const tables = opts.tables;
      if (opts.lots && tables) {
        for (const lot of opts.lots) {
          if (lot.quantity <= 0) continue;
          const price = tables.lastPrice(lot.symbol) ?? 0;
          const value = lot.quantity * price * tables.fxNow(tables.currencyOf(lot.symbol) ?? lot.currency);
          const acc = byId.get(lot.accountId);
          add(map, lot.accountId, acc?.name ?? "Compte", value, lot.symbol, acc?.color);
        }
      }
      for (const [id, v] of Object.entries(opts.cashByAccount ?? {})) {
        const acc = byId.get(id);
        if (acc && v > 0 && cash > 0) add(map, id, acc.name, v, undefined, acc.color);
      }
      break;
    }
  }
  if (dimension !== "account" && cash > 0) add(map, "cash", CASH_LABEL, cash);

  const total = [...map.values()].reduce((s, x) => s + x.value, 0);
  return [...map.values()].map((s) => ({ ...s, weight: total > 0 ? s.value / total : 0 })).sort((a, b) => b.value - a.value);
}

/** Keeps the `max - 1` largest slices and folds the tail into "Autres". */
export function foldSlices(slices: AllocationSlice[], max: number): AllocationSlice[] {
  if (slices.length <= max) return slices;
  const head = slices.slice(0, max - 1);
  const tail = slices.slice(max - 1);
  const value = tail.reduce((s, x) => s + x.value, 0);
  const weight = tail.reduce((s, x) => s + x.weight, 0);
  return [...head, { key: "__other", label: `Autres (${tail.length})`, value, weight, symbols: tail.flatMap((t) => t.symbols) }];
}

/**
 * Diversification score (0–100) from the Herfindahl index of the lines. A fund
 * counts as ~50 equal underlying lines, so a single world ETF scores high while
 * a single stock scores low.
 */
export function diversification(positions: Position[]) {
  const lines = positions.filter((p) => p.weight > 0);
  if (!lines.length) return { score: 0, effectiveCount: 0, topWeight: 0 };
  let hhi = 0;
  for (const p of lines) {
    const fund = p.meta.type === "ETF" || p.meta.type === "MUTUALFUND";
    hhi += fund ? (p.weight * p.weight) / 50 : p.weight * p.weight;
  }
  const effectiveCount = 1 / hhi;
  const score = Math.round(100 * (1 - Math.exp(-effectiveCount / 8)));
  return { score, effectiveCount, topWeight: Math.max(...lines.map((p) => p.weight)) };
}
