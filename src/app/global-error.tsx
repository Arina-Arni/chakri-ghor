"use client";

/** Last-resort boundary when the root layout itself fails. Plain markup, no app providers. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="bn">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#0f172a", background: "#f8fafc" }}>
        <main style={{ maxWidth: 480, margin: "10vh auto", textAlign: "center" }}>
          <h1>কিছু একটা সমস্যা হয়েছে</h1>
          <p>আমরা পেজটি দেখাতে পারিনি। একটু পর আবার চেষ্টা করুন।</p>
          <p>রেফারেন্স: {error.digest ?? "ERR-ROOT"}</p>
          <button onClick={reset} style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: 0, background: "#3a5a7c", color: "#fff" }}>
            আবার চেষ্টা করুন
          </button>
        </main>
      </body>
    </html>
  );
}
