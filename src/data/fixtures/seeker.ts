// TEMP — replaced by the real implementation in Part 2
import { computeAtsScore } from "@/domain/ats";
import type {
  Application,
  ApplicationStatus,
  Billing,
  Circular,
  Notification,
  Profile,
  Resume,
  ResumeContent,
  SavedSearch,
  Settings,
} from "@/types";

const H = 3_600_000;
const DAY = 24 * H;

export function buildProfile(now: number): Profile {
  return {
    userId: "usr_seeker",
    fullName: "রহিমা আক্তার",
    dateOfBirth: "1995-01-02",
    gender: "female",
    phone: "01712345678",
    email: "rahima@example.com",
    homeDistrictId: "dis_khulna",
    currentDistrictId: "dis_khulna",
    specialCategories: [],
    headline: "অফিস সহকারী · ৩ বছরের অভিজ্ঞতা",
    summary:
      "জেলা পর্যায়ের অফিসে নথি ব্যবস্থাপনা, কম্পিউটার টাইপিং ও ডাটা এন্ট্রিতে ৩ বছরের অভিজ্ঞতা। বাংলা ও ইংরেজি টাইপিংয়ে দ্রুত ও নির্ভুল।",
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example" }],
    experiences: [
      {
        id: "exp_1",
        title: "অফিস সহকারী (চুক্তিভিত্তিক)",
        organization: "উপজেলা নির্বাহী অফিসারের কার্যালয়, ডুমুরিয়া",
        startDate: "2023-02-01",
        endDate: null,
        current: true,
        bullets: ["দৈনিক ৪০+ চিঠি বাংলা ও ইংরেজিতে টাইপ", "নথি ও রেজিস্টার হালনাগাদ রাখা"],
      },
      {
        id: "exp_2",
        title: "ডাটা এন্ট্রি অপারেটর",
        organization: "খুলনা সিটি কম্পিউটার সেন্টার",
        startDate: "2021-06-01",
        endDate: "2023-01-15",
        current: false,
        bullets: ["প্রতিদিন ৩০০+ রেকর্ড এন্ট্রি ও যাচাই"],
      },
    ],
    educations: [
      {
        id: "edu_1",
        level: "hsc",
        degreeName: "এইচএসসি",
        subject: "ব্যবসায় শিক্ষা",
        institution: "সরকারি মজিদ মেমোরিয়াল সিটি কলেজ",
        board: "যশোর",
        passingYear: 2013,
        result: "GPA 4.50",
      },
      {
        id: "edu_2",
        level: "bachelor",
        degreeName: "বিবিএস (পাস)",
        subject: "হিসাববিজ্ঞান",
        institution: "খুলনা বিশ্ববিদ্যালয় কলেজ",
        board: null,
        passingYear: 2017,
        result: "দ্বিতীয় শ্রেণি",
      },
    ],
    skills: ["Computer Typing", "Bangla Typing", "MS Office", "Data Entry", "Record Keeping"],
    preferences: {
      categoryIds: ["cat_admin", "cat_bank"],
      districtIds: ["dis_khulna", "dis_jashore"],
      sectors: ["government"],
      jobTypes: ["full_time"],
      workModes: ["onsite"],
      minSalary: null,
    },
    aiFilledFields: [],
    onboardingStep: 4,
    onboardingCompleted: true,
    completeness: 85,
    missingItems: ["ন্যূনতম বেতনের পছন্দ", "সার্টিফিকেট"],
    version: 3,
    updatedAt: new Date(now - 2 * DAY).toISOString(),
  };
}

