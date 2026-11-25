"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageSkeleton } from "@/components/feedback/skeletons";
import { useSession } from "@/components/providers/session-provider";
import { t } from "@/i18n";
import { isLeaving, leaveTo } from "@/lib/events";
import type { Role } from "@/types";

/**
 * Client-side gate for Part 1 (no real auth yet). Guests are sent to login;
 * signed-in users without the role see a "no access" message. Part 2 enforces this on the server.
 */
function RequireRoleInner({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { status, role, verify } = useSession();
  const pathname = usePathname();
  // The server gate already let this request through, so a client-side "guest" may just be
  // stale (e.g. right after login). Re-check once before bouncing to /login.
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (status !== "ready" || role !== "guest" || isLeaving()) return;
    if (!verified) {
      let alive = true;
      void verify().then(() => {
        if (alive) setVerified(true);
      });
      return () => {
        alive = false;
      };
    }
    // Full page load instead of router.replace: a client navigation here can race another one
    // (logout, a link) and leave the router queue stuck, so the next login never gets sent.
    leaveTo(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, role, verified, verify, pathname]);

  if (status === "loading" || role === "guest") return <PageSkeleton />;
  if (!roles.includes(role)) {
    return (
      <main id="main" className="container-page py-12">
        <h1 className="sr-only">{t("errors.FORBIDDEN")}</h1>
        <EmptyState
          icon={ShieldAlert}
          title={t("errors.FORBIDDEN")}
          action={
            <Button asChild>
              <Link href="/">{t("states.goHome")}</Link>
            </Button>
          }
        />
      </main>
    );
  }
  return <>{children}</>;
}

/** Reads the URL, so it streams inside Suspense (Cache Components). */
export function RequireRole(props: React.ComponentProps<typeof RequireRoleInner>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequireRoleInner {...props} />
    </Suspense>
  );
}
