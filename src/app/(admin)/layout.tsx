import { Suspense } from "react";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireRole } from "@/components/layout/require-role";
import { ServerRoleGate } from "@/components/layout/server-role-gate";

/** Staff pages read the session on the server, so they can't be part of a static shell. */
export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={null}>
      <ServerRoleGate roles={["moderator", "admin"]}>
        <RequireRole roles={["moderator", "admin"]}>
          <AdminShell>
            <main id="main" tabIndex={-1} className="w-full max-w-[1400px] flex-1 p-4 outline-none md:p-6">
              {children}
            </main>
          </AdminShell>
        </RequireRole>
      </ServerRoleGate>
    </Suspense>
  );
}