export function buildApplications(now: number, circulars: Circular[]): Application[] {
  const bySlug = new Map(circulars.map((c) => [c.slug, c]));
  const rows: [string, ApplicationStatus, Partial<Application>][] = [
    ["dpe-assistant-teacher-2026", "interested", { nextActionBn: "আজ রাতের মধ্যে আবেদন করুন" }],
    ["dc-khulna-office-assistant-2026", "applied", { applicantRef: "DCKLN-7F3K2Q", feePaid: false, nextActionBn: "৭২ ঘণ্টার মধ্যে ফি জমা দিন" }],
    ["food-sub-inspector-2026", "applied", { applicantRef: "DGFOOD-91AA2", feePaid: true, nextActionBn: "প্রবেশপত্রের জন্য অপেক্ষা করুন" }],
    ["railway-khalashi-2026", "admit_card", { applicantRef: "BRW-55120", feePaid: true, nextActionBn: "প্রবেশপত্র ডাউনলোড করুন" }],
    ["bsc-senior-officer-2026", "exam", { applicantRef: "BSC-SO-33019", feePaid: true, examAt: new Date(now + 5 * DAY + 4 * H).toISOString(), examVenue: "খুলনা জিলা স্কুল", nextActionBn: "পরীক্ষার কেন্দ্র দেখে নিন" }],
    ["dc-rajshahi-office-sohayok-2026", "viva", { applicantRef: "DCRAJ-1182", feePaid: true, examAt: new Date(now + 12 * DAY).toISOString(), examVenue: "জেলা প্রশাসকের সম্মেলন কক্ষ, রাজশাহী", nextActionBn: "মূল সনদপত্র সঙ্গে নিন" }],
    ["dc-khulna-driver-2025", "rejected", { applicantRef: "DCKLN-DRV-40", feePaid: true }],
    ["meghna-cash-officer", "selected", { nextActionBn: "যোগদানপত্র জমা দিন" }],
    ["alor-poth-field-officer", "withdrawn", {}],
  ];
  return rows.map(([slug, status, extra], i) => {
    const c = bySlug.get(slug)!;
    const post = c.posts[0];
    const created = now - (10 - i) * DAY;
    const flow: ApplicationStatus[] = ["interested", "applied", "admit_card", "exam", "viva"];
    const reached = flow.indexOf(status);
    const path: ApplicationStatus[] =
      reached >= 0 ? flow.slice(0, reached + 1) : status === "withdrawn" ? ["interested", "withdrawn"] : ["interested", "applied", "exam", status];
    const events = path.map((to, k) => ({
      id: `evt_${i}_${k}`,
      applicationId: `app_${i + 1}`,
      fromStatus: k === 0 ? null : path[k - 1],
      toStatus: to,
      note: null,
      createdAt: new Date(created + k * DAY).toISOString(),
    }));
    return {
      id: `app_${i + 1}`,
      circularId: c.id,
      circularSlug: c.slug,
      postId: post.id,
      jobTitleBn: post.titleBn,
      organizationNameBn: c.organization.nameBn,
      organizationShortName: c.organization.shortName,
      status,
      deadlineAt: c.endAt,
      examAt: null,
      examVenue: null,
      applicantRef: null,
      feePaid: false,
      notes: "",
      nextActionBn: null,
      events,
      createdAt: new Date(created).toISOString(),
      updatedAt: events[events.length - 1].createdAt,
      version: 1,
      ...extra,
    };
  });
}

const baseContent: ResumeContent = {
  contact: {
    fullName: "Rahima Akter",
    email: "rahima@example.com",
    phone: "01712345678",
    location: "Khulna, Bangladesh",
    links: ["linkedin.com/in/example"],
  },
  headline: "Office Assistant",
  summary:
    "Office assistant with three years of experience in a government upazila office, handling computer typing in Bangla and English, data entry, record keeping and official correspondence with speed and accuracy.",
  skills: ["Computer Typing", "Bangla Typing", "MS Office", "Data Entry", "Record Keeping"],
  experience: [
    {
      id: "rx1",
      title: "Office Assistant (Contract)",
      organization: "Upazila Nirbahi Officer's Office, Dumuria",
      location: "Khulna",
      startDate: "Feb 2023",
      endDate: "Present",
      bullets: [
        "Typed 40+ official letters a day in Bangla and English",
        "Kept registers and files up to date for audits",
      ],
    },
    {
      id: "rx2",
      title: "Data Entry Operator",
      organization: "Khulna City Computer Centre",
      location: "Khulna",
      startDate: "Jun 2021",
      endDate: "Jan 2023",
      bullets: ["Entered and verified 300+ records daily with 99% accuracy"],
    },
  ],
  education: [
    { id: "re1", degree: "BBS (Pass), Accounting", institution: "Khulna University College", year: "2017", result: "Second Class" },
    { id: "re2", degree: "HSC, Business Studies", institution: "Govt. Majid Memorial City College", year: "2013", result: "GPA 4.50" },
  ],
  certifications: ["Computer Office Application — BTEB (2019)"],
  languages: ["Bangla (native)", "English (professional)"],
};

