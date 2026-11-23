import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const DHAKA_TZ = "Asia/Dhaka";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;

/** Replace ASCII digits with Bangla digits. Other characters are kept. */
export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Replace Bangla digits with ASCII digits (input normalization before validation). */
export function toEnDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

export const BN_MONTHS = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
] as const;

export const BN_WEEKDAYS = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
] as const;

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Calendar parts of an instant as seen in Asia/Dhaka. */
export function dhakaParts(value: DateInput) {
  const s = formatInTimeZone(toDate(value), DHAKA_TZ, "yyyy M d H m s i");
  const [year, month, day, hour, minute, second, isoWeekday] = s.split(" ").map(Number);
  return { year, month, day, hour, minute, second, weekday: isoWeekday % 7 };
}

/** "YYYY-MM-DD" of an instant in Asia/Dhaka. */
export function dhakaDateKey(value: DateInput): string {
  return formatInTimeZone(toDate(value), DHAKA_TZ, "yyyy-MM-dd");
}

/** UTC instant for a wall-clock time in Asia/Dhaka, e.g. ("2026-12-17", "17:00"). */
export function dhakaToUtc(date: string, time = "00:00"): Date {
  return fromZonedTime(`${date}T${time}:00`, DHAKA_TZ);
}

/** Bangla part of day used before 12-hour times. */
export function dayPartBn(hour: number): string {
  if (hour >= 4 && hour < 6) return "ভোর";
  if (hour >= 6 && hour < 12) return "সকাল";
  if (hour >= 12 && hour < 15) return "দুপুর";
  if (hour >= 15 && hour < 18) return "বিকাল";
  if (hour >= 18 && hour < 20) return "সন্ধ্যা";
  return "রাত";
}

/** "১৭ ডিসেম্বর ২০২৬" */
export function formatDateBn(value: DateInput, opts: { withWeekday?: boolean } = {}): string {
  const p = dhakaParts(value);
  const base = `${toBnDigits(p.day)} ${BN_MONTHS[p.month - 1]} ${toBnDigits(p.year)}`;
  return opts.withWeekday ? `${BN_WEEKDAYS[p.weekday]}, ${base}` : base;
}

/** "বিকাল ৫:০০" */
export function formatTimeBn(value: DateInput): string {
  const p = dhakaParts(value);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${dayPartBn(p.hour)} ${toBnDigits(h12)}:${toBnDigits(String(p.minute).padStart(2, "0"))}`;
}

/** "১৭ ডিসেম্বর ২০২৬, বিকাল ৫:০০" */
export function formatDateTimeBn(value: DateInput): string {
  return `${formatDateBn(value)}, ${formatTimeBn(value)}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "এইমাত্র", "৫ মিনিট আগে", "১ দিন আগে", "৩ দিন পরে" … */
export function formatRelativeBn(value: DateInput, now: DateInput = Date.now()): string {
  const diff = toDate(now).getTime() - toDate(value).getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "আগে" : "পরে";
  if (abs < MINUTE) return "এইমাত্র";
  let amount: number;
  let unit: string;
  if (abs < HOUR) [amount, unit] = [Math.floor(abs / MINUTE), "মিনিট"];
  else if (abs < DAY) [amount, unit] = [Math.floor(abs / HOUR), "ঘণ্টা"];
  else if (abs < 30 * DAY) [amount, unit] = [Math.floor(abs / DAY), "দিন"];
  else if (abs < 365 * DAY) [amount, unit] = [Math.floor(abs / (30 * DAY)), "মাস"];
  else [amount, unit] = [Math.floor(abs / (365 * DAY)), "বছর"];
  return `${toBnDigits(amount)} ${unit} ${suffix}`;
}

/** South Asian grouping: 1,00,000. Returns ASCII digits. */
function groupSouthAsian(n: number): string {
  const [int, frac] = Math.abs(n).toString().split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
  return (n < 0 ? "-" : "") + grouped + (frac ? `.${frac}` : "");
}

/** "১,২৪,৫০০" */
export function formatNumberBn(n: number): string {
  return toBnDigits(groupSouthAsian(n));
}

/** "৳২৫,০০০" */
export function formatMoneyBn(amount: number): string {
  return `৳${formatNumberBn(Math.round(amount))}`;
}

/** "৳২২,০০০–৫৩,০৬০" or "৳২২,০০০+" or null when nothing is known. */
export function formatSalaryRangeBn(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `৳${formatNumberBn(min)}–${formatNumberBn(max)}`;
  if (min != null) return `৳${formatNumberBn(min)}+`;
  if (max != null) return `সর্বোচ্চ ৳${formatNumberBn(max)}`;
  return null;
}

/** Parse a number typed with Bangla or English digits (commas allowed). */
export function parseNumberInput(input: string): number | null {
  const clean = toEnDigits(input).replace(/[,\s৳]/g, "");
  if (clean === "" || !/^-?\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}
