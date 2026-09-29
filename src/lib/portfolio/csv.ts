import Papa from "papaparse";
import { isValidDayKey, type DayKey } from "../dates";
import type { Account, Transaction, TransactionType } from "./types";

/** Parses numbers written as "1 234,56", "1,234.56", "12.5 €", "-3,2"… */
export function parseNumberLoose(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input !== "string") return undefined;
  let s = input.replace(/[\s  ']/g, "").replace(/[^\d,.\-+eE]/g, "");
  if (!s || s === "-" || s === "+") return undefined;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const commas = (s.match(/,/g) ?? []).length;
    s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Parses "2024-03-15", "15/03/2024", "15.03.2024", "15-03-2024", ISO date-times. */
export function parseDateLoose(input: unknown): DayKey | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const key = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isValidDayKey(key) ? key : undefined;
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    let day = m[1];
    let month = m[2];
    if (Number(month) > 12 && Number(day) <= 12) [day, month] = [month, day];
    const key = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return isValidDayKey(key) ? key : undefined;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return undefined;
}

const TYPE_SYNONYMS: [RegExp, TransactionType][] = [
  [/^(achat|buy|a|purchase|souscription|bought)$/i, "BUY"],
  [/^(vente|sell|v|sale|sold|cession)$/i, "SELL"],
  [/^(dividende?s?|dividend|coupon|distribution)$/i, "DIVIDEND"],
  [/^(d[ée]p[ôo]t|deposit|versement|apport|virement entrant)$/i, "DEPOSIT"],
  [/^(retrait|withdrawal|rachat|virement sortant)$/i, "WITHDRAWAL"],
  [/^(frais|fee|fees|commission|droits de garde)$/i, "FEE"],
  [/^(int[ée]r[êe]ts?|interest)$/i, "INTEREST"],
  [/^(imp[ôo]ts?|tax|taxes?|pr[ée]l[èe]vements? sociaux|ttf)$/i, "TAX"],
];

export function parseTransactionType(input: unknown): TransactionType | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  if (["BUY", "SELL", "DIVIDEND", "DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TAX"].includes(s.toUpperCase())) {
    return s.toUpperCase() as TransactionType;
  }
  for (const [re, type] of TYPE_SYNONYMS) if (re.test(s)) return type;
  if (/achat|buy/i.test(s)) return "BUY";
  if (/vente|sell/i.test(s)) return "SELL";
  if (/divid|coupon/i.test(s)) return "DIVIDEND";
  return undefined;
}

export type CsvField = "date" | "type" | "symbol" | "quantity" | "price" | "amount" | "fees" | "currency" | "account" | "fxRate" | "note";

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  date: "Date",
  type: "Type",
  symbol: "Symbole / ISIN",
  quantity: "Quantité",
  price: "Prix unitaire",
  amount: "Montant",
  fees: "Frais",
  currency: "Devise",
  account: "Compte",
  fxRate: "Taux de change",
  note: "Note",
};

const HEADER_SYNONYMS: Record<CsvField, RegExp> = {
  date: /^(date|jour|trade ?date|date d'?op[ée]ration|datum|execution date)$/i,
  type: /^(type|op[ée]ration|sens|action|transaction|nature|side)$/i,
  symbol: /^(symbol|symbole|ticker|code|isin|valeur|instrument|actif|asset)$/i,
  quantity: /^(quantit[ée]|qt[ée]|quantity|nombre|shares|qty|units|parts)$/i,
  price: /^(prix|cours|price|prix unitaire|unit price|cours d'?ex[ée]cution)$/i,
  amount: /^(montant|amount|total|montant net|net amount|value)$/i,
  fees: /^(frais|fees|commission|courtage|fee)$/i,
  currency: /^(devise|currency|monnaie|ccy)$/i,
  account: /^(compte|account|portefeuille|portfolio|enveloppe)$/i,
  fxRate: /^(taux[ _]de[ _]change|taux_change|fx|fx ?rate|change)$/i,
  note: /^(note|commentaire|comment|libell[ée]|description)$/i,
};

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  mapping: Partial<Record<CsvField, string>>;
}

export function readCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).filter(Boolean);
  const mapping: Partial<Record<CsvField, string>> = {};
  for (const field of Object.keys(HEADER_SYNONYMS) as CsvField[]) {
    const match = headers.find((h) => HEADER_SYNONYMS[field].test(h));
    if (match) mapping[field] = match;
  }
  return { headers, rows: result.data, mapping };
}

export interface RowIssue {
  row: number;
  message: string;
}

export function isIsin(value: string) {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value.trim().toUpperCase());
}

