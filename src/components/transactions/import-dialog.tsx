"use client";

import { FileSpreadsheet, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Field, Select } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { CSV_FIELD_LABELS, isIsin, readCsv, rowsToTransactions, type CsvField, type ParsedCsv } from "@/lib/portfolio/csv";
import { TRANSACTION_LABELS } from "@/lib/portfolio/types";
import { formatDate, formatNumber } from "@/lib/format";
import { useAppStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

const FIELDS = Object.keys(CSV_FIELD_LABELS) as CsvField[];
const REQUIRED: CsvField[] = ["date", "symbol"];

export function ImportDialog() {
  const open = useUiStore((s) => s.importOpen);
  const setOpen = useUiStore((s) => s.setImportOpen);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      size="xl"
      title="Importer des transactions"
      description="Fichier CSV exporté de votre courtier ou de Lumen. Les colonnes sont détectées automatiquement."
    >
      {open && <ImportFlow onDone={() => setOpen(false)} />}
    </Dialog>
  );
}

function ImportFlow({ onDone }: { onDone: () => void }) {
  const accounts = useAppStore((s) => s.accounts);
  const base = useAppStore((s) => s.settings.baseCurrency);
  const addTransactions = useAppStore((s) => s.addTransactions);
  const addAccount = useAppStore((s) => s.addAccount);
  const deleteTransactions = useAppStore((s) => s.deleteTransactions);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Partial<Record<CsvField, string>>>({});
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "__new");
  const [currency, setCurrency] = useState<string>(base);
  const [symbolMap, setSymbolMap] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (file: File) => {
    const text = await file.text();
    const p = readCsv(text);
    if (!p.headers.length || !p.rows.length) {
      toast.error("Fichier vide ou illisible");
      return;
    }
    setFileName(file.name);
    setParsed(p);
    setMapping(p.mapping);
    setSymbolMap({});
  }, []);

  // ISIN codes still to resolve into Yahoo tickers (through the search endpoint).
  const pendingIsins = useMemo(() => {
    if (!parsed || !mapping.symbol) return [];
    const col = mapping.symbol;
    return [...new Set(parsed.rows.map((r) => r[col]?.trim().toUpperCase()).filter((s): s is string => !!s && isIsin(s)))].filter(
      (s) => !(s in symbolMap),
    );
  }, [parsed, mapping.symbol, symbolMap]);
  const resolving = pendingIsins.length > 0;

  useEffect(() => {
    if (!pendingIsins.length) return;
    let cancelled = false;
    void Promise.all(
      pendingIsins.map((isin) =>
        api
          .search(isin)
          .then((r) => [isin, r.data.hits[0]?.symbol ?? ""] as const)
          .catch(() => [isin, ""] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setSymbolMap((m) => ({ ...m, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingIsins]);

  const result = useMemo(() => {
    if (!parsed) return null;
    const cleanMap = Object.fromEntries(Object.entries(symbolMap).filter(([, v]) => v));
    return rowsToTransactions(parsed, mapping, {
      accounts,
      defaultAccountId: accountId,
      defaultCurrency: currency,
      symbolMap: cleanMap,
    });
  }, [parsed, mapping, accounts, accountId, currency, symbolMap]);

  const unresolved = Object.entries(symbolMap)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  const missingRequired = REQUIRED.filter((f) => f !== "symbol" && !mapping[f]);

  const doImport = () => {
    if (!result?.transactions.length) return;
    let target = accountId;
    if (accountId === "__new") target = addAccount({ name: "Compte importé", type: "CTO" }).id;
    const txs = result.transactions.map((t) => (t.accountId === "__new" ? { ...t, accountId: target } : t));
    const created = addTransactions(txs);
    toast.success(`${created.length} transaction${created.length > 1 ? "s" : ""} importée${created.length > 1 ? "s" : ""}`, {
      action: { label: "Annuler", onClick: () => deleteTransactions(created.map((c) => c.id)) },
    });
    onDone();
  };

  if (!parsed) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void load(f);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-14 text-center transition",
            dragging ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent/60 hover:bg-surface-2",
          )}
        >
          <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 ring-1 ring-border">
            <Upload className="size-5 text-accent" />
          </span>
          <span className="font-medium text-fg">Déposez un fichier CSV ou cliquez pour parcourir</span>
          <span className="max-w-md text-sm text-muted">
            Colonnes reconnues : date, type (achat, vente, dividende…), symbole ou ISIN, quantité, prix, montant, frais, devise, compte.
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void load(f);
          }}
        />
        <p className="text-xs text-subtle">
          Astuce : exportez d&apos;abord vos transactions depuis Lumen pour voir le format attendu. Les ISIN sont convertis automatiquement
          en tickers.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-border">
        <FileSpreadsheet className="size-5 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{fileName}</div>
          <div className="text-xs text-muted">
            {formatNumber(parsed.rows.length, { decimals: 0 })} lignes · {parsed.headers.length} colonnes
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setParsed(null)}>
          Changer
        </Button>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Correspondance des colonnes</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {FIELDS.map((f) => (
            <Field key={f} label={CSV_FIELD_LABELS[f]}>
              <Select value={mapping[f] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value || undefined }))}>
                <option value="">—</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Compte par défaut" hint="Utilisé quand la colonne « compte » est absente ou inconnue">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            <option value="__new">+ Nouveau compte « Compte importé »</option>
          </Select>
        </Field>
        <Field label="Devise par défaut">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {["EUR", "USD", "GBP", "CHF"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>

      {missingRequired.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-warning/10 px-3 py-2 text-sm text-fg ring-1 ring-warning/25">
          <TriangleAlert className="size-4 text-warning" /> Associez au minimum la colonne «{" "}
          {missingRequired.map((f) => CSV_FIELD_LABELS[f]).join(", ")} ».
        </div>
      )}
      {resolving && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Conversion des codes ISIN en tickers…
        </div>
      )}
      {unresolved.length > 0 && (
        <div className="text-xs text-warning">
          ISIN non reconnus : {unresolved.join(", ")} (lignes conservées avec l&apos;ISIN comme symbole).
        </div>
      )}

      {result && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">Aperçu</h3>
            <Badge tone="gain">{result.transactions.length} prêtes</Badge>
            {result.issues.length > 0 && <Badge tone="warning">{result.issues.length} ignorées</Badge>}
          </div>
          <div className="overflow-x-auto rounded-2xl ring-1 ring-border scrollbar-thin">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-xs text-muted">
                <tr>
                  {["Date", "Type", "Symbole", "Qté", "Prix / montant", "Frais", "Devise"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="tabular">
                {result.transactions.slice(0, 8).map((t, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2">{formatDate(t.date, "medium")}</td>
                    <td className="px-3 py-2">{TRANSACTION_LABELS[t.type]}</td>
                    <td className="px-3 py-2 font-medium">{t.symbol ?? "—"}</td>
                    <td className="px-3 py-2">{t.quantity ?? "—"}</td>
                    <td className="px-3 py-2">{t.price ?? t.amount}</td>
                    <td className="px-3 py-2">{t.fees ?? "—"}</td>
                    <td className="px-3 py-2">{t.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.issues.length > 0 && (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">Voir les lignes ignorées</summary>
              <ul className="mt-1 max-h-32 overflow-y-auto">
                {result.issues.slice(0, 50).map((iss) => (
                  <li key={iss.row}>
                    Ligne {iss.row} : {iss.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button variant="primary" disabled={!result?.transactions.length || missingRequired.length > 0} onClick={doImport}>
          Importer {result?.transactions.length ?? 0} transaction{(result?.transactions.length ?? 0) > 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}
