// TEMP — replaced by the real implementation in Part 2
import type { Organization } from "@/types";

type O = Omit<Organization, "openCircularCount" | "totalCircularCount" | "version" | "updatedAt">;

const base: O[] = [
  { id: "org_dck", slug: "dc-office-khulna", nameBn: "জেলা প্রশাসকের কার্যালয়, খুলনা", nameEn: "Deputy Commissioner's Office, Khulna", shortName: "DCK", type: "district_office", verified: true, website: "https://www.khulna.gov.bd" },
  { id: "org_dcr", slug: "dc-office-rajshahi", nameBn: "জেলা প্রশাসকের কার্যালয়, রাজশাহী", nameEn: "Deputy Commissioner's Office, Rajshahi", shortName: "DCR", type: "district_office", verified: true, website: "https://www.rajshahi.gov.bd" },
  { id: "org_dcrng", slug: "dc-office-rangpur", nameBn: "জেলা প্রশাসকের কার্যালয়, রংপুর", nameEn: "Deputy Commissioner's Office, Rangpur", shortName: "DCRP", type: "district_office", verified: true, website: "https://www.rangpur.gov.bd" },
  { id: "org_dpe", slug: "directorate-primary-education", nameBn: "প্রাথমিক শিক্ষা অধিদপ্তর", nameEn: "Directorate of Primary Education", shortName: "DPE", type: "directorate", verified: true, website: "https://dpe.gov.bd" },
  { id: "org_br", slug: "bangladesh-railway", nameBn: "বাংলাদেশ রেলওয়ে", nameEn: "Bangladesh Railway", shortName: "BR", type: "corporation", verified: true, website: "https://railway.gov.bd" },
  { id: "org_bsc", slug: "bankers-selection-committee", nameBn: "ব্যাংকার্স সিলেকশন কমিটি সচিবালয়", nameEn: "Bankers' Selection Committee Secretariat", shortName: "BSC", type: "bank", verified: true, website: "https://www.bb.org.bd" },
  { id: "org_dghs", slug: "directorate-general-health-services", nameBn: "স্বাস্থ্য অধিদপ্তর", nameEn: "Directorate General of Health Services", shortName: "DGHS", type: "directorate", verified: true, website: "https://dghs.gov.bd" },
  { id: "org_breb", slug: "rural-electrification-board", nameBn: "পল্লী বিদ্যুতায়ন বোর্ড", nameEn: "Bangladesh Rural Electrification Board", shortName: "REB", type: "autonomous", verified: true, website: "https://reb.gov.bd" },
  { id: "org_police", slug: "bangladesh-police", nameBn: "বাংলাদেশ পুলিশ", nameEn: "Bangladesh Police", shortName: "BP", type: "directorate", verified: true, website: "https://police.gov.bd" },
  { id: "org_bbs", slug: "bangladesh-bureau-of-statistics", nameBn: "বাংলাদেশ পরিসংখ্যান ব্যুরো", nameEn: "Bangladesh Bureau of Statistics", shortName: "BBS", type: "directorate", verified: true, website: "https://bbs.gov.bd" },
  { id: "org_dss", slug: "department-of-social-services", nameBn: "সমাজসেবা অধিদপ্তর", nameEn: "Department of Social Services", shortName: "DSS", type: "directorate", verified: true, website: "https://dss.gov.bd" },
  { id: "org_food", slug: "directorate-general-of-food", nameBn: "খাদ্য অধিদপ্তর", nameEn: "Directorate General of Food", shortName: "DGF", type: "directorate", verified: true, website: "https://dgfood.gov.bd" },
  { id: "org_mmch", slug: "mymensingh-medical-college-hospital", nameBn: "ময়মনসিংহ মেডিকেল কলেজ হাসপাতাল", nameEn: "Mymensingh Medical College Hospital", shortName: "MMCH", type: "autonomous", verified: true, website: null },
  { id: "org_dshe", slug: "directorate-secondary-higher-education", nameBn: "মাধ্যমিক ও উচ্চ শিক্ষা অধিদপ্তর", nameEn: "Directorate of Secondary and Higher Education", shortName: "DSHE", type: "directorate", verified: true, website: "https://dshe.gov.bd" },
  { id: "org_nilachal", slug: "nilachal-software", nameBn: "নীলাচল সফটওয়্যার লিমিটেড", nameEn: "Nilachal Software Ltd.", shortName: "NSL", type: "company", verified: true, website: "https://example.com/nilachal" },
  { id: "org_rongdhonu", slug: "rongdhonu-creative", nameBn: "রঙধনু ক্রিয়েটিভ স্টুডিও", nameEn: "Rongdhonu Creative Studio", shortName: "RCS", type: "company", verified: false, website: null },
  { id: "org_alor", slug: "alor-poth-unnayan", nameBn: "আলোর পথ উন্নয়ন সংস্থা", nameEn: "Alor Poth Unnayan Sangstha", shortName: "APUS", type: "ngo", verified: true, website: "https://example.org/alorpoth" },
  { id: "org_meghna", slug: "meghna-finance", nameBn: "মেঘনা ফিন্যান্স পিএলসি", nameEn: "Meghna Finance PLC", shortName: "MF", type: "company", verified: true, website: "https://example.com/meghna" },
  { id: "org_pathshala", slug: "digital-pathshala", nameBn: "ডিজিটাল পাঠশালা", nameEn: "Digital Pathshala", shortName: "DP", type: "company", verified: false, website: null },
  { id: "org_sobuj", slug: "sobuj-shakti", nameBn: "সবুজ শক্তি লিমিটেড", nameEn: "Sobuj Shakti Ltd.", shortName: "SSL", type: "company", verified: true, website: "https://example.com/sobuj" },
];

export const organizationSeeds: Organization[] = base.map((o) => ({
  ...o,
  openCircularCount: 0,
  totalCircularCount: 0,
  version: 1,
  updatedAt: "2026-10-01T04:00:00.000Z",
}));
