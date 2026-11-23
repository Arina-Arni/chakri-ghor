import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** A checkout session the user is sent to. */
export type Checkout = { url: string; sessionId: string };

/** A verified, normalized payment event. */
export type PaymentEvent = {
  txnId: string;
  status: "succeeded" | "failed";
  amountBdt: number;
  userId: string;
  planCode: "premium";
  periodDays: number;
  raw: Record<string, unknown>;
};

/** Every provider (mock now; bKash / SSLCommerz / carrier billing at launch) implements this. */
export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: { userId: string; planCode: "premium"; amountBdt: number; periodDays: number }): Checkout;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
  parseEvent(rawBody: string): PaymentEvent;
}

export function sign(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Mock provider: the test-checkout page (clearly labelled) completes a session; the server
 * then delivers a signed webhook exactly like a real provider would.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  constructor(private readonly secret: string) {}

  createCheckout(input: { userId: string; planCode: "premium"; amountBdt: number; periodDays: number }): Checkout {
    const sessionId = `mock_${crypto.randomUUID()}`;
    const q = new URLSearchParams({ session: sessionId, amount: String(input.amountBdt) });
    return { url: `/billing/checkout/mock?${q}`, sessionId };
  }

  verifyWebhook(rawBody: string, signature: string | null): boolean {
    return Boolean(signature) && safeEqual(sign(this.secret, rawBody), signature!);
  }

  parseEvent(rawBody: string): PaymentEvent {
    const j = JSON.parse(rawBody) as Record<string, unknown>;
    if (typeof j.txnId !== "string" || typeof j.userId !== "string" || (j.status !== "succeeded" && j.status !== "failed")) {
      throw new Error("bad event");
    }
    return {
      txnId: j.txnId,
      status: j.status,
      amountBdt: Number(j.amountBdt ?? 0),
      userId: j.userId,
      planCode: "premium",
      periodDays: Number(j.periodDays ?? 1),
      raw: j,
    };
  }

  /** What the mock "gateway" posts back. */
  buildWebhook(e: Omit<PaymentEvent, "raw" | "planCode">): { body: string; signature: string } {
    const body = JSON.stringify({ ...e, provider: "mock" });
    return { body, signature: sign(this.secret, body) };
  }
}

let override: PaymentProvider | null = null;
export function setPaymentProviderForTests(p: PaymentProvider | null): void {
  override = p;
}

export function paymentProvider(secret: string): MockPaymentProvider | PaymentProvider {
  return override ?? new MockPaymentProvider(secret);
}
