import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { t } from "@/i18n";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="container-page flex h-16 items-center justify-between">
        <Logo />
        <Link href="/jobs" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
          {t("nav.jobs")}
        </Link>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-8 outline-none sm:items-center">
        <div className="w-full max-w-md rounded-2xl border bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          {t("footer.privacy")}
        </Link>
        {" · "}
        <Link href="/terms" className="underline-offset-4 hover:underline">
          {t("footer.terms")}
        </Link>
      </footer>
    </div>
  );
}
