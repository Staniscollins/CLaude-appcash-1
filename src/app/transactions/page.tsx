"use client";

import { ArrowDownLeft, ArrowUpRight, Banknote, Coins, Download, FileUp, Landmark, Plus, Receipt, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { PageHeader } from "@/components/shell/app-shell";
import { AssetLogo } from "@/components/ui/asset-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { Badge, EmptyState, Input, Switch } from "@/components/ui/primitives";
import { downloadFile } from "@/lib/download";
import { formatDate, formatMoney, formatPrice, formatQuantity, capitalize } from "@/lib/format";
import { transactionsToCsv } from "@/lib/portfolio/csv";
import { sortTransactions, txFx } from "@/lib/portfolio/engine";
import { TRANSACTION_LABELS, type Transaction, type TransactionType } from "@/lib/portfolio/types";
import { useAppStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

type Filter = "all" | "trades" | "BUY" | "SELL" | "DIVIDEND" | "cash";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "BUY", label: "Achats" },
  { value: "SELL", label: "Ventes" },
  { value: "DIVIDEND", label: "Dividendes" },
  { value: "cash", label: "Espèces & frais" },
];

const ICONS: Record<TransactionType, { icon: ReactNode; tone: string }> = {
  BUY: { icon: <ArrowDownLeft className="size-4" />, tone: "bg-accent-soft text-accent" },
  SELL: { icon: <ArrowUpRight className="size-4" />, tone: "bg-warning/12 text-warning" },
  DIVIDEND: { icon: <Coins className="size-4" />, tone: "bg-gain/12 text-gain" },
  DEPOSIT: { icon: <Landmark className="size-4" />, tone: "bg-surface-3 text-fg" },
  WITHDRAWAL: { icon: <Banknote className="size-4" />, tone: "bg-surface-3 text-fg" },
  FEE: { icon: <Receipt className="size-4" />, tone: "bg-loss/12 text-loss" },
  TAX: { icon: <Receipt className="size-4" />, tone: "bg-loss/12 text-loss" },
  INTEREST: { icon: <Coins className="size-4" />, tone: "bg-gain/12 text-gain" },
};

function signedAmount(t: Transaction): number {
  switch (t.type) {
    case "BUY":
      return -((t.quantity ?? 0) * (t.price ?? 0) + (t.fees ?? 0));
    case "SELL":
      return (t.quantity ?? 0) * (t.price ?? 0) - (t.fees ?? 0);
    case "DIVIDEND":
      return (t.amount ?? 0) - (t.fees ?? 0);
    case "DEPOSIT":
    case "INTEREST":
      return t.amount ?? 0;
    default:
      return -Math.abs(t.amount ?? 0);
  }
}

