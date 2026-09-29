import type { NextRequest } from "next/server";
import { isValidDayKey } from "@/lib/dates";
import { badRequest, handle, ok, parseSymbol } from "@/lib/market/http";
import { getSeries } from "@/lib/market/provider";
import { isChartInterval, isChartRange } from "@/lib/market/ranges";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = parseSymbol(params.get("symbol"));
  if (!symbol) return badRequest("Paramètre « symbol » invalide.");
  const range = params.get("range");
  const from = params.get("from");
  const interval = params.get("interval");
  if (range && !isChartRange(range)) return badRequest("Paramètre « range » invalide.");
  if (from && !isValidDayKey(from)) return badRequest("Paramètre « from » invalide.");
  if (interval && !isChartInterval(interval)) return badRequest("Paramètre « interval » invalide.");
  if (!range && !from) return badRequest("Indiquez « range » ou « from ».");
  return handle(async () =>
    ok(
      await getSeries(symbol, {
        range: range && isChartRange(range) ? range : undefined,
        from: from ?? undefined,
        interval: interval && isChartInterval(interval) ? interval : undefined,
      }),
    ),
  );
}
