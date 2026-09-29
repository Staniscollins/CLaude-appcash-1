import { ok } from "@/lib/market/http";
import { dataStatus } from "@/lib/market/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(dataStatus());
}
