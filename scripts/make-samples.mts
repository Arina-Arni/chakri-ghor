/**
 * `npm run samples` — writes demo circular PDFs to /samples for live ingestion:
 *   notice-text.pdf      a text PDF (unpdf path)
 *   notice-scanned.pdf   an image-only PDF with no text layer (Gemini vision path)
 *   notice-text-copy.pdf a byte-identical copy of the first (duplicate detection)
 * Standard PDF fonts have no Bangla glyphs, so the sample text is English.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import React from "react";
import { Document, Page, Path, Rect, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";

const h = React.createElement;
const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

const lines = [
  "Government of the People's Republic of Bangladesh",
  "Office of the Deputy Commissioner, Khulna",
  "Recruitment Notice",
  `Memo No: 05.44.4700.009.11.DEMO.${new Date().getUTCFullYear()}`,
  `Date of publication: ${day(-1)}`,
  "Applications are invited from Bangladeshi citizens for the following posts (Class 3).",
  "1. Office Assistant cum Computer Typist — 6 posts — Grade 16 — Tk 9,300–22,490",
  "   Minimum education: HSC. Typing speed: Bangla 20, English 20 words per minute.",
  "2. Office Support Staff — 4 posts — Grade 20 — Tk 8,250–20,010. Minimum education: SSC.",
  "Eligible districts: Khulna, Bagerhat, Satkhira.",
  "Age: 18 to 32 years on the age reference date; 2 years relaxation for children of freedom fighters.",
  `Age reference date: ${day(-1)}`,
  `Online application starts: ${day(0)} 10:00 AM`,
  `Last date of application: ${day(14)} 5:00 PM`,
  "Apply online: https://dck.teletalk.com.bd  Fee: Tk 112 (SMS via Teletalk prepaid).",
  "SAMPLE DOCUMENT FOR CHAKRI RADAR DEMO — NOT A REAL NOTICE.",
];

async function main() {
  mkdirSync("samples", { recursive: true });
  const textPdf = h(
    Document,
    { title: "Sample recruitment notice (text)" },
    h(Page, { size: "A4", style: { padding: 48, fontSize: 11, lineHeight: 1.5 } }, ...lines.map((l, i) => h(Text, { key: i, style: i < 3 ? { fontSize: 13, textAlign: "center", marginBottom: 4 } : { marginBottom: 6 } }, l))),
  );
  writeFileSync("samples/notice-text.pdf", await renderToBuffer(textPdf as never));
  copyFileSync("samples/notice-text.pdf", "samples/notice-text-copy.pdf");

  // Image-only page: vector "ink" strokes and no text objects, like a scan.
  const strokes = Array.from({ length: 28 }, (_, i) => {
    const y = 60 + i * 26;
    const w = 380 + ((i * 37) % 120);
    return h(Path, { key: i, d: `M 40 ${y} C ${40 + w / 3} ${y - 4}, ${40 + (2 * w) / 3} ${y + 4}, ${40 + w} ${y}`, stroke: "#222", strokeWidth: 3 });
  });
  const scanned = h(
    Document,
    { title: "Sample recruitment notice (scanned)" },
    h(Page, { size: "A4", style: { padding: 24 } }, h(View, null, h(Svg, { width: 540, height: 760 }, h(Rect, { x: 0, y: 0, width: 540, height: 760, fill: "#f4f1ea" }), ...strokes))),
  );
  writeFileSync("samples/notice-scanned.pdf", await renderToBuffer(scanned as never));
  console.log("Wrote samples/notice-text.pdf, samples/notice-text-copy.pdf, samples/notice-scanned.pdf");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
