// CI guard: the client bundle (.next/static) must not contain server secrets.
// Checks well-known secret shapes and, when set, the actual values of server-only env vars.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const dir = ".next/static";
if (!existsSync(dir)) {
  console.error("No .next/static — run `npm run build` first.");
  process.exit(1);
}

const patterns = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "Supabase secret key"],
  [/"role"\s*:\s*"service_role"/, "Supabase service-role JWT payload"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"],
  [/re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/, "Resend API key"],
  [/postgres(ql)?:\/\/[^"'\s]+:[^"'\s]+@/, "Database URL with password"],
  [/SUPABASE_SERVICE_ROLE_KEY|PAYMENT_WEBHOOK_SECRET|CRON_SECRET|IP_HASH_SALT|GEMINI_API_KEY|RESEND_API_KEY/, "server-only env var name"],
];
const values = ["SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "RESEND_API_KEY", "CRON_SECRET", "PAYMENT_WEBHOOK_SECRET", "IP_HASH_SALT", "DATABASE_URL", "DIRECT_URL"]
  .map((k) => [process.env[k], k])
  .filter(([v]) => v && v.length >= 12);

const hits = [];
function walk(d) {
  for (const name of readdirSync(d)) {
    const p = path.join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|mjs|css|json|map|txt)$/.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const [re, label] of patterns) if (re.test(text)) hits.push(`${p}: ${label}`);
      for (const [v, k] of values) if (text.includes(v)) hits.push(`${p}: value of ${k}`);
    }
  }
}
walk(dir);
if (hits.length) {
  console.error("Possible secrets in the client bundle:\n" + hits.map((h) => `  - ${h}`).join("\n"));
  process.exit(1);
}
console.log("OK: no secrets in the client bundle.");
