"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Trash } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useQuote } from "@/hooks/use-market";
import { api } from "@/lib/api";
import { addDays, localDayKey, type DayKey } from "@/lib/dates";
import { formatDate, formatMoney, formatPrice, formatQuantity, parentCurrency } from "@/lib/format";
import { catalogEntry } from "@/lib/market/catalog";
import { parseNumberLoose } from "@/lib/portfolio/csv";
import { ACCOUNT_TYPE_LABELS, TRANSACTION_LABELS, type AccountType, type Transaction, type TransactionType } from "@/lib/portfolio/types";
import { useAppStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { SymbolPicker } from "./symbol-picker";

type Kind = "BUY" | "SELL" | "DIVIDEND" | "CASH";
type CashType = "DEPOSIT" | "WITHDRAWAL" | "FEE" | "INTEREST" | "TAX";

interface FormState {
  kind: Kind;
  cashType: CashType;
  accountId: string;
  symbol: string;
  date: DayKey;
  quantity: string;
  price: string;
  priceTouched: boolean;
  fees: string;
  amount: string;
  currency: string;
  /** The user picked the currency explicitly (otherwise trades use the instrument currency). */
  currencyTouched: boolean;
  fxRate: string;
  note: string;
}

const CURRENCIES = ["EUR", "USD", "GBP", "GBp", "CHF", "DKK", "SEK", "NOK", "JPY", "CAD", "HKD"];

function kindOf(type: TransactionType): Kind {
  if (type === "BUY" || type === "SELL" || type === "DIVIDEND") return type;
  return "CASH";
}

/** Closing price of a symbol on a given day (history endpoint). */
function useHistoricalClose(symbol: string, date: DayKey) {
  const today = localDayKey();
  return useQuery({
    queryKey: ["close", symbol, date],
    enabled: !!symbol && !!date && date < today,
    staleTime: 60 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await api.history([symbol], addDays(date, -12), signal);
      const s = res.data[symbol];
      if (!s?.d) return null;
      let close: number | null = null;
      let day: string | null = null;
      for (let i = 0; i < s.d.length; i++) {
        if (s.d[i] > date) break;
        close = s.c[i];
        day = s.d[i];
      }
      return close != null ? { close, day: day as string, currency: s.currency } : null;
    },
  });
}

export function TransactionDialog() {
  const dialog = useUiStore((s) => s.txDialog);
  const close = useUiStore((s) => s.closeTransaction);
  return (
    <Dialog
      open={dialog.open}
      onOpenChange={(o) => !o && close()}
      title={dialog.editId ? "Modifier la transaction" : "Nouvelle transaction"}
      size="md"
    >
      {dialog.open && <TransactionForm key={`${dialog.editId ?? "new"}-${JSON.stringify(dialog.initial ?? {})}`} />}
    </Dialog>
  );
}

