import "server-only";
import { Resend } from "resend";
import { integrationEnv } from "@/env";
import type { Mailer } from "./outbox";

let override: Mailer | null | undefined;
export function setMailerForTests(m: Mailer | null | undefined): void {
  override = m;
}

/** Resend behind the Mailer interface; null when RESEND_API_KEY is not set (emails stay queued). */
export function mailer(): Mailer | null {
  if (override !== undefined) return override;
  const env = integrationEnv();
  if (!env.RESEND_API_KEY) return null;
  const client = new Resend(env.RESEND_API_KEY);
  return {
    async send(m, signal) {
      const timeout = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("email send timed out (10 s)"))));
      const res = await Promise.race([client.emails.send({ from: env.EMAIL_FROM, to: m.to, subject: m.subject, html: m.html, text: m.text }), timeout]);
      if (res.error) throw new Error(`${res.error.name}: ${res.error.message}`);
      return { id: res.data?.id ?? "unknown" };
    },
  };
}
