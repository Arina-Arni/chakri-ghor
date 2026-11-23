/**
 * Bangla → English keyword dictionary used to match Bangla circular requirements
 * against an English resume. Keys are normalized Bangla phrases.
 */
export const BN_EN_KEYWORDS: Record<string, string> = {
  "কম্পিউটার মুদ্রাক্ষরিক": "Computer Typing",
  "কম্পিউটার টাইপিং": "Computer Typing",
  "মুদ্রাক্ষরিক": "Typing",
  "বাংলা টাইপিং": "Bangla Typing",
  "ইংরেজি টাইপিং": "English Typing",
  "কম্পিউটার চালনা": "Computer Operation",
  "কম্পিউটার জ্ঞান": "Computer Literacy",
  "অফিস ব্যবস্থাপনা": "Office Management",
  "অফিস সহকারী": "Office Assistant",
  "হিসাবরক্ষণ": "Accounting",
  "হিসাব": "Accounting",
  "নথি ব্যবস্থাপনা": "File Management",
  "নথিপত্র": "Documentation",
  "ডাটা এন্ট্রি": "Data Entry",
  "তথ্য সংরক্ষণ": "Record Keeping",
  "গ্রাহক সেবা": "Customer Service",
  "যোগাযোগ দক্ষতা": "Communication",
  "দলগত কাজ": "Teamwork",
  "নেতৃত্ব": "Leadership",
  "ব্যাংকিং": "Banking",
  "ক্যাশ ব্যবস্থাপনা": "Cash Handling",
  "ঋণ": "Loan Processing",
  "বিক্রয়": "Sales",
  "বিপণন": "Marketing",
  "গাড়ি চালনা": "Driving",
  "ড্রাইভিং লাইসেন্স": "Driving License",
  "শিক্ষকতা": "Teaching",
  "পাঠদান": "Teaching",
  "নার্সিং": "Nursing",
  "প্রকৌশল": "Engineering",
  "নকশা": "Design",
  "গ্রাফিক ডিজাইন": "Graphic Design",
  "প্রোগ্রামিং": "Programming",
  "ইন্টারনেট": "Internet",
  "ই-মেইল": "Email",
  "ইমেইল": "Email",
  "মাইক্রোসফট অফিস": "Microsoft Office",
  "এমএস অফিস": "Microsoft Office",
  "ওয়ার্ড": "Microsoft Word",
  "এক্সেল": "Microsoft Excel",
  "প্রতিবেদন লিখন": "Report Writing",
  "চিঠিপত্র": "Correspondence",
  "ক্রয়": "Procurement",
  "স্টোর ব্যবস্থাপনা": "Inventory Management",
  "মানবসম্পদ": "Human Resources",
};

/** Different spellings of the same English skill; matching any one counts. */
export const EN_ALIASES: Record<string, string[]> = {
  "microsoft office": ["ms office", "msoffice", "office 365", "microsoft 365"],
  "microsoft word": ["ms word"],
  "microsoft excel": ["ms excel", "excel"],
  "computer typing": ["typing", "typist"],
  "bangla typing": ["bengali typing", "bangla typing"],
  "data entry": ["data-entry", "data input"],
  "customer service": ["customer support", "client service"],
  communication: ["communication skills", "communications"],
  javascript: ["js"],
  typescript: ["ts"],
  "human resources": ["hr"],
};

export function normalizeBn(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Translate a Bangla keyword to English when the dictionary knows it. */
export function translateKeyword(keyword: string): string {
  const k = normalizeBn(keyword);
  return BN_EN_KEYWORDS[k] ?? k;
}
