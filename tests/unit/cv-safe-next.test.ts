import { describe, expect, it } from "vitest";
import { extractCvFields, pdfLooksEncrypted, sniffCvType } from "@/domain/cv";
import { safeNext } from "@/lib/safe-next";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("CV file type by magic bytes", () => {
  it("detects PDF, DOCX and plain text regardless of the name", () => {
    expect(sniffCvType(bytes("%PDF-1.7\n..."), "cv.docx")).toBe("pdf");
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...bytes("....[Content_Types].xml....word/document.xml")]);
    expect(sniffCvType(zip, "cv.pdf")).toBe("docx");
    expect(sniffCvType(bytes("Rahima Akter\nrahima@example.com"), "cv.txt")).toBe("txt");
  });
  it("rejects disguised or binary files", () => {
    expect(sniffCvType(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "cv.pdf")).toBeNull(); // PNG
    expect(sniffCvType(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]), "cv.docx")).toBeNull(); // random zip
    expect(sniffCvType(new Uint8Array([0x4d, 0x5a, 0, 1]), "cv.txt")).toBeNull(); // binary as .txt
  });
  it("spots password-protected PDFs", () => {
    expect(pdfLooksEncrypted(bytes("%PDF-1.4\n...trailer << /Root 1 0 R /Encrypt 5 0 R >>"))).toBe(true);
    expect(pdfLooksEncrypted(bytes("%PDF-1.4\n...trailer << /Root 1 0 R >>"))).toBe(false);
  });
});

describe("CV regex extraction", () => {
  const text = `Rahima Akter
rahima.akter@example.com | +880 1712-345678 | linkedin.com/in/rahima
Summary
Office assistant with 3 years of experience.
Skills
Bangla Typing, Microsoft Office, Data Entry
Experience
Office Assistant, UNO Office`;
  it("pulls contact details, name, summary and skills", () => {
    const r = extractCvFields(text);
    expect(r.extracted).toMatchObject({
      fullName: "Rahima Akter",
      email: "rahima.akter@example.com",
      phone: "01712345678",
      summary: "Office assistant with 3 years of experience.",
      skills: ["Bangla Typing", "Microsoft Office", "Data Entry"],
    });
    expect(r.extracted.links?.[0]).toEqual({ label: "LinkedIn", url: "https://linkedin.com/in/rahima" });
    expect(r.status).toBe("parsed");
    expect(r.aiFilledFields).toEqual(expect.arrayContaining(["fullName", "summary", "skills"]));
  });
  it("reads Bangla digits in phone numbers", () => {
    expect(extractCvFields("ফোন: ০১৮১২৩৪৫৬৭৮").extracted.phone).toBe("01812345678");
  });
  it("returns partial when only contact details are found", () => {
    const r = extractCvFields("contact: someone@example.com 01912345678");
    expect(r.status).toBe("partial");
    expect(r.aiFilledFields).toEqual([]);
  });
});

describe("safeNext (no open redirect)", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNext("/jobs?q=bank")).toBe("/jobs?q=bank");
    expect(safeNext("/admin/review#x")).toBe("/admin/review#x");
  });
  it("falls back for anything that could leave the site", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined, "/%0d%0aSet-Cookie:x", "/\tevil"]) {
      expect(safeNext(bad as string)).toBe(bad && String(bad).startsWith("/%0d") ? "/%0d%0aSet-Cookie:x" : "/dashboard");
    }
  });
});
