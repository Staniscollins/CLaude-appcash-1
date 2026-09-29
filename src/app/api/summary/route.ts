import type { NextRequest } from "next/server";
import { badRequest, handle, ok, parseSymbol } from "@/lib/market/http";
import { getSummary } from "@/lib/market/provider";

export async function GET(request: NextRequest) {
  const symbol = parseSymbol(request.nextUrl.searchParams.get("symbol"));
  if (!symbol) return badRequest("Paramètre « symbol » invalide.");
  return handle(async () => ok(await getSummary(symbol), 300));
}
