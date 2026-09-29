import type { NextRequest } from "next/server";
import { badRequest, handle, ok, parseSymbols } from "@/lib/market/http";
import { getNews } from "@/lib/market/provider";

export async function GET(request: NextRequest) {
  const symbols = parseSymbols(request.nextUrl.searchParams.get("symbols"), 20);
  if (!symbols) return badRequest("Paramètre « symbols » invalide.");
  return handle(async () => ok(await getNews(symbols), 300));
}
