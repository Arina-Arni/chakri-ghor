// CI guard: Part 1 fixtures are gone; nothing may import them again.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const roots = ["src", "tests", "scripts"];
const bad = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name) && !p.endsWith("check-no-fixtures.mjs")) {
      const text = readFileSync(p, "utf8");
      if (/data\/fixtures/.test(text)) bad.push(p);
    }
  }
}
for (const r of roots) if (existsSync(r)) walk(r);
if (existsSync("src/data/fixtures")) bad.push("src/data/fixtures/ still exists");
if (bad.length) {
  console.error("Fixture imports found:\n" + bad.map((b) => `  - ${b}`).join("\n"));
  process.exit(1);
}
console.log("OK: no fixture imports.");