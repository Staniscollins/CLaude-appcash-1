"use client";

import { ExternalLink, Newspaper } from "lucide-react";
import { motion } from "motion/react";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { useNews } from "@/hooks/use-market";
import { useIsSimulated } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NewsList({ symbols, limit = 6, columns = 2 }: { symbols: string[]; limit?: number; columns?: 1 | 2 | 3 }) {
  const news = useNews(symbols);
  const simulated = useIsSimulated();
  const items = (news.data ?? []).slice(0, limit);

  if (news.isLoading) {
    return (
      <div className={cn("grid gap-3", columns === 2 && "md:grid-cols-2", columns === 3 && "md:grid-cols-3")}>
        {Array.from({ length: Math.min(limit, 4) }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<Newspaper />}
        title="Pas d'actualités"
        description={
          simulated
            ? "Les actualités viennent de Yahoo Finance et ne sont pas disponibles en mode démo."
            : "Aucun article récent pour ces valeurs."
        }
        className="py-8"
      />
    );
  }
  return (
    <ul className={cn("grid gap-2", columns === 2 && "md:grid-cols-2", columns === 3 && "md:grid-cols-3")}>
      {items.map((n, i) => (
        <motion.li key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
          <a
            href={n.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-full gap-3 rounded-2xl p-2.5 transition hover:bg-surface-2"
          >
            {n.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={n.thumbnail} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-border" />
            ) : (
              <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-surface-2 text-subtle ring-1 ring-border">
                <Newspaper className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm leading-snug font-medium text-fg group-hover:text-accent">{n.title}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-subtle">
                <span className="truncate">{n.publisher}</span>
                <span>·</span>
                <span className="shrink-0">{formatRelativeTime(n.time)}</span>
                <ExternalLink className="ml-auto size-3 shrink-0 opacity-0 transition group-hover:opacity-100" />
              </div>
              {n.symbols.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {n.symbols.slice(0, 3).map((s) => (
                    <span key={s} className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </a>
        </motion.li>
      ))}
    </ul>
  );
}
