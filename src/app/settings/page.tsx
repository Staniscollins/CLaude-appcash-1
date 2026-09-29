"use client";

import {
  Database,
  Download,
  FileUp,
  Keyboard,
  LoaderCircle,
  Monitor,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Trash,
  Upload,
  Wallet,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Stagger } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Field, Input, Kbd, Select, Switch } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/segmented";
import { useLoadDemo } from "@/hooks/use-demo";
import { useDataStatus } from "@/hooks/use-market";
import { useIsSimulated } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatPercent, formatRelativeTime } from "@/lib/format";
import { BENCHMARKS } from "@/lib/market/catalog";
import { parseNumberLoose, transactionsToCsv } from "@/lib/portfolio/csv";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/portfolio/types";
import { ACCOUNT_COLORS, exportBackup, parseBackup, useAppStore, type BaseCurrency, type ThemePreference } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="mt-0.5 text-xs text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Accounts() {
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const addAccount = useAppStore((s) => s.addAccount);
  const updateAccount = useAppStore((s) => s.updateAccount);
  const deleteAccount = useAppStore((s) => s.deleteAccount);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("PEA");
  const [confirm, setConfirm] = useState<string | null>(null);
  const toDelete = accounts.find((a) => a.id === confirm);

  return (
    <Card id="comptes" className="scroll-mt-24">
      <CardHeader
        title="Comptes"
        subtitle="PEA, compte-titres, assurance-vie, crypto… Un compte avec des dépôts suit aussi ses liquidités."
        icon={<Wallet className="size-4" />}
      />
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {accounts.map((a) => {
            const count = transactions.filter((t) => t.accountId === a.id).length;
            const tracked = transactions.some((t) => t.accountId === a.id && t.type === "DEPOSIT");
            return (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2/60 p-3 ring-1 ring-border"
              >
                <div className="flex gap-1">
                  {ACCOUNT_COLORS.slice(0, 6).map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label="Couleur"
                      onClick={() => updateAccount(a.id, { color: c })}
                      className={cn(
                        "size-4 rounded-full ring-offset-2 ring-offset-[var(--surface-2)] transition",
                        a.color === c ? "ring-2 ring-fg" : "hover:scale-110",
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <Input
                  value={a.name}
                  onChange={(e) => updateAccount(a.id, { name: e.target.value })}
                  className="h-9 w-40 flex-1 sm:flex-none"
                  aria-label="Nom du compte"
                />
                <Select
                  value={a.type}
                  onChange={(e) => updateAccount(a.id, { type: e.target.value as AccountType })}
                  className="h-9 w-40"
                  aria-label="Type de compte"
                >
                  {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-muted">{count} opérations</span>
                {tracked && <Badge tone="accent">Liquidités suivies</Badge>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto hover:text-loss"
                  aria-label="Supprimer le compte"
                  onClick={() => setConfirm(a.id)}
                >
                  <Trash />
                </Button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim() || ACCOUNT_TYPE_LABELS[type];
          addAccount({ name: n, type });
          setName("");
          toast.success("Compte créé", { description: n });
        }}
      >
        <Field label="Nouveau compte" className="min-w-40 flex-1">
          <Input placeholder="ex. PEA Boursorama" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </Field>
        <Select value={type} onChange={(e) => setType(e.target.value as AccountType)} className="h-9 w-40">
          {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" className="h-9">
          <Plus /> Créer
        </Button>
      </form>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setConfirm(null)} title="Supprimer ce compte ?" size="sm">
        <p className="text-sm text-muted">
          Le compte « {toDelete?.name} » et ses {transactions.filter((t) => t.accountId === confirm).length} opérations seront supprimés
          définitivement.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm) deleteAccount(confirm);
              setConfirm(null);
              toast("Compte supprimé");
            }}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

function DataSection() {
  const status = useDataStatus();
  const simulated = useIsSimulated();
  const accounts = useAppStore((s) => s.accounts);
  const transactions = useAppStore((s) => s.transactions);
  const replaceAll = useAppStore((s) => s.replaceAll);
  const resetAll = useAppStore((s) => s.resetAll);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const { load, loading } = useLoadDemo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const s = status.data;
  const live = s && !simulated && s.source === "yahoo";

  const importJson = async (file: File) => {
    try {
      const data = parseBackup(JSON.parse(await file.text()));
      if (!data) throw new Error("Format non reconnu");
      replaceAll(data);
      toast.success("Sauvegarde restaurée", { description: `${data.transactions.length} transactions, ${data.accounts.length} comptes` });
    } catch (e) {
      toast.error("Import impossible", { description: (e as Error).message });
    }
  };

  return (
    <Card id="donnees" className="scroll-mt-24">
      <CardHeader title="Données" subtitle="Tout est stocké localement dans ce navigateur." icon={<Database className="size-4" />} />
      <div className={cn("mb-5 rounded-2xl p-4 ring-1", live ? "bg-gain/8 ring-gain/20" : "bg-warning/10 ring-warning/25")}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("size-2 rounded-full", live ? "bg-gain" : "bg-warning")} />
          {live ? "Cours en direct : Yahoo Finance" : "Mode démo : cours simulés"}
          {s?.mode && s.mode !== "auto" && <Badge>MARKET_DATA_SOURCE={s.mode}</Badge>}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          {live
            ? "Les cotations viennent de Yahoo Finance (différées de 0 à 15 minutes selon la place). Elles sont mises en cache quelques secondes à quelques heures selon leur nature."
            : "Le serveur de Lumen n'arrive pas à joindre Yahoo Finance (réseau filtré ou hors ligne) : les cours, historiques et fondamentaux sont générés par un simulateur déterministe. Vos transactions restent intactes et les vrais cours réapparaîtront dès que Yahoo sera joignable."}
          {s?.lastError && !live && <span className="mt-1 block font-mono text-[11px] text-subtle">Dernière erreur : {s.lastError}</span>}
          {s?.checkedAt ? <span className="mt-1 block text-[11px] text-subtle">Vérifié {formatRelativeTime(s.checkedAt)}</span> : null}
        </p>
      </div>

      <Row label="Sauvegarde complète (JSON)" description="Comptes, transactions, watchlist et réglages.">
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              downloadFile(
                `lumen-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(exportBackup(), null, 2),
                "application/json",
              );
              toast.success("Sauvegarde téléchargée");
            }}
          >
            <Download /> Exporter
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload /> Restaurer
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </Row>
      <Row
        label="Transactions (CSV)"
        description="Compatible Excel / Google Sheets. L'import accepte les exports de courtiers (colonnes détectées, ISIN convertis)."
      >
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!transactions.length}
            onClick={() =>
              downloadFile(
                `lumen-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
                `﻿${transactionsToCsv(transactions, accounts)}`,
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download /> Exporter
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <FileUp /> Importer
          </Button>
        </div>
      </Row>
      <Row
        label="Portefeuille de démonstration"
        description="Remplace vos données par un portefeuille fictif (PEA, CTO, crypto) sur 2 ans et demi."
      >
        <Button size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />} Charger
        </Button>
      </Row>
      <Row label="Tout effacer" description="Supprime définitivement comptes, transactions et watchlist de ce navigateur.">
        <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
          <RotateCcw /> Réinitialiser
        </Button>
      </Row>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset} title="Tout effacer ?" size="sm">
        <p className="text-sm text-muted">
          Exportez une sauvegarde avant si vous souhaitez pouvoir revenir en arrière. Cette action est irréversible.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              resetAll();
              setConfirmReset(false);
              toast("Données effacées");
            }}
          >
            Tout effacer
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

export default function SettingsPage() {
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const [rf, setRf] = useState(String(settings.riskFreeRate * 100).replace(".", ","));

  return (
    <>
      <PageHeader title="Paramètres" description="Comptes, affichage, méthode de calcul et gestion de vos données." />
      <Stagger className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Accounts />
          <Card>
            <CardHeader title="Affichage" icon={<Palette className="size-4" />} />
            <Row label="Thème">
              <Segmented<ThemePreference>
                ariaLabel="Thème"
                value={settings.theme}
                onChange={(theme) => update({ theme })}
                options={[
                  {
                    value: "dark",
                    label: (
                      <>
                        <Moon className="size-3.5" /> Sombre
                      </>
                    ),
                  },
                  {
                    value: "light",
                    label: (
                      <>
                        <Sun className="size-3.5" /> Clair
                      </>
                    ),
                  },
                  {
                    value: "system",
                    label: (
                      <>
                        <Monitor className="size-3.5" /> Système
                      </>
                    ),
                  },
                ]}
              />
            </Row>
            <Row label="Devise de référence" description="Toutes les valeurs sont converties au taux historique puis au taux du jour.">
              <Select
                value={settings.baseCurrency}
                onChange={(e) => update({ baseCurrency: e.target.value as BaseCurrency })}
                className="h-9 w-32"
              >
                {["EUR", "USD", "GBP", "CHF"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Row>
            <Row label="Mode discret" description="Floute les montants (les pourcentages restent visibles). Raccourci : icône œil en haut.">
              <Switch checked={settings.privacy} onCheckedChange={(privacy) => update({ privacy })} label="Mode discret" />
            </Row>
            <Row label="Couleurs accessibles" description="Bleu / orange au lieu de vert / rouge pour les hausses et baisses.">
              <Switch checked={settings.colorblind} onCheckedChange={(colorblind) => update({ colorblind })} label="Couleurs accessibles" />
            </Row>
            <Row label="Rafraîchissement des cours">
              <Select
                value={String(settings.refreshSeconds)}
                onChange={(e) => update({ refreshSeconds: Number(e.target.value) })}
                className="h-9 w-40"
              >
                <option value="15">Toutes les 15 s</option>
                <option value="30">Toutes les 30 s</option>
                <option value="60">Chaque minute</option>
                <option value="300">Toutes les 5 min</option>
              </Select>
            </Row>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Calculs" subtitle="Méthodes utilisées dans les analyses" />
            <Row label="Indice de référence" description="Utilisé par défaut dans les comparaisons.">
              <Select value={settings.benchmark} onChange={(e) => update({ benchmark: e.target.value })} className="h-9 w-48">
                {BENCHMARKS.map((b) => (
                  <option key={b.symbol} value={b.symbol}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </Row>
            <Row
              label="Dividendes automatiques"
              description="Détecte les dividendes versés par vos lignes (montants bruts estimés) quand vous ne les saisissez pas."
            >
              <Switch
                checked={settings.autoDividends}
                onCheckedChange={(autoDividends) => update({ autoDividends })}
                label="Dividendes automatiques"
              />
            </Row>
            <Row label="Taux sans risque" description="Pour les ratios de Sharpe et Sortino (ex. taux du Livret A ou €STR).">
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 w-20 text-right"
                  inputMode="decimal"
                  value={rf}
                  onChange={(e) => setRf(e.target.value)}
                  onBlur={() => {
                    const v = parseNumberLoose(rf);
                    if (v != null && v >= 0 && v < 20) update({ riskFreeRate: v / 100 });
                    else setRf(String(settings.riskFreeRate * 100).replace(".", ","));
                  }}
                />
                <span className="text-sm text-muted">%</span>
              </div>
            </Row>
            <div className="mt-2 rounded-2xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
              <p>
                <span className="font-medium text-fg">PRU</span> : prix de revient unitaire moyen pondéré, frais inclus, par compte.{" "}
                <span className="font-medium text-fg">TWR</span> : rendement pondéré par le temps (flux entrants en début de journée,
                sortants en fin de journée). <span className="font-medium text-fg">TRI</span> : taux de rendement interne de vos flux réels.
                Les splits sont appliqués automatiquement. Taux sans risque actuel : {formatPercent(settings.riskFreeRate, { decimals: 2 })}
                .
              </p>
            </div>
          </Card>
          <DataSection />
          <Card>
            <CardHeader title="Raccourcis" icon={<Keyboard className="size-4" />} />
            <ul className="space-y-2 text-sm">
              {[
                [["⌘", "K"], "Recherche et actions"],
                [["/"], "Ouvrir la recherche"],
                [["←", "→"], "Parcourir un graphique (après l'avoir sélectionné)"],
                [["Échap"], "Fermer une fenêtre"],
              ].map(([keys, label]) => (
                <li key={label as string} className="flex items-center justify-between">
                  <span className="text-muted">{label as string}</span>
                  <span className="flex gap-1">
                    {(keys as string[]).map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </Stagger>
    </>
  );
}
