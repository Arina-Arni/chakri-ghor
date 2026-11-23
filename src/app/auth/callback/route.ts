import { NextResponse } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { supabaseServer } from "@/server/supabase";

/** OAuth (Google) return: exchange the code for a session cookie, then go to a safe `next`. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/dashboard");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
