"use client";

import { hierarchy, treemap, treemapSquarify } from "d3-hierarchy";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { formatPercent } from "@/lib/format";
import { useMeasure } from "./use-measure";

export interface TreemapItem {
  key: string;
  label: string;
  sublabel?: string;
  /** Tile area. */
  value: number;
  /** Signed ratio driving the colour (e.g. daily change). */
  change: number;
  detail?: string;
}

/** Diverging tile colour: loss ← neutral → gain, saturating at ±`scale`. */
export function divergingFill(change: number, scale = 0.03) {
  const k = Math.min(1, Math.abs(change) / scale);
  const pct = Math.round(18 + k * 62);
  const hue = change >= 0 ? "var(--gain)" : "var(--loss)";
  if (Math.abs(change) < 0.0005) return "var(--surface-3)";
  return `color-mix(in oklab, ${hue} ${pct}%, var(--surface-2))`;
}

export function Treemap({
  items,
  height = 360,
  scale = 0.03,
  onSelect,
}: {
  items: TreemapItem[];
  height?: number;
  scale?: number;
  onSelect?: (key: string) => void;
}) {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);

  const leaves = useMemo(() => {
    if (!width || !items.length) return [];
    const root = hierarchy<{ children?: TreemapItem[] } & Partial<TreemapItem>>({ children: items })
      .sum((d) => Math.max(0, d.value ?? 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    treemap<typeof root.data>().tile(treemapSquarify.ratio(1.3)).size([width, height]).paddingInner(3).round(true)(root);
    return root.leaves().map((l) => {
      const node = l as typeof l & { x0: number; x1: number; y0: number; y1: number };
      return { item: l.data as TreemapItem, x: node.x0, y: node.y0, w: node.x1 - node.x0, h: node.y1 - node.y0 };
    });
  }, [items, width, height]);

  const hoveredLeaf = leaves.find((l) => l.item.key === hovered);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {leaves.map((l, i) => {
        const big = l.w > 90 && l.h > 54;
        const medium = l.w > 52 && l.h > 30;
        const strong = Math.abs(l.item.change) / scale > 0.45;
        return (
          <motion.button
            key={l.item.key}
            type="button"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1, x: l.x, y: l.y, width: l.w, height: l.h }}
            transition={{ type: "spring", stiffness: 260, damping: 30, delay: Math.min(i * 0.02, 0.4) }}
            onClick={() => onSelect?.(l.item.key)}
            onPointerEnter={() => setHovered(l.item.key)}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(l.item.key)}
            onBlur={() => setHovered(null)}
            aria-label={`${l.item.label} ${formatPercent(l.item.change, { sign: true })}`}
            className="absolute top-0 left-0 overflow-hidden rounded-lg text-left ring-1 ring-black/5 transition-[filter] hover:brightness-110"
            style={{ background: divergingFill(l.item.change, scale), color: strong ? "#fff" : "var(--fg)" }}
          >
            {medium && (
              <div className="flex h-full flex-col justify-between p-2">
                <span className="truncate text-xs font-semibold leading-tight">{l.item.label}</span>
                <span className={big ? "text-sm font-semibold tabular" : "text-[11px] font-medium tabular"}>
                  {formatPercent(l.item.change, { sign: true })}
                </span>
              </div>
            )}
          </motion.button>
        );
      })}
      {hoveredLeaf && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-xl bg-surface-3/95 px-3 py-2 text-xs shadow-[var(--shadow-pop)] backdrop-blur-md"
          style={{
            left: Math.max(4, Math.min(width - 212, hoveredLeaf.x + hoveredLeaf.w / 2 - 104)),
            top: hoveredLeaf.y + hoveredLeaf.h + 6 > height - 70 ? Math.max(0, hoveredLeaf.y - 74) : hoveredLeaf.y + hoveredLeaf.h + 6,
          }}
        >
          <div className="font-semibold text-fg">{hoveredLeaf.item.label}</div>
          {hoveredLeaf.item.sublabel && <div className="truncate text-muted">{hoveredLeaf.item.sublabel}</div>}
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted">{hoveredLeaf.item.detail}</span>
            <span className={hoveredLeaf.item.change >= 0 ? "font-semibold text-gain" : "font-semibold text-loss"}>
              {formatPercent(hoveredLeaf.item.change, { sign: true })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
