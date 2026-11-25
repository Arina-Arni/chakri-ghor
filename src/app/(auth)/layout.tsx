import Link from "next/link";
import { AuthHeroVideo } from "@/components/layout/auth-hero-video";
import { Logo } from "@/components/layout/logo";
import { t } from "@/i18n";

/** White pill behind header/footer items while they sit on the full-screen clip (large screens). */
const ON_VIDEO = "lg:rounded-full lg:bg-white/90 lg:px-4 lg:py-1.5 lg:shadow-sm";

/**
 * Auth pages. Large screens: the hero clip fills the whole screen and the form card sits at the
 * right edge. Phones: a 16:9 clip cropped to the full (tall) screen would show only a sliver, so it
 * is a banner above the form card instead.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background">
      <header className="container-page relative z-10 flex h-16 items-center justify-between lg:h-14">
        <span className={ON_VIDEO}>
          <Logo />
        </span>
        <Link href="/jobs" className={`inline-flex min-h-11 items-center font-medium text-primary hover:underline lg:min-h-0 ${ON_VIDEO}`}>
          {t("nav.jobs")}
        </Link>
      </header>

      <div className="auth-panel mx-4 overflow-hidden rounded-2xl lg:fixed lg:inset-0 lg:m-0 lg:rounded-none">
        <AuthHeroVideo className="lg:aspect-auto lg:h-full" />
      </div>

      <main
        id="main"
        tabIndex={-1}
        className="relative z-10 flex flex-1 items-start justify-center px-4 py-6 outline-none sm:items-center lg:justify-end lg:px-10 lg:py-3 xl:px-16"
      >
        {/*
          Compact on large screens so the login card fits a laptop screen without scrolling.
          Solid card, no backdrop blur: blurring a playing video is heavy and some GPUs drop the layer.
        */}
        <div className="auth-form-in auth-card w-full max-w-md rounded-2xl border bg-surface p-6 shadow-raised sm:p-7 lg:max-w-[25rem] lg:p-6 lg:shadow-2xl">
          {children}
        </div>
      </main>

      {/* Large screens: floats over the clip's bottom edge, so it takes no height from the card. */}
      <footer className="relative z-10 py-6 text-center text-sm text-muted-foreground lg:absolute lg:inset-x-0 lg:bottom-0 lg:py-3">
        <span className={ON_VIDEO}>
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            {t("footer.privacy")}
          </Link>
          {" · "}
          <Link href="/terms" className="underline-offset-4 hover:underline">
            {t("footer.terms")}
          </Link>
        </span>
      </footer>
    </div>
  );
}
