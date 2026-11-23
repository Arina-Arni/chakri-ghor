import { describe, expect, it } from "vitest";
import {
  dhakaDateKey,
  dhakaToUtc,
  formatDateBn,
  formatDateTimeBn,
  formatMoneyBn,
  formatNumberBn,
  formatRelativeBn,
  formatSalaryRangeBn,
  formatTimeBn,
  parseNumberInput,
  toBnDigits,
  toEnDigits,
} from "@/domain/bn";

describe("digits", () => {
  it("converts ASCII digits to Bangla", () => {
    expect(toBnDigits(1234567890)).toBe("১২৩৪৫৬৭৮৯০");
    expect(toBnDigits("ধাপ 2/3")).toBe("ধাপ ২/৩");
  });
  it("normalizes Bangla digits to ASCII", () => {
    expect(toEnDigits("০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
    expect(toEnDigits("abc ৯")).toBe("abc 9");
  });
  it("round-trips", () => {
    expect(toEnDigits(toBnDigits("2026-12-17"))).toBe("2026-12-17");
  });
  it("parses numbers typed with either digit set", () => {
    expect(parseNumberInput("৳২৫,০০০")).toBe(25000);
    expect(parseNumberInput("50000")).toBe(50000);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("১২ক")).toBeNull();
  });
});

describe("dates in Asia/Dhaka", () => {
  // 11:00 UTC = 17:00 in Dhaka (UTC+6)
  const instant = "2026-12-17T11:00:00.000Z";

  it("formats a date", () => {
    expect(formatDateBn(instant)).toBe("১৭ ডিসেম্বর ২০২৬");
  });
  it("formats date and time like the spec example", () => {
    expect(formatDateTimeBn(instant)).toBe("১৭ ডিসেম্বর ২০২৬, বিকাল ৫:০০");
  });
  it("uses Dhaka, not UTC, for the calendar day", () => {
    // 20:30 UTC on the 17th is 02:30 on the 18th in Dhaka
    expect(formatDateBn("2026-12-17T20:30:00Z")).toBe("১৮ ডিসেম্বর ২০২৬");
    expect(dhakaDateKey("2026-12-17T20:30:00Z")).toBe("2026-12-18");
    expect(formatTimeBn("2026-12-17T20:30:00Z")).toBe("রাত ২:৩০");
  });
  it("labels noon and morning", () => {
    expect(formatTimeBn(dhakaToUtc("2026-01-01", "12:00"))).toBe("দুপুর ১২:০০");
    expect(formatTimeBn(dhakaToUtc("2026-01-01", "09:05"))).toBe("সকাল ৯:০৫");
  });
  it("converts Dhaka wall clock to UTC", () => {
    expect(dhakaToUtc("2026-12-17", "17:00").toISOString()).toBe(instant);
  });
  it("adds the weekday when asked", () => {
    expect(formatDateBn(instant, { withWeekday: true })).toBe("বৃহস্পতিবার, ১৭ ডিসেম্বর ২০২৬");
  });
});

describe("relative time", () => {
  const now = new Date("2026-11-23T10:00:00Z");
  it("handles past and future", () => {
    expect(formatRelativeBn("2026-11-22T10:00:00Z", now)).toBe("১ দিন আগে");
    expect(formatRelativeBn("2026-11-23T09:55:00Z", now)).toBe("৫ মিনিট আগে");
    expect(formatRelativeBn("2026-11-23T07:00:00Z", now)).toBe("৩ ঘণ্টা আগে");
    expect(formatRelativeBn("2026-11-26T10:00:00Z", now)).toBe("৩ দিন পরে");
    expect(formatRelativeBn("2026-11-23T09:59:40Z", now)).toBe("এইমাত্র");
  });
});

describe("money", () => {
  it("uses South Asian grouping and Bangla digits", () => {
    expect(formatMoneyBn(25000)).toBe("৳২৫,০০০");
    expect(formatMoneyBn(125000)).toBe("৳১,২৫,০০০");
    expect(formatMoneyBn(4)).toBe("৳৪");
    expect(formatNumberBn(12345678)).toBe("১,২৩,৪৫,৬৭৮");
  });
  it("formats salary ranges", () => {
    expect(formatSalaryRangeBn(9300, 22490)).toBe("৳৯,৩০০–২২,৪৯০");
    expect(formatSalaryRangeBn(50000, null)).toBe("৳৫০,০০০+");
    expect(formatSalaryRangeBn(null, null)).toBeNull();
  });
});
