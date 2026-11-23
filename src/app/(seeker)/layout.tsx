import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Footer } from "@/components/layout/footer";
import { RequireRole } from "@/components/layout/require-role";

export default function SeekerLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <RequireRole roles={["seeker", "moderator", "admin"]}>
        <main id="main" tabIndex={-1} className="container-page py-6 outline-none md:py-8">
          {children}
        </main>
      </RequireRole>
      <Footer />
      <BottomNav />
    </>
  );
}
