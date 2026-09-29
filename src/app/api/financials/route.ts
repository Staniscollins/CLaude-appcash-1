import type { NextRequest } from "next/server";
import { badRequest, handle, ok, parseSymbol } from "@/lib/market/http";
import { getFinancials } from "@/lib/market/provider";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = parseSymbol(params.get("symbol"));
  const period = params.get("period") ?? "annual";
  if (!symbol) return badRequest("Paramètre « symbol » invalide.");
  if (period !== "annual" && period !== "quarterly") return badRequest("Paramètre « period » invalide.");
  return handle(async () => ok(await getFinancials(symbol, period), 3600));
}
