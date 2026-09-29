import { handle, ok } from "@/lib/market/http";
import { getMovers } from "@/lib/market/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ok(await getMovers(), 60));
}