export function buildResumes(now: number, circulars: Circular[]): Resume[] {
  const dck = circulars.find((c) => c.slug === "dc-khulna-office-assistant-2026")!;
  const dev = circulars.find((c) => c.slug === "nilachal-frontend-developer")!;
  const dckPost = dck.posts[0];
  const devPost = dev.posts[0];

  const tailoredContent: ResumeContent = {
    ...baseContent,
    headline: "Office Assistant cum Computer Typist",
    skills: [...baseContent.skills, "Microsoft Office", "Correspondence"],
  };
  const devContent: ResumeContent = {
    ...baseContent,
    headline: "Aspiring Frontend Developer",
    skills: ["HTML", "CSS", "JavaScript", "Data Entry"],
  };

  const score = (c: ResumeContent, req: string[], pref: string[]) =>
    computeAtsScore(c, { required: req, preferred: pref }).score;

  return [
    {
      id: "res_base",
      kind: "base",
      title: "মূল রিজিউমে",
      circularId: null,
      circularSlug: null,
      postId: null,
      jobTitleBn: null,
      content: baseContent,
      keywordsRequired: [],
      keywordsPreferred: [],
      atsScore: score(baseContent, [], []),
      changes: [],
      aiSummaryBn: null,
      versions: [
        { id: "rv_b1", resumeId: "res_base", version: 1, labelBn: "প্রোফাইল থেকে তৈরি", createdAt: new Date(now - 6 * DAY).toISOString(), content: { ...baseContent, summary: "Office assistant from Khulna." } },
      ],
      version: 2,
      updatedAt: new Date(now - 3 * DAY).toISOString(),
    },
    {
      id: "res_dck",
      kind: "tailored",
      title: dckPost.titleEn,
      circularId: dck.id,
      circularSlug: dck.slug,
      postId: dckPost.id,
      jobTitleBn: dckPost.titleBn,
      content: tailoredContent,
      keywordsRequired: dckPost.keywordsRequired,
      keywordsPreferred: dckPost.keywordsPreferred,
      atsScore: score(tailoredContent, dckPost.keywordsRequired, dckPost.keywordsPreferred),
      changes: [
        {
          id: "chg_1",
          section: "summary",
          path: "summary",
          before: baseContent.summary,
          after: tailoredContent.summary,
          reasonBn: "সার্কুলারের ‘কম্পিউটার মুদ্রাক্ষরিক’ শব্দের সাথে মিলিয়ে",
          status: "accepted",
        },
      ],
      aiSummaryBn: null,
      versions: [
        { id: "rv_d1", resumeId: "res_dck", version: 1, labelBn: "মূল রিজিউমে থেকে কপি", createdAt: new Date(now - 2 * DAY).toISOString(), content: baseContent },
      ],
      version: 4,
      updatedAt: new Date(now - 5 * H).toISOString(),
    },
    {
      id: "res_dev",
      kind: "tailored",
      title: devPost.titleEn,
      circularId: dev.id,
      circularSlug: dev.slug,
      postId: devPost.id,
      jobTitleBn: devPost.titleBn,
      content: devContent,
      keywordsRequired: devPost.keywordsRequired,
      keywordsPreferred: devPost.keywordsPreferred,
      atsScore: score(devContent, devPost.keywordsRequired, devPost.keywordsPreferred),
      changes: [
        {
          id: "chg_d1",
          section: "summary",
          path: "summary",
          before: devContent.summary,
          after:
            "Detail-oriented professional moving into frontend development, building responsive pages with JavaScript, HTML and CSS, and learning React and TypeScript through personal projects.",
          reasonBn: "চাকরির আবশ্যক কিওয়ার্ড (React, TypeScript) সামনে আনা হয়েছে",
          status: "pending",
        },
        {
          id: "chg_d2",
          section: "experience",
          path: "experience.1.bullets.0",
          before: "Entered and verified 300+ records daily with 99% accuracy",
          after: "Built a small JavaScript tool to validate 300+ daily records, cutting errors to under 1%",
          reasonBn: "অভিজ্ঞতাকে প্রযুক্তিগত কাজের সাথে যুক্ত করা হয়েছে — শুধু সত্য হলে গ্রহণ করুন",
          status: "pending",
        },
        {
          id: "chg_d3",
          section: "headline",
          path: "headline",
          before: devContent.headline,
          after: "Junior Frontend Developer (JavaScript)",
          reasonBn: "শিরোনামে পদের নাম মেলানো হয়েছে",
          status: "pending",
        },
      ],
      aiSummaryBn: "AI দিয়ে এই চাকরির জন্য সাজানো · ৩টি পয়েন্ট নতুন করে লেখা",
      versions: [],
      version: 1,
      updatedAt: new Date(now - 1 * DAY).toISOString(),
    },
  ];
}

