import { describe, expect, it } from "vitest";
import { displayStatus } from "@/domain/status";
import {
  countdownLevel,
  crossedThreshold,
  formatCountdownBn,
  getCountdown,
  serverNow,
  setServerNow,
} from "@/domain/countdown";

const H = 3_600_000;
const now = new Date("2026-11-23T06:00:00Z").getTime();
const at = (ms: number) => new Date(now + ms).toISOString();

describe("displayStatus", () => {
  it("is upcoming before the start", () => {
    expect(displayStatus({ startAt: at(H), endAt: at(100 * H) }, now)).toBe("upcoming");
  });
  it("is open with more than 48 h left", () => {
    expect(displayStatus({ startAt: at(-H), endAt: at(49 * H) }, now)).toBe("open");
  });
  it("is closing_soon at exactly 48 h left and below", () => {
    expect(displayStatus({ startAt: at(-H), endAt: at(48 * H) }, now)).toBe("closing_soon");
    expect(displayStatus({ startAt: at(-H), endAt: at(2 * H) }, now)).toBe("closing_soon");
  });
  it("is closed at and after the end", () => {
    expect(displayStatus({ startAt: at(-10 * H), endAt: at(0) }, now)).toBe("closed");
    expect(displayStatus({ startAt: at(-10 * H), endAt: at(-24 * H) }, now)).toBe("closed");
  });
});

describe("countdown", () => {
  it("formats days and hours from 24 h up", () => {
    expect(formatCountdownBn(2 * 24 * H + 4 * H + 5 * 60_000)).toBe("২ দিন ৪ ঘণ্টা");
    expect(formatCountdownBn(3 * 24 * H)).toBe("৩ দিন");
  });
  it("formats hh:mm under 24 h", () => {
    expect(formatCountdownBn(11 * H + 58 * 60_000 + 30_000)).toBe("১১:৫৮");
    expect(formatCountdownBn(2 * H + 5 * 60_000)).toBe("০২:০৫");
  });
  it("returns empty text when closed", () => {
    expect(formatCountdownBn(0)).toBe("");
  });
  it("picks levels by threshold", () => {
    expect(countdownLevel(72 * H)).toBe("normal");
    expect(countdownLevel(47 * H)).toBe("warning");
    expect(countdownLevel(2 * H)).toBe("danger");
    expect(countdownLevel(-1)).toBe("closed");
  });
  it("builds a countdown from an end date", () => {
    expect(getCountdown(at(2 * H), now)).toMatchObject({ level: "danger", text: "০২:০০" });
  });
  it("announces only when a threshold is crossed", () => {
    expect(crossedThreshold(3 * H + 1000, 3 * H - 1000)).toBe(true);
    expect(crossedThreshold(2 * H, 2 * H - 1000)).toBe(false);
  });
  it("corrects a wrong device clock with the server offset", () => {
    const deviceNow = Date.now();
    setServerNow(deviceNow + 10 * H, deviceNow);
    expect(Math.round((serverNow() - Date.now()) / H)).toBe(10);
    setServerNow(Date.now());
  });
});
