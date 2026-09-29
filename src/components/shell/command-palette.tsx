"use client";

import { Command } from "cmdk";
import { ArrowRight, Eye, FileUp, LoaderCircle, Moon, Plus, Search, Star, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Dialog as RadixDialog } from "radix-ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { AssetLogo } from "@/components/ui/asset-logo";
import { DeltaPercent } from "@/components/ui/delta";
import { Kbd } from "@/components/ui/primitives";
import { useDebounced } from "@/hooks/use-debounced";
import { useSearch } from "@/hooks/use-market";
import { assetTypeLabel } from "@/lib/market/catalog";
import { useAppStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { NAV_ITEMS } from "./nav";

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fg outline-none data-[selected=true]:bg-surface-2"
    >
      {children}
      <ArrowRight className="ml-auto size-4 text-subtle opacity-0 transition group-data-[selected=true]:translate-x-0.5 group-data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}

const groupClass =
  "px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:uppercase";

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[6px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </RadixDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]">
              <RadixDialog.Content asChild forceMount>
                <motion.div
                  className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-3xl bg-surface-3 shadow-[var(--shadow-pop)] ring-1 ring-border-strong"
                  initial={{ opacity: 0, scale: 0.96, y: -12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: -8 }}
                  transition={{ type: "spring", stiffness: 520, damping: 38 }}
                >
                  <RadixDialog.Title className="sr-only">Recherche</RadixDialog.Title>
                  <RadixDialog.Description className="sr-only">Rechercher une valeur, une page ou une action</RadixDialog.Description>
                  <PaletteContent />
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}

/** Mounted only while the palette is open, so its query starts empty each time. */
function PaletteContent() {
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const openTransaction = useUiStore((s) => s.openTransaction);
  const setImportOpen = useUiStore((s) => s.setImportOpen);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const addToWatchlist = useAppStore((s) => s.addToWatchlist);
  const router = useRouter();
  const { snapshot } = usePortfolio();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 180);
  const search = useSearch(debounced);

  const q = normalize(query.trim());
  const holdings = useMemo(
    () => snapshot.positions.filter((p) => !q || normalize(`${p.symbol} ${p.name}`).includes(q)).slice(0, q ? 6 : 5),
    [snapshot.positions, q],
  );
  const pages = NAV_ITEMS.filter((p) => !q || normalize(`${p.label} ${p.description}`).includes(q));
  const hits = (search.data?.hits ?? []).filter((h) => !holdings.some((p) => p.symbol === h.symbol)).slice(0, 8);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const actions = [
    { id: "tx", label: "Ajouter une transaction", icon: <Plus className="size-4" />, run: () => openTransaction() },
    { id: "import", label: "Importer un fichier CSV", icon: <FileUp className="size-4" />, run: () => setImportOpen(true) },
    {
      id: "privacy",
      label: settings.privacy ? "Afficher les montants" : "Activer le mode discret",
      icon: <Eye className="size-4" />,
      run: () => updateSettings({ privacy: !settings.privacy }),
    },
    {
      id: "theme",
      label: settings.theme === "light" ? "Passer au thème sombre" : "Passer au thème clair",
      icon: settings.theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />,
      run: () => updateSettings({ theme: settings.theme === "light" ? "dark" : "light" }),
    },
  ].filter((a) => !q || normalize(a.label).includes(q));

  return (
    <Command shouldFilter={false} loop label="Recherche">
      <div className="flex items-center gap-3 border-b border-border px-4">
        {search.isFetching ? <LoaderCircle className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Action, ETF, crypto, page…  (ex. LVMH, MSCI World)"
          className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-subtle"
          autoFocus
        />
        <Kbd>Échap</Kbd>
      </div>
      <Command.List className="max-h-[min(60vh,460px)] overflow-y-auto p-1.5 scrollbar-thin">
        <Command.Empty className="px-4 py-10 text-center text-sm text-muted">
          {search.isFetching ? "Recherche…" : "Aucun résultat."}
        </Command.Empty>

        {holdings.length > 0 && (
          <Command.Group heading="Mon portefeuille" className={groupClass}>
            {holdings.map((p) => (
              <Item key={`h-${p.symbol}`} value={`h-${p.symbol}`} onSelect={() => go(`/stock/${encodeURIComponent(p.symbol)}`)}>
                <AssetLogo symbol={p.symbol} name={p.name} logoUrl={p.meta.logoUrl} type={p.type} size={28} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs text-subtle">{p.symbol}</div>
                </div>
                <DeltaPercent value={p.changePercent} className="ml-auto text-xs" />
              </Item>
            ))}
          </Command.Group>
        )}

        {hits.length > 0 && (
          <Command.Group heading="Valeurs" className={groupClass}>
            {hits.map((h) => (
              <Item key={`s-${h.symbol}`} value={`s-${h.symbol}`} onSelect={() => go(`/stock/${encodeURIComponent(h.symbol)}`)}>
                <AssetLogo symbol={h.symbol} name={h.name} type={h.type} size={28} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{h.name}</div>
                  <div className="truncate text-xs text-subtle">
                    {h.symbol} · {assetTypeLabel(h.type)}
                    {h.exchange ? ` · ${h.exchange}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  title="Ajouter à la watchlist"
                  onClick={(e) => {
                    e.stopPropagation();
                    addToWatchlist(h.symbol);
                  }}
                  className="ml-auto grid size-7 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-warning"
                >
                  <Star className="size-4" />
                </button>
              </Item>
            ))}
          </Command.Group>
        )}

        {actions.length > 0 && (
          <Command.Group heading="Actions" className={groupClass}>
            {actions.map((a) => (
              <Item
                key={a.id}
                value={`a-${a.id}`}
                onSelect={() => {
                  setOpen(false);
                  a.run();
                }}
              >
                <span className="grid size-7 place-items-center rounded-lg bg-surface-2 text-muted ring-1 ring-border">{a.icon}</span>
                {a.label}
              </Item>
            ))}
          </Command.Group>
        )}

        {pages.length > 0 && (
          <Command.Group heading="Navigation" className={groupClass}>
            {pages.map((p) => {
              const Icon = p.icon;
              return (
                <Item key={p.href} value={`p-${p.href}`} onSelect={() => go(p.href)}>
                  <span className="grid size-7 place-items-center rounded-lg bg-surface-2 text-muted ring-1 ring-border">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">{p.label}</div>
                    <div className="truncate text-xs text-subtle">{p.description}</div>
                  </div>
                </Item>
              );
            })}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center gap-3 border-t border-border px-4 py-2.5 text-[11px] text-subtle">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> naviguer
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> ouvrir
        </span>
        <span className="ml-auto">Recherche Yahoo Finance</span>
      </div>
    </Command>
  );
}
