import { toEnDigits } from "@/domain/bn";
import type { CvParseResult, ProfileLink } from "@/types";

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_MAX_PDF_PAGES = 10;

export type CvKind = "pdf" | "docx" | "txt";

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Detect the real file type from its first bytes (never trust the name or MIME type). */
export function sniffCvType(bytes: Uint8Array, fileName: string): CvKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // DOCX is a ZIP whose entries include "word/".
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
    return head.includes("word/") || head.includes("[Content_Types].xml") ? "docx" : null;
  }
  if (/\.txt$/i.test(fileName) && isPlainText(bytes)) return "txt";
  return null;
}

function isPlainText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length === bytes.length ? sample : bytes.subarray(0, Math.min(bytes.length, 8192 + 3)));
    return true;
  } catch {
    // A multi-byte character may be cut at the sample edge; accept if most bytes are text.
    return sample.filter((b) => b < 9 || (b > 13 && b < 32)).length < sample.length * 0.01;
  }
}

/** Password-protected PDFs carry an /Encrypt entry in the trailer. */
export function pdfLooksEncrypted(bytes: Uint8Array): boolean {
  const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 64 * 1024)));
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
  return /\/Encrypt\s/.test(tail) || /\/Encrypt\s/.test(head);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?88)?0?1[3-9][\d\s-]{8,11}/;
const URL_RE = /\bhttps?:\/\/[^\s)>"']+|\b(?:www\.)?(?:linkedin\.com|github\.com|behance\.net|bdjobs\.com)\/[^\s)>"']+/gi;

const SECTION_RE = {
  skills: /^\s*(skills?|technical skills|key skills|দক্ষতা)\s*:?\s*$/i,
  experience: /^\s*(experience|work experience|employment history|professional experience|অভিজ্ঞতা)\s*:?\s*$/i,
  education: /^\s*(education|academic qualifications?|শিক্ষাগত যোগ্যতা|শিক্ষা)\s*:?\s*$/i,
  summary: /^\s*(summary|profile|career objective|objective|about me|পরিচিতি|সারসংক্ষেপ)\s*:?\s*$/i,
};
type Section = keyof typeof SECTION_RE;

function linkLabel(url: string): string {
  if (/linkedin/i.test(url)) return "LinkedIn";
  if (/github/i.test(url)) return "GitHub";
  if (/behance/i.test(url)) return "Behance";
  return "Website";
}

function looksLikeName(line: string): boolean {
  const words = line.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5 || line.length > 60) return false;
  if (EMAIL_RE.test(line) || /\d/.test(toEnDigits(line))) return false;
  if (Object.values(SECTION_RE).some((re) => re.test(line))) return false;
  return words.every((w) => /^[\p{L}\p{M}.'-]+$/u.test(w));
}

/**
 * Regex extraction (spec §5.3): contact details always; name, summary and skills when the
 * CV has obvious section headings. Never guesses dates or employers.
 */
export function extractCvFields(rawText: string): CvParseResult {
  const text = rawText.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const extracted: CvParseResult["extracted"] = {};

  const email = text.match(EMAIL_RE)?.[0];
  if (email) extracted.email = email.toLowerCase();
  const phoneRaw = toEnDigits(text).match(PHONE_RE)?.[0];
  if (phoneRaw) {
    const digits = phoneRaw.replace(/\D/g, "").replace(/^88/, "");
    const local = digits.startsWith("0") ? digits : `0${digits}`;
    if (/^01[3-9]\d{8}$/.test(local)) extracted.phone = local;
  }
  const links: ProfileLink[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].startsWith("http") ? m[0] : `https://${m[0]}`;
    if (!links.some((l) => l.url === url)) links.push({ label: linkLabel(url), url: url.replace(/[.,;]+$/, "") });
  }
  if (links.length) extracted.links = links.slice(0, 5);

  const firstLine = lines[0];
  if (firstLine && looksLikeName(firstLine)) extracted.fullName = firstLine;

  // Collect lines under obvious headings.
  const sections: Partial<Record<Section, string[]>> = {};
  let current: Section | null = null;
  for (const line of lines) {
    const hit = (Object.keys(SECTION_RE) as Section[]).find((k) => SECTION_RE[k].test(line));
    if (hit) {
      current = hit;
      sections[hit] = [];
      continue;
    }
    if (current) sections[current]!.push(line);
  }
  if (sections.summary?.length) extracted.summary = sections.summary.slice(0, 4).join(" ").slice(0, 1000);
  if (sections.skills?.length) {
    const skills = sections.skills
      .slice(0, 8)
      .flatMap((l) => l.split(/[,;•·|]/))
      .map((s) => s.replace(/^[-*\s]+/, "").trim())
      .filter((s) => s.length > 1 && s.length <= 40);
    if (skills.length) extracted.skills = [...new Set(skills)].slice(0, 30);
  }

  const filled = Object.keys(extracted).filter((k) => !["email", "phone", "links"].includes(k));
  return {
    status: filled.length > 0 ? "parsed" : "partial",
    extracted,
    aiFilledFields: filled,
  };
}
