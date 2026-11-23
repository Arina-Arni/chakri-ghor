import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Footer } from "@/components/layout/footer";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer />
      <BottomNav />
    </>
  );
}