/** Converts mapped CSV rows into transactions; unknown accounts fall back to `defaultAccountId`. */
export function rowsToTransactions(
  parsed: ParsedCsv,
  mapping: Partial<Record<CsvField, string>>,
  opts: { accounts: Account[]; defaultAccountId: string; defaultCurrency: string; symbolMap?: Record<string, string> },
): { transactions: Omit<Transaction, "id" | "createdAt">[]; issues: RowIssue[] } {
  const transactions: Omit<Transaction, "id" | "createdAt">[] = [];
  const issues: RowIssue[] = [];
  const get = (row: Record<string, string>, f: CsvField) => (mapping[f] ? row[mapping[f] as string] : undefined);

  parsed.rows.forEach((row, i) => {
    const line = i + 2;
    const date = parseDateLoose(get(row, "date"));
    if (!date) return issues.push({ row: line, message: "date illisible" });
    let quantity = parseNumberLoose(get(row, "quantity"));
    let type = parseTransactionType(get(row, "type"));
    if (!type && quantity != null) type = quantity < 0 ? "SELL" : "BUY";
    if (!type) return issues.push({ row: line, message: "type d'opération inconnu" });
    const rawSymbol = get(row, "symbol")?.trim().toUpperCase();
    const symbol = rawSymbol ? (opts.symbolMap?.[rawSymbol] ?? rawSymbol) : undefined;
    const price = parseNumberLoose(get(row, "price"));
    let amount = parseNumberLoose(get(row, "amount"));
    const fees = parseNumberLoose(get(row, "fees"));
    const currency = (get(row, "currency")?.trim() || opts.defaultCurrency).slice(0, 3).toUpperCase();
    const accountName = get(row, "account")?.trim().toLowerCase();
    const account = accountName
      ? opts.accounts.find((a) => a.name.toLowerCase() === accountName || a.type.toLowerCase() === accountName)
      : undefined;
    const fxRate = parseNumberLoose(get(row, "fxRate"));
    if (quantity != null) quantity = Math.abs(quantity);
    if (amount != null && type !== "DIVIDEND" && type !== "INTEREST") amount = Math.abs(amount);

    if (type === "BUY" || type === "SELL") {
      if (!symbol) return issues.push({ row: line, message: "symbole manquant" });
      if (!quantity) return issues.push({ row: line, message: "quantité manquante" });
      let unit = price;
      if (unit == null && amount != null) unit = Math.max(0, (Math.abs(amount) - (type === "BUY" ? (fees ?? 0) : -(fees ?? 0))) / quantity);
      if (unit == null) return issues.push({ row: line, message: "prix manquant" });
      transactions.push({
        accountId: account?.id ?? opts.defaultAccountId,
        type,
        date,
        symbol,
        quantity,
        price: unit,
        fees: fees != null ? Math.abs(fees) : undefined,
        currency,
        fxRate: fxRate && fxRate > 0 ? fxRate : undefined,
        note: get(row, "note")?.trim() || undefined,
      });
      return;
    }
    if (amount == null) return issues.push({ row: line, message: "montant manquant" });
    transactions.push({
      accountId: account?.id ?? opts.defaultAccountId,
      type,
      date,
      symbol: type === "DIVIDEND" ? symbol : undefined,
      amount: Math.abs(amount),
      fees: fees != null ? Math.abs(fees) : undefined,
      currency,
      fxRate: fxRate && fxRate > 0 ? fxRate : undefined,
      note: get(row, "note")?.trim() || undefined,
    });
  });
  return { transactions, issues };
}

const EXPORT_COLUMNS = ["date", "type", "compte", "symbole", "quantite", "prix", "montant", "frais", "devise", "taux_change", "note"];

export function transactionsToCsv(transactions: Transaction[], accounts: Account[]): string {
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  const num = (n: number | undefined) => (n == null ? "" : String(n).replace(".", ","));
  const rows = [...transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((t) => [
      t.date,
      t.type,
      names.get(t.accountId) ?? "",
      t.symbol ?? "",
      num(t.quantity),
      num(t.price),
      num(t.amount),
      num(t.fees),
      t.currency,
      num(t.fxRate),
      (t.note ?? "").replace(/[\r\n;]+/g, " "),
    ]);
  return Papa.unparse({ fields: EXPORT_COLUMNS, data: rows }, { delimiter: ";" });
}

/** Re-maps our own export headers so they are recognized on import. */
export const OWN_EXPORT_MAPPING: Partial<Record<CsvField, string>> = {
  date: "date",
  type: "type",
  account: "compte",
  symbol: "symbole",
  quantity: "quantite",
  price: "prix",
  amount: "montant",
  fees: "frais",
  currency: "devise",
  fxRate: "taux_change",
  note: "note",
};
