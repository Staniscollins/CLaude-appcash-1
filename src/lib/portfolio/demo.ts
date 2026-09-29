import { addDays, addMonths, isWeekend, type DayKey } from "../dates";
import type { MarketTables } from "./market-tables";
import type { Account, Transaction, WatchItem } from "./types";

/**
 * A realistic demo portfolio of a French investor who started ~2.5 years ago:
 * a PEA with monthly deposits and a world ETF DCA, a US stock account and a
 * small crypto allocation. Trade prices are read from the price history so the
 * demo stays consistent with whatever data source is active.
 */

export const DEMO_ACCOUNTS: Account[] = [
  { id: "demo-pea", name: "PEA", type: "PEA", color: "#8b7dff", broker: "Démo", createdAt: 1 },
  { id: "demo-cto", name: "Compte-titres", type: "CTO", color: "#3987e5", broker: "Démo", createdAt: 2 },
  { id: "demo-crypto", name: "Crypto", type: "CRYPTO", color: "#d95926", broker: "Démo", createdAt: 3 },
];

export const DEMO_SYMBOLS = [
  "CW8.PA",
  "MC.PA",
  "AI.PA",
  "TTE.PA",
  "SU.PA",
  "ASML.AS",
  "AIR.PA",
  "AAPL",
  "MSFT",
  "NVDA",
  "GOOGL",
  "O",
  "AMZN",
  "LLY",
  "META",
  "BTC-EUR",
  "ETH-EUR",
];

export const DEMO_WATCHLIST: WatchItem[] = ["RMS.PA", "OR.PA", "SAF.PA", "COST", "NOVO-B.CO", "PLTR", "V"].map((symbol, i) => ({
  symbol,
  addedAt: i + 1,
}));

export function demoStartDay(today: DayKey): DayKey {
  return nextWeekday(addMonths(today, -30));
}

