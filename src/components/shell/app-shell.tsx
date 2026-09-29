"use client";

import type { ReactNode } from "react";
import { ImportDialog } from "@/components/transactions/import-dialog";
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { AlertWatcher } from "@/components/watchlist/alert-watcher";
import { CommandPalette } from "./command-palette";
import { SimulatedBanner } from "./data-source";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-48 right-[-10%] h-[520px] w-[720px] rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-40 blur-3xl animate-aurora" />
      <div
        className="absolute -top-64 left-[10%] h-[460px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgb(57_135_229/0.22),transparent)] opacity-50 blur-3xl animate-aurora"
        style={{ animationDelay: "-7s" }}
      />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh">
      <Aurora />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <SimulatedBanner />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pt-4 pb-28 sm:px-6 md:pb-14 lg:px-8">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
      <TransactionDialog />
      <ImportDialog />
      <AlertWatcher />
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
