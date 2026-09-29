import "server-only";
import { NextResponse } from "next/server";
import { UpstreamError } from "./provider";

const SYMBOL_RE = /^[A-Za-z0-9.^=\-_&]{1,24}$/;

export function parseSymbols(raw: string | null, max = 150): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length || list.length > max || !list.every((s) => SYMBOL_RE.test(s))) return null;
  return list;
}

export function parseSymbol(raw: string | null): string | null {
  const s = raw?.trim();
  return s && SYMBOL_RE.test(s) ? s : null;
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function ok<T>(body: T, maxAge = 0) {
  return NextResponse.json(body, {
    headers: { "Cache-Control": maxAge > 0 ? `private, max-age=${maxAge}` : "no-store" },
  });
}

export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof UpstreamError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api]", err);
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
