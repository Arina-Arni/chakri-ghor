import Link from "next/link";
import { AuthHeroVideo } from "@/components/layout/auth-hero-video";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { t } from "@/i18n";

/** Glass pill behind header/footer items while they sit on the full-screen clip (large screens). */
const PILL = "lg:rounded-full lg:bg-white/80 lg:shadow-sm lg:backdrop-blur dark:lg:bg-[#0b1626]/70";
const ON_VIDEO = `${PILL} lg:px-4 lg:py-1.5`;

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
        <div className="flex items-center gap-2">
          <ThemeToggle className={PILL} />
          <Link href="/jobs" className={`inline-flex min-h-11 items-center font-medium text-primary hover:underline lg:min-h-0 ${ON_VIDEO}`}>
            {t("nav.jobs")}
          </Link>
        </div>
      </header>

      <div className="auth-panel relative mx-4 overflow-hidden rounded-2xl lg:fixed lg:inset-0 lg:m-0 lg:rounded-none">
        <AuthHeroVideo className="lg:aspect-auto lg:h-full" />
        {/* Dark mode: dim the daylight clip so it sits with the night palette. */}
        <div className="pointer-events-none absolute inset-0 hidden bg-black/45 dark:block" aria-hidden />
      </div>

      <main
        id="main"
        tabIndex={-1}
        className="relative z-10 flex flex-1 items-start justify-center px-4 py-6 outline-none sm:items-center lg:justify-end lg:px-10 lg:py-3 xl:px-16"
      >
        {/*
          Compact on large screens so the login card fits a laptop screen without scrolling.
          Over the clip it is frosted glass (one blurred element only). White 72% / night 60%: text
          stays AA even when a dark window or the door of the clip is behind it.
        */}
        <div className="auth-form-in auth-card w-full max-w-md rounded-2xl border bg-surface p-6 shadow-raised sm:p-7 lg:max-w-[25rem] lg:border-white/60 lg:bg-white/72 lg:p-6 lg:shadow-2xl lg:backdrop-blur-xl lg:backdrop-saturate-150 dark:lg:border-white/15 dark:lg:bg-[#0b1626]/60">
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
