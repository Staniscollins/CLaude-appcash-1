import type { NextRequest } from "next/server";
import { badRequest, handle, ok } from "@/lib/market/http";
import { searchInstruments } from "@/lib/market/provider";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length > 64) return badRequest("Paramètre « q » invalide.");
  return handle(async () => ok(await searchInstruments(q), 300));
}
