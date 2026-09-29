"use client";

import { Check, ChevronDown, Eye, EyeOff, Moon, Plus, Search, Settings2, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint, Kbd } from "@/components/ui/primitives";
import { ACCOUNT_TYPE_LABELS } from "@/lib/portfolio/types";
import { useAppStore } from "@/lib/store";
import { useUiStore } from "@/lib/ui-store";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { cn } from "@/lib/utils";
import { LogoMark } from "./logo";

function AccountSwitcher() {
  const accounts = useAppStore((s) => s.accounts);
  const filter = useAppStore((s) => s.accountFilter);
  const setFilter = useAppStore((s) => s.setAccountFilter);
  const current = accounts.find((a) => a.id === filter);
  if (!accounts.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-9 max-w-[168px] min-w-0 items-center gap-2 rounded-xl px-3 sm:max-w-[220px] text-sm font-medium text-fg ring-1 ring-border transition hover:bg-surface-2 hover:ring-border-strong data-[state=open]:bg-surface-2"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{
              background: current ? current.color : "conic-gradient(var(--chart-1), var(--chart-2), var(--chart-3), var(--chart-1))",
            }}
          />
          <span className="truncate">{current ? current.name : "Tous les comptes"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 min-w-60 rounded-2xl bg-surface-3 p-1.5 shadow-[var(--shadow-pop)] data-[state=open]:animate-[fade-in_0.16s_ease-out]"
        >
          {[
            { id: "all", name: "Tous les comptes", color: "", type: undefined as undefined | keyof typeof ACCOUNT_TYPE_LABELS },
            ...accounts,
          ].map((a) => (
            <DropdownMenu.Item
              key={a.id}
              onSelect={() => setFilter(a.id)}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-2"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: a.color || "conic-gradient(var(--chart-1), var(--chart-2), var(--chart-3), var(--chart-1))" }}
              />
              <span className="flex-1 truncate">{a.name}</span>
              {a.type && <span className="text-xs text-subtle">{ACCOUNT_TYPE_LABELS[a.type]}</span>}
              {filter === a.id && <Check className="size-4 text-accent" />}
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item asChild>
            <Link
              href="/settings#comptes"
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-muted outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg"
            >
              <Settings2 className="size-4" /> Gérer les comptes
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ThemeToggle() {
  const update = useAppStore((s) => s.updateSettings);
  const resolved = useResolvedTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <Hint content={next === "light" ? "Thème clair" : "Thème sombre"} side="bottom">
      <Button variant="ghost" size="icon" aria-label="Changer de thème" onClick={() => update({ theme: next })}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={resolved}
            initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid place-items-center"
          >
            {resolved === "dark" ? <Moon /> : <Sun />}
          </motion.span>
        </AnimatePresence>
      </Button>
    </Hint>
  );
}

export function PrivacyToggle() {
  const privacy = useAppStore((s) => s.settings.privacy);
  const update = useAppStore((s) => s.updateSettings);
  return (
    <Hint content={privacy ? "Afficher les montants" : "Mode discret : masquer les montants"} side="bottom">
      <Button variant="ghost" size="icon" aria-label="Mode discret" aria-pressed={privacy} onClick={() => update({ privacy: !privacy })}>
        {privacy ? <EyeOff /> : <Eye />}
      </Button>
    </Hint>
  );
}

export function Topbar() {
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  const openTransaction = useUiStore((s) => s.openTransaction);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-16 items-center gap-1.5 px-4 transition-[background-color,border-color,backdrop-filter] duration-300 sm:gap-3 sm:px-6 lg:px-8",
        scrolled ? "border-b border-border bg-bg/75 backdrop-blur-xl" : "border-b border-transparent",
      )}
    >
      <Link href="/" className="mr-1.5 md:hidden" aria-label="Accueil">
        <LogoMark size={28} />
      </Link>
      <AccountSwitcher />
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="group hidden h-9 w-72 items-center gap-2 rounded-xl bg-surface-2/70 px-3 text-sm text-subtle ring-1 ring-border transition hover:bg-surface-2 hover:text-muted hover:ring-border-strong sm:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Rechercher une valeur…</span>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </button>
      <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Rechercher" onClick={() => setCommandOpen(true)}>
        <Search />
      </Button>
      <PrivacyToggle />
      {/* On phones the theme lives in Settings, to keep the bar uncluttered. */}
      <div className="hidden sm:contents">
        <ThemeToggle />
      </div>
      <Button variant="primary" size="md" className="hidden sm:inline-flex" onClick={() => openTransaction()}>
        <Plus /> Transaction
      </Button>
      <Button variant="primary" size="icon" className="sm:hidden" aria-label="Nouvelle transaction" onClick={() => openTransaction()}>
        <Plus />
      </Button>
    </header>
  );
}
