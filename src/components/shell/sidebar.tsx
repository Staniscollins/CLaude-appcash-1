"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortfolio } from "@/components/portfolio/portfolio-provider";
import { DeltaPercent } from "@/components/ui/delta";
import { AnimatedMoney } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { DataSourceIndicator } from "./data-source";
import { Logo } from "./logo";
import { isActive, NAV_ITEMS } from "./nav";

export function Sidebar() {
  const pathname = usePathname();
  const { snapshot, settings, hydrated, quotesReady, isEmpty } = usePortfolio();
  const main = NAV_ITEMS.slice(0, 5);
  const secondary = NAV_ITEMS.slice(5);

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        className={cn(
          "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors md:justify-center lg:justify-start",
          active ? "text-fg" : "text-muted hover:text-fg",
        )}
      >
        {active && (
          <motion.span
            layoutId="nav-active"
            className="absolute inset-0 -z-10 rounded-xl bg-surface-2 ring-1 ring-border"
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
          >
            <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_var(--accent)]" />
          </motion.span>
        )}
        <Icon className={cn("size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110", active && "text-accent")} />
        <span className="truncate md:hidden lg:inline">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border bg-bg-elev/80 backdrop-blur-xl md:flex md:w-[76px] lg:w-[248px]">
      <div className="flex h-16 items-center px-5 md:justify-center md:px-0 lg:justify-start lg:px-5">
        <Link href="/" aria-label="Lumen — accueil" className="rounded-xl">
          <span className="hidden lg:inline">
            <Logo />
          </span>
          <span className="lg:hidden">
            <Logo collapsed />
          </span>
        </Link>
      </div>

      <nav className="isolate flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2 scrollbar-none" aria-label="Navigation principale">
        {main.map(renderItem)}
        <div className="mx-3 my-3 h-px bg-border" />
        {secondary.map(renderItem)}
      </nav>

      <div className="hidden p-3 lg:block">
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <div className="text-xs text-muted">Patrimoine boursier</div>
          {!hydrated || (!quotesReady && !isEmpty) ? (
            <Skeleton className="mt-2 h-6 w-32" />
          ) : (
            <div className="mt-1 text-lg font-semibold tracking-tight">
              <AnimatedMoney value={snapshot.totals.value} currency={settings.baseCurrency} decimals={0} />
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <DeltaPercent value={snapshot.totals.dayChangePct} />
            <span className="text-subtle">aujourd&apos;hui</span>
          </div>
        </div>
        <DataSourceIndicator className="mt-3 px-1" />
      </div>
    </aside>
  );
}
