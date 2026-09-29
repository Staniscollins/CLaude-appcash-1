import type { NextRequest } from "next/server";
import { isValidDayKey } from "@/lib/dates";
import { badRequest, handle, ok, parseSymbols } from "@/lib/market/http";
import { getHistory } from "@/lib/market/provider";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbols = parseSymbols(params.get("symbols"), 80);
  const from = params.get("from");
  if (!symbols) return badRequest("Paramètre « symbols » invalide.");
  if (!from || !isValidDayKey(from)) return badRequest("Paramètre « from » invalide.");
  return handle(async () => ok(await getHistory(symbols, from), 60));
}
