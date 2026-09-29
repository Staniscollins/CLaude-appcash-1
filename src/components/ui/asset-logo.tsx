"use client";

import { useState } from "react";
import type { AssetType } from "@/lib/market/types";
import { cn, hashString } from "@/lib/utils";

const GRADIENTS = [
  ["#6a5cf0", "#3987e5"],
  ["#3987e5", "#199e70"],
  ["#d95926", "#c98500"],
  ["#d55181", "#9085e9"],
  ["#199e70", "#3987e5"],
  ["#c98500", "#d95926"],
  ["#9085e9", "#d55181"],
  ["#e66767", "#d95926"],
];

function initials(symbol: string, name?: string) {
  const clean = symbol.replace(/^\^/, "").split(/[.=-]/)[0];
  if (/^[A-Z0-9]{1,4}$/.test(clean)) return clean.slice(0, clean.length > 3 ? 2 : 3);
  const words = (name ?? clean).split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : clean.slice(0, 2)).toUpperCase();
}

const CRYPTO_GLYPH: Record<string, string> = { BTC: "₿", ETH: "Ξ", SOL: "◎" };

/** Company logo with a deterministic gradient monogram fallback. */
export function AssetLogo({
  symbol,
  name,
  logoUrl,
  type,
  size = 36,
  className,
}: {
  symbol: string;
  name?: string;
  logoUrl?: string | null;
  type?: AssetType;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [c1, c2] = GRADIENTS[hashString(symbol) % GRADIENTS.length];
  const radius = type === "CRYPTOCURRENCY" || type === "CURRENCY" ? "9999px" : `${Math.round(size * 0.3)}px`;
  const base = symbol.split("-")[0];
  const text = type === "CRYPTOCURRENCY" && CRYPTO_GLYPH[base] ? CRYPTO_GLYPH[base] : initials(symbol, name);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 bg-white object-contain p-[3px] ring-1 ring-border", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden font-semibold tracking-tight text-white ring-1 ring-white/10",
        className,
      )}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.max(9, size * (text.length > 2 ? 0.3 : 0.36)),
        background: `linear-gradient(135deg, ${c1}, ${c2})`,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.18)",
      }}
    >
      {text}
    </span>
  );
}
