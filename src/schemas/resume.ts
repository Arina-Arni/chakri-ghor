import { z } from "zod";

/** Shape of the English resume document. Used by the editor and the Part 2 API. */
export const resumeContentSchema = z.object({
  contact: z.object({
    fullName: z.string().trim().max(80),
    email: z.string().trim().max(120),
    phone: z.string().trim().max(20),
    location: z.string().trim().max(80),
    links: z.array(z.string().trim().max(200)).max(5),
  }),
  headline: z.string().trim().max(120),
  summary: z.string().trim().max(1200),
  skills: z.array(z.string().trim().min(1).max(40)).max(40),
  experience: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().trim().max(80),
        organization: z.string().trim().max(120),
        location: z.string().trim().max(80),
        startDate: z.string().trim().max(20),
        endDate: z.string().trim().max(20),
        bullets: z.array(z.string().trim().max(300)).max(10),
      }),
    )
    .max(10),
  education: z
    .array(
      z.object({
        id: z.string(),
        degree: z.string().trim().max(80),
        institution: z.string().trim().max(120),
        year: z.string().trim().max(10),
        result: z.string().trim().max(30),
      }),
    )
    .max(8),
  certifications: z.array(z.string().trim().max(120)).max(10),
  languages: z.array(z.string().trim().max(40)).max(10),
});