export default function TransactionsPage() {
  const { transactions, snapshot, accounts, meta, tables, settings, hydrated } = usePortfolio();
  const openTransaction = useUiStore((s) => s.openTransaction);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const allTransactions = useAppStore((s) => s.transactions);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [showAuto, setShowAuto] = useState(true);
  const base = settings.baseCurrency;
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const list = useMemo(() => {
    const autos = showAuto ? snapshot.dividendTransactions.filter((t) => t.auto) : [];
    const q = query.trim().toLowerCase();
    return sortTransactions([...transactions, ...autos])
      .reverse()
      .filter((t) => {
        if (filter === "cash" && !["DEPOSIT", "WITHDRAWAL", "FEE", "TAX", "INTEREST"].includes(t.type)) return false;
        if (filter !== "all" && filter !== "cash" && t.type !== filter) return false;
        if (!q) return true;
        const name = t.symbol ? meta(t.symbol).name : "";
        return `${t.symbol ?? ""} ${name} ${t.note ?? ""} ${TRANSACTION_LABELS[t.type]}`.toLowerCase().includes(q);
      });
  }, [transactions, snapshot.dividendTransactions, showAuto, filter, query, meta]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of list) {
      const k = t.date.slice(0, 7);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    }
    return [...map.entries()];
  }, [list]);

  const totals = useMemo(() => {
    let buys = 0;
    let sells = 0;
    let divs = 0;
    let fees = 0;
    for (const t of list) {
      const fx = txFx(t, tables);
      if (t.type === "BUY") buys += (t.quantity ?? 0) * (t.price ?? 0) * fx;
      if (t.type === "SELL") sells += (t.quantity ?? 0) * (t.price ?? 0) * fx;
      if (t.type === "DIVIDEND") divs += ((t.amount ?? 0) - (t.fees ?? 0)) * fx;
      if (t.type === "BUY" || t.type === "SELL") fees += (t.fees ?? 0) * fx;
      if (t.type === "FEE" || t.type === "TAX") fees += Math.abs(t.amount ?? 0) * fx;
    }
    return { buys, sells, divs, fees };
  }, [list, tables]);

  const exportCsv = () => {
    downloadFile(
      `lumen-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      `﻿${transactionsToCsv(allTransactions, accounts)}`,
      "text/csv;charset=utf-8",
    );
    toast.success("Export CSV téléchargé");
  };

  const onRowClick = (t: Transaction) => {
    if (t.auto) {
      toast("Dividende détecté automatiquement", {
        description: "Estimation brute calculée à partir des données de marché. Saisissez le montant réellement perçu pour la remplacer.",
        action: {
          label: "Saisir",
          onClick: () =>
            openTransaction({
              initial: {
                type: "DIVIDEND",
                symbol: t.symbol,
                date: t.date,
                accountId: t.accountId,
                currency: t.currency,
                amount: Math.round((t.amount ?? 0) * 100) / 100,
              },
            }),
        },
      });
      return;
    }
    openTransaction({ editId: t.id });
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Historique complet de vos opérations. Cliquez sur une ligne pour la modifier."
        actions={
          <>
            <Button variant="ghost" onClick={() => setImportOpen(true)}>
              <FileUp /> Importer
            </Button>
            <Button variant="ghost" onClick={exportCsv} disabled={!allTransactions.length}>
              <Download /> Exporter
            </Button>
            <Button variant="primary" onClick={() => openTransaction()}>
              <Plus /> Ajouter
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Achats", value: totals.buys },
          { label: "Ventes", value: totals.sells },
          { label: "Dividendes nets", value: totals.divs },
          { label: "Frais & impôts", value: totals.fees },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-border"
          >
            <div className="text-xs text-muted">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tracking-tight">
              <Money value={s.value} currency={base} decimals={0} />
            </div>
          </motion.div>
        ))}
      </div>

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (valeur, note…)" className="h-9 pl-9" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium ring-1 transition",
                  filter === f.value
                    ? "bg-accent-soft text-accent ring-accent/30"
                    : "text-muted ring-border hover:bg-surface-2 hover:text-fg",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted sm:ml-auto">
            <Switch checked={showAuto} onCheckedChange={setShowAuto} label="Dividendes détectés" />
            Dividendes détectés
          </label>
        </div>

        {!hydrated ? null : !list.length ? (
          <EmptyState
            icon={<Receipt />}
            title={transactions.length ? "Aucun résultat" : "Aucune transaction"}
            description={
              transactions.length ? "Modifiez les filtres." : "Ajoutez vos achats et ventes, ou importez un export CSV de votre courtier."
            }
            action={
              !transactions.length && (
                <Button variant="primary" onClick={() => openTransaction()}>
                  <Plus /> Ajouter une transaction
                </Button>
              )
            }
          />
        ) : (
          <div>
            {groups.map(([month, txs]) => (
              <section key={month}>
                <h3 className="sticky top-16 z-10 flex items-center justify-between border-b border-border bg-surface/90 px-5 py-2 text-xs font-medium text-muted backdrop-blur">
                  <span>{capitalize(formatDate(`${month}-01`, "month"))}</span>
                  <span>
                    {txs.length} opération{txs.length > 1 ? "s" : ""}
                  </span>
                </h3>
                <ul>
                  {txs.map((t) => {
                    const m = t.symbol ? meta(t.symbol) : null;
                    const acc = accountById.get(t.accountId);
                    const amount = signedAmount(t);
                    const { icon, tone } = ICONS[t.type];
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onRowClick(t)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2/60 sm:px-5"
                        >
                          <div className="relative shrink-0">
                            {m ? (
                              <AssetLogo symbol={m.symbol} name={m.name} logoUrl={m.logoUrl} type={m.type} size={36} />
                            ) : (
                              <span className={cn("grid size-9 place-items-center rounded-xl", tone)}>{icon}</span>
                            )}
                            {m && (
                              <span
                                className={cn(
                                  "absolute -right-1.5 -bottom-1.5 grid size-[18px] place-items-center rounded-full bg-surface ring-2 ring-surface [&_svg]:size-2.5",
                                  tone,
                                )}
                              >
                                {icon}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">
                                {TRANSACTION_LABELS[t.type]}
                                {m ? ` · ${m.name}` : ""}
                              </span>
                              {t.auto && (
                                <Badge tone="accent">
                                  <Sparkles className="size-3" /> Auto
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-subtle">
                              <span>{formatDate(t.date, "medium")}</span>
                              {t.quantity != null && t.price != null && (
                                <>
                                  <span>·</span>
                                  <span className="tabular">
                                    {formatQuantity(t.quantity)} × {formatPrice(t.price, t.currency)}
                                  </span>
                                </>
                              )}
                              {acc && (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="size-1.5 rounded-full" style={{ background: acc.color }} />
                                    {acc.name}
                                  </span>
                                </>
                              )}
                              {t.note && <span className="hidden truncate md:inline">· {t.note}</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={cn("text-sm font-semibold tabular sensitive", amount > 0 ? "text-gain" : "text-fg")}>
                              {formatMoney(amount, t.currency, { sign: true })}
                            </div>
                            {t.fees ? <div className="text-[11px] text-subtle">frais {formatMoney(t.fees, t.currency)}</div> : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
