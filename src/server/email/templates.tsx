import "server-only";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";
import { serverEnv } from "@/env";
import type { EmailTemplate } from "./outbox";

const SUBJECT: Record<EmailTemplate, string> = {
  deadline_reminder: "আবেদনের শেষ সময় ঘনিয়ে আসছে",
  new_match: "আপনার সাথে মেলে এমন নতুন চাকরি",
  deadline_extended: "সময় বৃদ্ধি হয়েছে",
  exam_reminder: "পরীক্ষার রিমাইন্ডার",
  subscription_expiring: "প্রিমিয়ামের মেয়াদ শেষ হচ্ছে",
  generic: "চাকরি রাডার থেকে নতুন খবর",
};

const CTA: Record<EmailTemplate, string> = {
  deadline_reminder: "সার্কুলার দেখুন",
  new_match: "চাকরিটি দেখুন",
  deadline_extended: "নতুন সময় দেখুন",
  exam_reminder: "ট্র্যাকার খুলুন",
  subscription_expiring: "নবায়ন করুন",
  generic: "খুলুন",
};

function Mail({ template, title, body, href }: { template: EmailTemplate; title: string; body: string; href: string }) {
  return (
    <Html lang="bn">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: "#f6f7f9", fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', Arial, sans-serif", margin: 0 }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, margin: "24px auto", maxWidth: 520, padding: 24 }}>
          <Text style={{ color: "#3a5a7c", fontSize: 14, fontWeight: 700, margin: 0 }}>চাকরি রাডার</Text>
          <Heading as="h1" style={{ color: "#111827", fontSize: 20, lineHeight: "28px", margin: "12px 0" }}>
            {title}
          </Heading>
          <Text style={{ color: "#374151", fontSize: 16, lineHeight: "26px" }}>{body}</Text>
          <Section style={{ margin: "20px 0" }}>
            <Button href={href} style={{ backgroundColor: "#3a5a7c", borderRadius: 8, color: "#ffffff", fontSize: 16, fontWeight: 600, padding: "12px 20px" }}>
              {CTA[template]}
            </Button>
          </Section>
          <Hr style={{ borderColor: "#e5e7eb" }} />
          <Text style={{ color: "#6b7280", fontSize: 13 }}>ইমেইল বন্ধ করতে চাইলে সেটিংস → নোটিফিকেশন থেকে বন্ধ করুন।</Text>
        </Container>
      </Body>
    </Html>
  );
}

/** Bangla email for an outbox row (React Email). */
export async function renderEmail(template: EmailTemplate, payload: Record<string, unknown>, baseUrl?: string) {
  const base = baseUrl ?? serverEnv().APP_URL;
  const title = String(payload.title ?? SUBJECT[template]);
  const body = String(payload.body ?? "");
  const href = new URL(String(payload.link ?? "/notifications"), base).toString();
  const element = <Mail template={template} title={title} body={body} href={href} />;
  return { subject: `${SUBJECT[template]} — ${title}`.slice(0, 180), html: await render(element), text: `${title}\n\n${body}\n\n${href}` };
}
