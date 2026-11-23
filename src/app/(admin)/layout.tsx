import { AdminShell } from "@/components/layout/admin-shell";
import { RequireRole } from "@/components/layout/require-role";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireRole roles={["moderator", "admin"]}>
      <AdminShell>
        <main id="main" tabIndex={-1} className="w-full max-w-[1400px] flex-1 p-4 outline-none md:p-6">
          {children}
        </main>
      </AdminShell>
    </RequireRole>
  );
}
