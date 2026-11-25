import { describe, expect, it } from "vitest";
import { parseTeletalkPrivateJobs, TELETALK_PRIVATE_PAGE } from "@/domain/teletalk-private";

const at = "2026-11-26T08:00:00.000Z";

describe("parseTeletalkPrivateJobs", () => {
  it("reads the real empty response (26 Nov 2026)", () => {
    const r = parseTeletalkPrivateJobs({ status: "success", statusCode: 200, count: 0, privateJobs: [] }, at);
    expect(r).toEqual({ available: true, count: 0, jobs: [], checkedAt: at });
  });

  it("reads items with government-API style field names and builds the media PDF url", () => {
    const r = parseTeletalkPrivateJobs(
      {
        status: "success",
        count: 1,
        privateJobs: [{ _id: "abc", jobTitle: "Officer", orgName: "Example Bank PLC", applicationDeadline: "2026-12-20", advertisement_file: "ad/xyz.pdf" }],
      },
      at,
    );
    expect(r.available && r.jobs[0]).toEqual({
      id: "abc",
      title: "Officer",
      organization: "Example Bank PLC",
      deadline: "2026-12-20",
      pdfUrl: "https://alljobs.teletalk.com.bd/media/ad/xyz.pdf",
      pageUrl: TELETALK_PRIVATE_PAGE,
    });
  });

  it("falls back to other field names, nested organizations and any PDF-looking field", () => {
    const r = parseTeletalkPrivateJobs(
      { privateJobs: [{ id: 7, title: "Engineer", organization: { name: "Some Ltd" }, endDate: "2026-12-01", notice: "https://cdn.example.com/a.PDF" }] },
      at,
    );
    expect(r.available && r.jobs[0]).toMatchObject({ id: "7", title: "Engineer", organization: "Some Ltd", deadline: "2026-12-01", pdfUrl: "https://cdn.example.com/a.PDF" });
    expect(r.available && r.count).toBe(1);
  });

  it("marks the list unavailable on an error response or an unexpected shape", () => {
    expect(parseTeletalkPrivateJobs({ status: "error", message: { en: "x" } }, at)).toEqual({ available: false, checkedAt: at });
    expect(parseTeletalkPrivateJobs("<html>", at)).toEqual({ available: false, checkedAt: at });
    expect(parseTeletalkPrivateJobs({ status: "success" }, at)).toEqual({ available: false, checkedAt: at });
  });

  it("never crashes on items without a title or a PDF", () => {
    const r = parseTeletalkPrivateJobs({ privateJobs: [{}, null, { jobTitle: "Clerk" }] }, at);
    expect(r.available && r.jobs.map((j) => [j.title, j.pdfUrl])).toEqual([
      ["—", null],
      ["Clerk", null],
    ]);
  });
});
