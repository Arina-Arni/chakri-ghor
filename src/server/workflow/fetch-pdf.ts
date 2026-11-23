import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { integrationEnv } from "@/env";
import { AppError } from "@/server/errors";

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;

/** *.gov.bd, teletalk.com.bd and the configured extra hosts. */
export function hostAllowed(host: string, extra: string[] = integrationEnv().INGEST_ALLOWED_HOSTS): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return h === "gov.bd" || h.endsWith(".gov.bd") || h === "teletalk.com.bd" || h.endsWith(".teletalk.com.bd") || extra.some((x) => h === x || h.endsWith(`.${x}`));
}

/** Loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw new AppError("VALIDATION", { fields: { url: "শুধু https লিংক গ্রহণযোগ্য" } });
  if (!hostAllowed(url.hostname)) throw new AppError("VALIDATION", { fields: { url: "এই ডোমেইন অনুমোদিত নয় (*.gov.bd, teletalk.com.bd)" } });
  if (isIP(url.hostname) && isPrivateIp(url.hostname)) throw new AppError("VALIDATION", { fields: { url: "ব্যক্তিগত নেটওয়ার্কের ঠিকানা অনুমোদিত নয়" } });
  const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new AppError("VALIDATION", { fields: { url: "ডোমেইনের ঠিকানা যাচাই করা যায়নি" } });
  }
}

/**
 * SSRF-safe PDF download (spec §2.7): allowlisted hosts, HTTPS only, every redirect re-checked,
 * private IPs blocked, 15 MB cap while streaming, PDF content-type and magic bytes.
 */
export async function fetchPdf(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError("VALIDATION", { fields: { url: "লিংক ঠিক নেই" } });
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok || !res.body) throw new AppError("VALIDATION", { fields: { url: `ফাইল আনা যায়নি (${res.status})` } });
    const type = res.headers.get("content-type") ?? "";
    if (!/application\/(pdf|octet-stream)/i.test(type)) throw new AppError("FILE_TYPE");
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_PDF_BYTES) throw new AppError("FILE_TOO_LARGE");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_PDF_BYTES) {
        await reader.cancel();
        throw new AppError("FILE_TOO_LARGE");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      bytes.set(c, o);
      o += c.length;
    }
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) throw new AppError("FILE_TYPE");
    return bytes;
  }
  throw new AppError("VALIDATION", { fields: { url: "অনেকবার রিডাইরেক্ট হয়েছে" } });
}
