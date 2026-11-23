/** Plan defaults (seeded into `plans`; also used when the table is empty). */
import type { PlanQuotas } from "@/server/db/schema";

export const DEFAULT_PLANS: { code: "free" | "premium"; nameBn: string; priceBdt: number; billingPeriod: "daily" | "monthly"; quotas: PlanQuotas; featuresBn: string[] }[] = [
  {
    code: "free",
    nameBn: "ফ্রি",
    priceBdt: 0,
    billingPeriod: "daily",
    quotas: { ai_search_per_day: 10, cv_parse_per_day: 2, tailored_resume_per_day: 1 },
    featuresBn: ["সব সার্কুলার ও ফিল্টার", "যোগ্যতা যাচাই", "আবেদন ট্র্যাকার", "শেষ সময়ের রিমাইন্ডার"],
  },
  {
    code: "premium",
    nameBn: "প্রিমিয়াম",
    priceBdt: 4,
    billingPeriod: "daily",
    quotas: { ai_search_per_day: 100, cv_parse_per_day: 10, tailored_resume_per_day: 10 },
    featuresBn: ["ফ্রি প্ল্যানের সব কিছু", "দিনে বেশি AI সার্চ", "দিনে বেশি AI রিজিউমে সাজানো", "নতুন মিলের তাৎক্ষণিক অ্যালার্ট"],
  },
];

