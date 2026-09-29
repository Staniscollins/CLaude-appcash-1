"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useDataStatus } from "@/hooks/use-market";
import { useIsSimulated } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DataSourceIndicator({ className }: { className?: string }) {
  const simulated = useIsSimulated();
  const status = useDataStatus();
  const live = !simulated && status.data?.source !== "simulated";
  return (
    <Link href="/settings#donnees" className={cn("flex items-center gap-2 text-[11px] text-subtle hover:text-muted", className)}>
      <span className="relative flex size-2">
        <span
          className={cn("absolute inline-flex size-full rounded-full opacity-60 animate-pulse-soft", live ? "bg-gain" : "bg-warning")}
        />
        <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-gain" : "bg-warning")} />
      </span>
      {live ? "Yahoo Finance · différé 15 min max." : "Données simulées (mode démo)"}
    </Link>
  );
}

/** Prominent notice while the simulator answers instead of Yahoo Finance. */
export function SimulatedBanner() {
  const simulated = useIsSimulated();
  return (
    <AnimatePresence>
      {simulated && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl bg-warning/10 px-4 py-3 text-[13px] text-fg ring-1 ring-warning/25 sm:mx-6 lg:mx-8">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="min-w-0 leading-relaxed">
              <span className="font-semibold">Mode démo : cours simulés.</span>{" "}
              <span className="text-muted">
                Yahoo Finance est injoignable depuis le serveur de l&apos;application, les prix, graphiques et fondamentaux affichés sont
                générés. Ils ne reflètent pas le marché.{" "}
              </span>
              <Link href="/settings#donnees" className="font-medium text-accent hover:underline">
                Détails
              </Link>
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
