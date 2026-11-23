import "server-only";
import { safeEqual } from "@/server/payments/provider";

/** `Authorization: Bearer <CRON_SECRET>` checked in constant time. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${secret}`);
}
