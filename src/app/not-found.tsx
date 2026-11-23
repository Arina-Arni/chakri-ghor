import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { t } from "@/i18n";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main id="main" className="container-page flex flex-1 flex-col items-center justify-center gap-5 py-12 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden>
          <Compass className="size-8" />
        </span>
        <p className="text-5xl font-bold text-primary tabular-nums">৪০৪</p>
        <h1 className="text-2xl font-bold">{t("states.notFoundTitle")}</h1>
        <p className="max-w-md text-muted-foreground">{t("states.notFoundBody")}</p>
        <form action="/jobs" role="search" className="flex w-full max-w-md gap-2">
          <label htmlFor="nf-q" className="sr-only">
            {t("search.label")}
          </label>
          <input
            id="nf-q"
            name="q"
            type="search"
            placeholder={t("search.placeholderNormal")}
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-surface px-3 text-base outline-none focus-visible:border-primary"
          />
          <Button type="submit">{t("common.search")}</Button>
        </form>
        <Button asChild variant="link">
          <Link href="/">{t("states.goHome")}</Link>
        </Button>
      </main>
    </div>
  );
}