function TransactionForm() {
  const { editId, initial } = useUiStore((s) => s.txDialog);
  const close = useUiStore((s) => s.closeTransaction);
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const accountFilter = useAppStore((s) => s.accountFilter);
  const base = useAppStore((s) => s.settings.baseCurrency);
  const addTransactions = useAppStore((s) => s.addTransactions);
  const updateTransaction = useAppStore((s) => s.updateTransaction);
  const deleteTransactions = useAppStore((s) => s.deleteTransactions);
  const restoreTransactions = useAppStore((s) => s.restoreTransactions);
  const addAccount = useAppStore((s) => s.addAccount);
  const { tables } = usePortfolio();
  const today = localDayKey();

  const editing = editId ? transactions.find((t) => t.id === editId) : undefined;
  const seed: Partial<Transaction> = editing ?? initial ?? {};
  const defaultAccount = seed.accountId ?? (accountFilter !== "all" ? accountFilter : accounts[0]?.id) ?? "";

  const [form, setForm] = useState<FormState>(() => ({
    kind: seed.type ? kindOf(seed.type) : "BUY",
    cashType: seed.type && kindOf(seed.type) === "CASH" ? (seed.type as CashType) : "DEPOSIT",
    accountId: defaultAccount,
    symbol: seed.symbol ?? "",
    date: seed.date ?? today,
    quantity: seed.quantity != null ? String(seed.quantity).replace(".", ",") : "",
    price: seed.price != null ? String(seed.price).replace(".", ",") : "",
    priceTouched: seed.price != null,
    fees: seed.fees != null ? String(seed.fees).replace(".", ",") : "",
    amount: seed.amount != null ? String(seed.amount).replace(".", ",") : "",
    currency: seed.currency ?? base,
    currencyTouched: seed.currency != null,
    fxRate: seed.fxRate != null ? String(seed.fxRate).replace(".", ",") : "",
    note: seed.note ?? "",
  }));
  const [newAccount, setNewAccount] = useState({ name: "PEA", type: "PEA" as AccountType });
  const [submitted, setSubmitted] = useState(false);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const isTrade = form.kind === "BUY" || form.kind === "SELL";
  const quote = useQuote(form.symbol || undefined);
  const hist = useHistoricalClose(isTrade ? form.symbol : "", form.date);
  const instrumentCurrency = quote.data?.currency ?? catalogEntry(form.symbol)?.currency;

  // Trades are recorded in the instrument currency unless the user picked another one.
  const currency = isTrade && !editing && !form.currencyTouched && instrumentCurrency ? instrumentCurrency : form.currency;

  // Suggested price: close of the chosen day, or the live price for today. It fills the
  // price field until the user types their own.
  const suggested = form.date >= today ? (quote.data ? { close: quote.data.price, day: today } : null) : (hist.data ?? null);
  const suggestedText = suggested ? String(Number(suggested.close.toFixed(suggested.close >= 1 ? 2 : 6))).replace(".", ",") : null;
  const priceText = isTrade && !form.priceTouched && suggestedText ? suggestedText : form.price;

  const qty = parseNumberLoose(form.quantity);
  const price = parseNumberLoose(priceText);
  const fees = parseNumberLoose(form.fees) ?? 0;
  const amount = parseNumberLoose(form.amount);
  const fxRate = parseNumberLoose(form.fxRate);

  const available = useMemo(() => {
    if (!form.symbol || !form.accountId) return 0;
    let q = 0;
    for (const t of transactions) {
      if (t.id === editId || t.accountId !== form.accountId || t.symbol !== form.symbol) continue;
      if (t.type === "BUY") q += t.quantity ?? 0;
      if (t.type === "SELL") q -= t.quantity ?? 0;
    }
    return Math.max(0, q);
  }, [transactions, form.symbol, form.accountId, editId]);

  const total =
    isTrade && qty && price
      ? qty * price + (form.kind === "BUY" ? fees : -fees)
      : form.kind === "DIVIDEND"
        ? (amount ?? 0) - fees
        : (amount ?? 0);
  const fxNow = fxRate ?? tables.fxNow(currency);
  const showFx = parentCurrency(currency) !== base;

  const errors: Partial<Record<"account" | "symbol" | "quantity" | "price" | "amount" | "date", string>> = {};
  if (!accounts.length && !newAccount.name.trim()) errors.account = "Nommez le compte";
  if (accounts.length && !form.accountId) errors.account = "Choisissez un compte";
  if (!form.date || form.date > today) errors.date = "Date invalide (pas de date future)";
  if (isTrade) {
    if (!form.symbol) errors.symbol = "Choisissez une valeur";
    if (!qty || qty <= 0) errors.quantity = "Quantité > 0";
    else if (form.kind === "SELL" && qty > available + 1e-9)
      errors.quantity = `Vous détenez ${formatQuantity(available)} titre(s) sur ce compte`;
    if (!price || price <= 0) errors.price = "Prix > 0";
  } else if (!amount || amount <= 0) errors.amount = "Montant > 0";
  const valid = Object.keys(errors).length === 0;

  const save = () => {
    setSubmitted(true);
    if (!valid) return;
    let accountId = form.accountId;
    if (!accounts.length) accountId = addAccount({ name: newAccount.name.trim(), type: newAccount.type }).id;
    const type: TransactionType = form.kind === "CASH" ? form.cashType : form.kind;
    const tx: Omit<Transaction, "id" | "createdAt"> = {
      accountId,
      type,
      date: form.date,
      currency,
      note: form.note.trim() || undefined,
      fxRate: showFx && fxRate && fxRate > 0 ? fxRate : undefined,
      ...(isTrade
        ? { symbol: form.symbol, quantity: qty, price, fees: fees || undefined }
        : form.kind === "DIVIDEND"
          ? { symbol: form.symbol || undefined, amount, fees: fees || undefined }
          : { amount }),
    };
    const label = `${TRANSACTION_LABELS[type]}${tx.symbol ? ` · ${tx.symbol}` : ""}`;
    if (editing) {
      updateTransaction(editing.id, {
        ...tx,
        symbol: tx.symbol,
        quantity: tx.quantity,
        price: tx.price,
        amount: tx.amount,
        fees: tx.fees,
        fxRate: tx.fxRate,
      });
      toast.success("Transaction modifiée", { description: label });
    } else {
      const [created] = addTransactions([tx]);
      toast.success("Transaction enregistrée", {
        description: label,
        action: { label: "Annuler", onClick: () => deleteTransactions([created.id]) },
      });
    }
    close();
  };

  const remove = () => {
    if (!editing) return;
    const removed = deleteTransactions([editing.id]);
    toast("Transaction supprimée", { action: { label: "Annuler", onClick: () => restoreTransactions(removed) } });
    close();
  };

  const err = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col gap-5"
    >
      <Segmented
        stretch
        size="md"
        ariaLabel="Type d'opération"
        value={form.kind}
        onChange={(kind) => set({ kind, currency: kind === "BUY" || kind === "SELL" ? form.currency : base, currencyTouched: false })}
        options={[
          { value: "BUY", label: "Achat" },
          { value: "SELL", label: "Vente" },
          { value: "DIVIDEND", label: "Dividende" },
          { value: "CASH", label: "Espèces & frais" },
        ]}
      />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={form.kind}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          className="flex flex-col gap-4"
        >
          {form.kind === "CASH" && (
            <Field label="Opération">
              <Select value={form.cashType} onChange={(e) => set({ cashType: e.target.value as CashType })}>
                {(["DEPOSIT", "WITHDRAWAL", "FEE", "INTEREST", "TAX"] as CashType[]).map((t) => (
                  <option key={t} value={t}>
                    {TRANSACTION_LABELS[t]}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {(isTrade || form.kind === "DIVIDEND") && (
            <Field label={form.kind === "DIVIDEND" ? "Valeur (facultatif)" : "Valeur"} error={err("symbol")}>
              <SymbolPicker
                value={form.symbol}
                onChange={(symbol) => set({ symbol, price: "", priceTouched: false, currencyTouched: false })}
                autoFocus={!form.symbol}
                invalid={!!err("symbol")}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            {accounts.length ? (
              <Field label="Compte" error={err("account")}>
                <Select value={form.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {ACCOUNT_TYPE_LABELS[a.type]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Nouveau compte" error={err("account")} hint="Créé à l'enregistrement">
                <div className="flex gap-2">
                  <Input
                    value={newAccount.name}
                    onChange={(e) => setNewAccount((a) => ({ ...a, name: e.target.value }))}
                    className="min-w-0"
                  />
                  <Select
                    value={newAccount.type}
                    onChange={(e) =>
                      setNewAccount({ type: e.target.value as AccountType, name: ACCOUNT_TYPE_LABELS[e.target.value as AccountType] })
                    }
                    className="w-28 shrink-0"
                  >
                    {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                      <option key={t} value={t}>
                        {ACCOUNT_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
              </Field>
            )}
            <Field label="Date" error={err("date")}>
              <div className="relative">
                <Input type="date" value={form.date} max={today} onChange={(e) => set({ date: e.target.value, priceTouched: false })} />
                <CalendarDays className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle sm:hidden" />
              </div>
            </Field>
          </div>

          {isTrade ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Quantité"
                  error={err("quantity")}
                  hint={
                    form.kind === "SELL" && form.symbol ? (
                      <button
                        type="button"
                        className="text-accent hover:underline"
                        onClick={() => set({ quantity: String(available).replace(".", ",") })}
                      >
                        Tout vendre ({formatQuantity(available)})
                      </button>
                    ) : undefined
                  }
                >
                  <Input inputMode="decimal" placeholder="0" value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
                </Field>
                <Field
                  label={`Prix unitaire (${currency})`}
                  error={err("price")}
                  hint={
                    suggested ? (
                      <button
                        type="button"
                        className="text-left hover:text-fg"
                        onClick={() => set({ price: suggestedText ?? "", priceTouched: true })}
                      >
                        {suggested.day === today ? "Cours actuel" : `Clôture du ${formatDate(suggested.day, "short")}`} :{" "}
                        {formatPrice(suggested.close, currency)}
                      </button>
                    ) : hist.isFetching ? (
                      "Recherche du cours…"
                    ) : undefined
                  }
                >
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={priceText}
                    onChange={(e) => set({ price: e.target.value, priceTouched: true })}
                  />
                </Field>
              </div>
              <Field label={`Frais de courtage (${currency})`}>
                <Input inputMode="decimal" placeholder="0,00" value={form.fees} onChange={(e) => set({ fees: e.target.value })} />
              </Field>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={form.kind === "DIVIDEND" ? "Montant brut" : "Montant"} error={err("amount")}>
                <Input inputMode="decimal" placeholder="0,00" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
              </Field>
              {form.kind === "DIVIDEND" ? (
                <Field label="Retenue / impôts">
                  <Input inputMode="decimal" placeholder="0,00" value={form.fees} onChange={(e) => set({ fees: e.target.value })} />
                </Field>
              ) : (
                <Field label="Devise">
                  <Select value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          )}

          {(isTrade || form.kind === "DIVIDEND") && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Devise">
                <Select value={currency} onChange={(e) => set({ currency: e.target.value, currencyTouched: true })}>
                  {[...new Set([currency, ...CURRENCIES])].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              {showFx ? (
                <Field label={`Taux ${parentCurrency(currency)} → ${base}`} hint="Vide : taux historique du jour">
                  <Input
                    inputMode="decimal"
                    placeholder={tables.fxNow(currency).toFixed(4).replace(".", ",")}
                    value={form.fxRate}
                    onChange={(e) => set({ fxRate: e.target.value })}
                  />
                </Field>
              ) : (
                <div />
              )}
            </div>
          )}

          <Field label="Note">
            <Textarea
              rows={2}
              className="min-h-0"
              placeholder="Facultatif"
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </Field>
        </motion.div>
      </AnimatePresence>

      <Summary>
        <span className="text-muted">Montant {form.kind === "SELL" ? "net perçu" : form.kind === "BUY" ? "total" : ""}</span>
        <span className="text-right">
          <span className="font-semibold text-fg">{formatMoney(total || 0, currency)}</span>
          {showFx && total ? <span className="block text-xs text-subtle">≈ {formatMoney(total * fxNow, base)}</span> : null}
        </span>
      </Summary>

      <div className="flex items-center gap-2">
        {editing && (
          <Button variant="danger" onClick={remove}>
            <Trash /> Supprimer
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="ghost" onClick={close}>
          Annuler
        </Button>
        <Button variant="primary" type="submit" disabled={submitted && !valid}>
          {editing ? "Enregistrer" : "Ajouter"}
        </Button>
      </div>
    </form>
  );
}

function Summary({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3 text-sm ring-1 ring-border">{children}</div>;
}
