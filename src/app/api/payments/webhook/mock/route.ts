import { NextResponse } from "next/server";
import { errorResponse } from "@/server/api/http";
import { newRequestId } from "@/server/context";
import { handlePaymentWebhook } from "@/server/services/billing";

/** Mock payment provider webhook: HMAC-signed, idempotent on provider_txn_id. */
export async function POST(req: Request) {
  const requestId = newRequestId();
  try {
    const raw = await req.text();
    const result = await handlePaymentWebhook(raw, req.headers.get("x-mock-signature"));
    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
    return errorResponse(e, requestId);
  }
}
