import type { NextRequest } from "next/server";
import { badRequest, handle, ok, parseSymbols } from "@/lib/market/http";
import { getQuotes } from "@/lib/market/provider";

export async function GET(request: NextRequest) {
  const symbols = parseSymbols(request.nextUrl.searchParams.get("symbols"));
  if (!symbols) return badRequest("Paramètre « symbols » invalide.");
  return handle(async () => ok(await getQuotes(symbols)));
}
