import { ok } from "@/lib/api";
import { clearContractorSession } from "@/lib/contractor-auth";

export async function POST() {
  await clearContractorSession();
  return ok({ success: true });
}