function nextWeekday(day: DayKey): DayKey {
  let d = day;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

interface TradePlan {
  account: string;
  symbol: string;
  monthOffset: number;
  dayOffset?: number;
  type: "BUY" | "SELL";
  quantity?: number;
  /** Buy for approximately this amount (in instrument currency). */
  budget?: number;
  fees?: number;
}

const PLAN: TradePlan[] = [
  // PEA — initial allocation
  { account: "demo-pea", symbol: "MC.PA", monthOffset: 0, dayOffset: 1, type: "BUY", quantity: 4, fees: 3.5 },
  { account: "demo-pea", symbol: "AI.PA", monthOffset: 0, dayOffset: 1, type: "BUY", quantity: 10, fees: 2 },
  { account: "demo-pea", symbol: "TTE.PA", monthOffset: 0, dayOffset: 2, type: "BUY", quantity: 25, fees: 2 },
  { account: "demo-pea", symbol: "SU.PA", monthOffset: 0, dayOffset: 2, type: "BUY", quantity: 6, fees: 2 },
  { account: "demo-pea", symbol: "ASML.AS", monthOffset: 0, dayOffset: 3, type: "BUY", quantity: 2, fees: 3 },
  { account: "demo-pea", symbol: "AIR.PA", monthOffset: 13, dayOffset: 4, type: "BUY", quantity: 5, fees: 2 },
  { account: "demo-pea", symbol: "MC.PA", monthOffset: 20, dayOffset: 2, type: "SELL", quantity: 1, fees: 2 },
  { account: "demo-pea", symbol: "TTE.PA", monthOffset: 24, dayOffset: 3, type: "BUY", quantity: 15, fees: 2 },
  // Compte-titres — US stocks
  { account: "demo-cto", symbol: "AAPL", monthOffset: 0, dayOffset: 7, type: "BUY", quantity: 15, fees: 1 },
  { account: "demo-cto", symbol: "MSFT", monthOffset: 0, dayOffset: 7, type: "BUY", quantity: 8, fees: 1 },
  { account: "demo-cto", symbol: "NVDA", monthOffset: 0, dayOffset: 8, type: "BUY", quantity: 30, fees: 1 },
  { account: "demo-cto", symbol: "GOOGL", monthOffset: 0, dayOffset: 8, type: "BUY", quantity: 10, fees: 1 },
  { account: "demo-cto", symbol: "O", monthOffset: 1, dayOffset: 3, type: "BUY", quantity: 40, fees: 1 },
  { account: "demo-cto", symbol: "AMZN", monthOffset: 6, dayOffset: 10, type: "BUY", quantity: 8, fees: 1 },
  { account: "demo-cto", symbol: "NVDA", monthOffset: 11, dayOffset: 5, type: "SELL", quantity: 10, fees: 1 },
  { account: "demo-cto", symbol: "LLY", monthOffset: 15, dayOffset: 2, type: "BUY", quantity: 2, fees: 1 },
  { account: "demo-cto", symbol: "META", monthOffset: 22, dayOffset: 6, type: "BUY", quantity: 4, fees: 1 },
  // Crypto
  { account: "demo-crypto", symbol: "BTC-EUR", monthOffset: 1, dayOffset: 10, type: "BUY", budget: 2500, fees: 5 },
  { account: "demo-crypto", symbol: "ETH-EUR", monthOffset: 1, dayOffset: 10, type: "BUY", budget: 1500, fees: 3 },
  { account: "demo-crypto", symbol: "ETH-EUR", monthOffset: 12, dayOffset: 3, type: "SELL", quantity: 0.2, fees: 2 },
];

function roundQty(q: number) {
  return q >= 1 ? Math.floor(q * 100) / 100 : Math.floor(q * 1e6) / 1e6;
}

export function buildDemoTransactions(tables: MarketTables, today: DayKey): Transaction[] {
  const start = demoStartDay(today);
  const txs: Transaction[] = [];
  let seq = 0;
  const push = (tx: Omit<Transaction, "id" | "createdAt">) => {
    seq += 1;
    txs.push({ ...tx, id: `demo-${seq}`, createdAt: seq });
  };
  const priceOn = (symbol: string, day: DayKey) => tables.closeOn(symbol, day);
  const currency = (symbol: string) => tables.currencyOf(symbol) ?? "EUR";

  // PEA: initial deposit, monthly deposits and a monthly CW8 purchase.
  push({ accountId: "demo-pea", type: "DEPOSIT", date: start, amount: 12_000, currency: "EUR", note: "Versement initial" });
  let peaCash = 12_000;
  const planned: { day: DayKey; plan: TradePlan }[] = PLAN.map((plan) => ({
    day: nextWeekday(addDays(addMonths(start, plan.monthOffset), plan.dayOffset ?? 0)),
    plan,
  }));

  for (let m = 0; ; m++) {
    const monthStart = addMonths(start, m);
    if (monthStart > today) break;
    const depositDay = nextWeekday(addDays(monthStart, 4));
    const buyDay = nextWeekday(addDays(monthStart, 6));
    if (m > 0 && depositDay <= today) {
      push({ accountId: "demo-pea", type: "DEPOSIT", date: depositDay, amount: 650, currency: "EUR", note: "Versement mensuel" });
      peaCash += 650;
    }
    // Planned trades of this month, in date order.
    for (const { day, plan } of planned.filter((p) => p.plan.monthOffset === m).sort((a, b) => a.day.localeCompare(b.day))) {
      if (day > today) continue;
      const price = priceOn(plan.symbol, day);
      if (!price) continue;
      const quantity = plan.quantity ?? roundQty((plan.budget ?? 0) / price);
      if (!quantity) continue;
      if (plan.account === "demo-pea") {
        const cost = quantity * price * (plan.type === "BUY" ? 1 : -1) + (plan.fees ?? 0);
        if (plan.type === "BUY" && cost > peaCash) {
          const topUp = Math.ceil((cost - peaCash + 200) / 100) * 100;
          push({ accountId: "demo-pea", type: "DEPOSIT", date: day, amount: topUp, currency: "EUR", note: "Versement complémentaire" });
          peaCash += topUp;
        }
        peaCash -= cost;
      }
      push({
        accountId: plan.account,
        type: plan.type,
        date: day,
        symbol: plan.symbol,
        quantity,
        price: Math.round(price * 100) / 100,
        fees: plan.fees,
        currency: currency(plan.symbol),
      });
    }
    // Monthly world ETF purchase in the PEA.
    if (buyDay <= today) {
      const price = priceOn("CW8.PA", buyDay);
      if (price) {
        const cost = price + 1;
        if (cost > peaCash) {
          const topUp = Math.ceil((cost - peaCash + 200) / 100) * 100;
          push({ accountId: "demo-pea", type: "DEPOSIT", date: buyDay, amount: topUp, currency: "EUR", note: "Versement complémentaire" });
          peaCash += topUp;
        }
        push({
          accountId: "demo-pea",
          type: "BUY",
          date: buyDay,
          symbol: "CW8.PA",
          quantity: 1,
          price: Math.round(price * 100) / 100,
          fees: 1,
          currency: "EUR",
          note: "Investissement programmé",
        });
        peaCash -= cost;
      }
    }
    // Monthly bitcoin DCA.
    const dcaDay = nextWeekday(addDays(monthStart, 14));
    if (m >= 2 && dcaDay <= today) {
      const price = priceOn("BTC-EUR", dcaDay);
      if (price) {
        push({
          accountId: "demo-crypto",
          type: "BUY",
          date: dcaDay,
          symbol: "BTC-EUR",
          quantity: roundQty(100 / price),
          price: Math.round(price * 100) / 100,
          fees: 1,
          currency: "EUR",
          note: "DCA mensuel",
        });
      }
    }
  }
  // Yearly custody fees on the stock account.
  for (let y = 1; ; y++) {
    const d = nextWeekday(addMonths(start, 12 * y));
    if (d > today) break;
    push({ accountId: "demo-cto", type: "FEE", date: d, amount: 12, currency: "EUR", note: "Droits de garde" });
  }
  return txs.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}
