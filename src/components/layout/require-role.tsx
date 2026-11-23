"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageSkeleton } from "@/components/feedback/skeletons";
import { useSession } from "@/components/providers/session-provider";
import { t } from "@/i18n";
import type { Role } from "@/types";

/**
 * Client-side gate for Part 1 (no real auth yet). Guests are sent to login;
 * signed-in users without the role see a "no access" message. Part 2 enforces this on the server.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { status, role } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "ready" && role === "guest") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, role, router, pathname]);

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