export function buildNotifications(now: number): Notification[] {
  const n = (i: number, type: Notification["type"], ago: number, titleBn: string, bodyBn: string, href: string | null, read: boolean): Notification => ({
    id: `ntf_${i}`,
    type,
    titleBn,
    bodyBn,
    href,
    readAt: read ? new Date(now - ago + H).toISOString() : null,
    createdAt: new Date(now - ago).toISOString(),
  });
  return [
    n(1, "deadline", 20 * 60_000, "২ ঘণ্টা বাকি!", "জেলা প্রশাসকের কার্যালয়, খুলনা — অফিস সহকারী পদের আবেদন আজ শেষ।", "/jobs/dc-khulna-office-assistant-2026", false),
    n(2, "new_match", 3 * H, "৪টি নতুন মিল", "‘খুলনায় সরকারি চাকরি’ খোঁজে নতুন সার্কুলার এসেছে।", "/alerts", false),
    n(3, "exam", 6 * H, "পরীক্ষা ৫ দিন পর", "সিনিয়র অফিসার (সাধারণ) — খুলনা জিলা স্কুল কেন্দ্রে।", "/applications", false),
    n(4, "application", 26 * H, "প্রবেশপত্র প্রকাশিত", "বাংলাদেশ রেলওয়ে খালাসি পদের প্রবেশপত্র ডাউনলোড করা যাচ্ছে।", "/applications", true),
    n(5, "deadline", 30 * H, "সময় বাড়ানো হয়েছে", "রেলওয়ে খালাসি পদের আবেদনের শেষ সময় ৭ দিন বাড়ানো হয়েছে।", "/jobs/railway-khalashi-2026", true),
    n(6, "system", 2 * DAY + 2 * H, "প্রোফাইল ৮৫% সম্পূর্ণ", "ন্যূনতম বেতন যোগ করলে সুপারিশ আরও ভালো হবে।", "/profile", true),
    n(7, "new_match", 3 * DAY, "২টি নতুন মিল", "‘এইচএসসি পাসে ব্যাংকের চাকরি’ খোঁজে নতুন সার্কুলার।", "/alerts", true),
  ];
}

export function buildSavedSearches(now: number): SavedSearch[] {
  return [
    { id: "ss_1", name: "খুলনায় সরকারি চাকরি", filters: { district: ["dis_khulna"], sector: ["government"] }, alertEnabled: true, newMatchCount: 4, createdAt: new Date(now - 9 * DAY).toISOString() },
    { id: "ss_2", name: "এইচএসসি পাসে ব্যাংকের চাকরি", filters: { category: ["cat_bank"], education: ["hsc"] }, alertEnabled: true, newMatchCount: 2, createdAt: new Date(now - 6 * DAY).toISOString() },
    { id: "ss_3", name: "রিমোট ইন্টার্নশিপ", filters: { workMode: ["remote"], jobType: ["internship"] }, alertEnabled: false, newMatchCount: 0, createdAt: new Date(now - 2 * DAY).toISOString() },
  ];
}

export function buildBilling(now: number): Billing {
  const resetsAt = new Date(now + 7 * H).toISOString();
  return {
    plans: [
      {
        id: "free",
        nameBn: "ফ্রি",
        priceBdt: 0,
        period: "day",
        featuresBn: ["সব সার্কুলার ও ফিল্টার", "যোগ্যতা যাচাই", "আবেদন ট্র্যাকার", "শেষ সময়ের রিমাইন্ডার"],
        quotas: { ai_search: 10, resume_tailor: 1, cv_parse: 2 },
      },
      {
        id: "premium",
        nameBn: "প্রিমিয়াম",
        priceBdt: 4,
        period: "day",
        featuresBn: ["ফ্রি প্ল্যানের সব কিছু", "দিনে ১০০টি AI সার্চ", "দিনে ১০টি AI রিজিউমে সাজানো", "নতুন মিলের তাৎক্ষণিক অ্যালার্ট"],
        quotas: { ai_search: 100, resume_tailor: 10, cv_parse: 10 },
      },
    ],
    subscription: { planId: "free", status: "none", trialEndsAt: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, trialUsed: false },
    usage: [
      { feature: "ai_search", used: 7, limit: 10, resetsAt },
      { feature: "resume_tailor", used: 0, limit: 1, resetsAt },
      { feature: "cv_parse", used: 1, limit: 2, resetsAt },
    ],
  };
}

export function buildSettings(now: number): Settings {
  return {
    notifications: { email: true, deadlineReminders: true, newMatches: true, examReminders: false },
    version: 1,
    updatedAt: new Date(now - 10 * DAY).toISOString(),
  };
}
