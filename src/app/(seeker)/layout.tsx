import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Footer } from "@/components/layout/footer";
import { RequireRole } from "@/components/layout/require-role";
import { ServerRoleGate } from "@/components/layout/server-role-gate";

/** Seeker pages read the session on the server, so they can't be part of a static shell. */
export const instant = false;

export default function SeekerLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <Suspense fallback={<div className="container-page min-h-[60vh] py-6 md:py-8" aria-busy="true" />}>
        <ServerRoleGate roles={["seeker", "moderator", "admin", "employer"]}>
          <RequireRole roles={["seeker", "moderator", "admin"]}>
            <main id="main" tabIndex={-1} className="container-page py-6 outline-none md:py-8">
              {children}
            </main>
          </RequireRole>
        </ServerRoleGate>
      </Suspense>
      <Footer />
      <BottomNav />
    </>
  );
}
