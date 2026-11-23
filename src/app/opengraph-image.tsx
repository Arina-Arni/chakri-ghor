import { ImageResponse } from "next/og";

export const alt = "Chakri Radar — Bangladesh job circulars, eligibility and ATS resumes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card (English text: the OG renderer has no Bangla font bundled). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0f766e", color: "#ffffff" }}>
        <div style={{ fontSize: 34, opacity: 0.85 }}>Hack the Vibe 2026 · World Problem Solver</div>
        <div style={{ fontSize: 96, fontWeight: 700, marginTop: 12 }}>Chakri Radar</div>
        <div style={{ fontSize: 40, marginTop: 20, maxWidth: 980, lineHeight: 1.3 }}>Every Bangladesh job circular in one place — eligibility checks, deadline reminders and ATS resumes.</div>
      </div>
    ),
    size,
  );
}
