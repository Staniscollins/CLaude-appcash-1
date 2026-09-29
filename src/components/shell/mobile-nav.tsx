"use client";

import { Ellipsis } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { isActive, MOBILE_NAV, NAV_ITEMS } from "./nav";

/** Bottom tab bar for phones, with a sheet for the remaining sections. */
export function MobileNav() {
  const pathname = usePathname();
  // Remember on which page the sheet was opened: navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const more = openOn === pathname;
  const setMore = (v: boolean | ((m: boolean) => boolean)) => setOpenOn((typeof v === "function" ? v(more) : v) ? pathname : null);
  const items = NAV_ITEMS.filter((i) => MOBILE_NAV.includes(i.href));
  const others = NAV_ITEMS.filter((i) => !MOBILE_NAV.includes(i.href));
  const otherActive = others.some((i) => isActive(pathname, i.href));

  return (
    <>
      <AnimatePresence>
        {more && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMore(false)}
            />
            <motion.div
              className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 grid grid-cols-3 gap-2 rounded-3xl bg-surface-3 p-3 shadow-[var(--shadow-pop)] md:hidden"
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
            >
              {others.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-xs font-medium",
                      active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                    )}
                  >
                    <Icon className="size-5" />
                    {item.short}
                  </Link>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg-elev/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
        aria-label="Navigation"
      >
        <div className="grid h-[68px] grid-cols-5 px-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
              >
                {active && <motion.span layoutId="mobile-nav" className="absolute inset-x-3 inset-y-2 -z-10 rounded-2xl bg-accent-soft" />}
                <Icon className={cn("size-5 transition", active ? "text-accent" : "text-muted")} />
                <span className={active ? "text-fg" : "text-muted"}>{item.short}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            className="relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
            aria-expanded={more}
          >
            {otherActive && !more && (
              <motion.span layoutId="mobile-nav" className="absolute inset-x-3 inset-y-2 -z-10 rounded-2xl bg-accent-soft" />
            )}
            <Ellipsis className={cn("size-5", otherActive || more ? "text-accent" : "text-muted")} />
            <span className={otherActive || more ? "text-fg" : "text-muted"}>Plus</span>
          </button>
        </div>
      </nav>
    </>
  );
}
