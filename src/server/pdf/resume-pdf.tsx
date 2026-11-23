import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ResumeContent } from "@/types";

const styles = StyleSheet.create({
  page: { paddingVertical: 36, paddingHorizontal: 44, fontSize: 10, fontFamily: "Helvetica", color: "#111827", lineHeight: 1.35 },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  contact: { fontSize: 9, color: "#374151", marginTop: 2 },
  headline: { fontSize: 11, marginTop: 4 },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 10.5, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, borderBottomWidth: 0.75, borderBottomColor: "#9ca3af", paddingBottom: 2, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#4b5563" },
  bullet: { flexDirection: "row", marginTop: 1.5, paddingLeft: 6 },
  dot: { width: 8 },
  grow: { flex: 1 },
});

/** Keep text the standard PDF fonts can render (English resume; drop other scripts). */
const clean = (s: string) => s.replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, "").replace(/\s+/g, " ").trim();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** ATS-friendly: single column, real text, standard headings, no tables or images. */
function ResumeDocument({ content: c, title }: { content: ResumeContent; title: string }) {
  const contact = [c.contact.email, c.contact.phone, c.contact.location, ...c.contact.links].map(clean).filter(Boolean).join("  |  ");
  return (
    <Document title={clean(`${c.contact.fullName} - ${title}`)} author={clean(c.contact.fullName)} creator="Chakri Radar" producer="Chakri Radar">
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{clean(c.contact.fullName) || "Resume"}</Text>
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}
        {clean(c.headline) ? <Text style={styles.headline}>{clean(c.headline)}</Text> : null}
        {clean(c.summary) ? (
          <Section title="Summary">
            <Text>{clean(c.summary)}</Text>
          </Section>
        ) : null}
        {c.skills.length ? (
          <Section title="Skills">
            <Text>{c.skills.map(clean).filter(Boolean).join(", ")}</Text>
          </Section>
        ) : null}
        {c.experience.length ? (
          <Section title="Experience">
            {c.experience.map((e) => (
              <View key={e.id} style={{ marginTop: 4 }} wrap={false}>
                <View style={styles.row}>
                  <Text style={styles.bold}>{clean(`${e.title}${e.organization ? `, ${e.organization}` : ""}`)}</Text>
                  <Text style={styles.muted}>{clean(`${e.startDate} - ${e.endDate}`)}</Text>
                </View>
                {clean(e.location) ? <Text style={styles.muted}>{clean(e.location)}</Text> : null}
                {e.bullets.map(clean).filter(Boolean).map((b, i) => (
                  <View key={i} style={styles.bullet}>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.grow}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}
          </Section>
        ) : null}
        {c.education.length ? (
          <Section title="Education">
            {c.education.map((e) => (
              <View key={e.id} style={[styles.row, { marginTop: 2 }]}>
                <Text style={styles.grow}>{clean([e.degree, e.institution, e.result && `Result: ${e.result}`].filter(Boolean).join(", "))}</Text>
                <Text style={styles.muted}>{clean(e.year)}</Text>
              </View>
            ))}
          </Section>
        ) : null}
        {c.certifications.length ? (
          <Section title="Certifications">
            {c.certifications.map(clean).filter(Boolean).map((x, i) => (
              <Text key={i}>{x}</Text>
            ))}
          </Section>
        ) : null}
        {c.languages.length ? (
          <Section title="Languages">
            <Text>{c.languages.map(clean).filter(Boolean).join(", ")}</Text>
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderResumePdf(content: ResumeContent, title: string): Promise<Buffer> {
  return renderToBuffer(<ResumeDocument content={content} title={title} />);
}
