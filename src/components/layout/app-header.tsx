"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/components/providers/session-provider";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

const PUBLIC_LINKS = [
  { href: "/jobs", label: () => t("nav.jobs") },
  { href: "/#categories", label: () => t("nav.categories") },
  { href: "/organizations", label: () => t("nav.organizations") },
  { href: "/pricing", label: () => t("nav.pricing") },
];

function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className="relative hidden w-full max-w-sm md:block"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/jobs?q=${encodeURIComponent(q.trim())}` : "/jobs");
      }}
    >
      <label htmlFor="header-search" className="sr-only">
        {t("search.label")}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        id="header-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search.placeholderNormal")}
        className="h-11 w-full rounded-full border border-input bg-muted/60 pr-4 pl-10 text-base outline-none hover:border-ink/40 focus-visible:border-primary focus-visible:bg-surface"
      />
    </form>
  );
}

/** Public header for guests; top bar with search, bell and avatar for signed-in users. */
export function AppHeader() {
  const { me, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const signedIn = !!me;

  return (
    <header className="sticky top-0 z-40 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="container-page flex h-16 items-center gap-3">
        <Logo />
        <nav aria-label={t("nav.primary")} className="ml-4 hidden lg:block">
          <ul className="flex items-center gap-1">
            {PUBLIC_LINKS.map((l) => {
              const active = l.href === "/jobs" ? pathname.startsWith("/jobs") : pathname === l.href;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-11 items-center rounded-lg px-3 font-medium hover:bg-muted",
                      active ? "text-primary" : "text-ink",
                    )}
                  >
                    {l.label()}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1 md:gap-2">
          {signedIn && <HeaderSearch />}
          {status === "loading" ? (
            <span className="h-11 w-24" aria-hidden />
          ) : signedIn ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost">
                <Link href="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">{t("nav.signup")}</Link>
              </Button>
            </div>
          )}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("common.openMenu")}>
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80 max-w-[85vw]">
              <SheetHeader>
                <SheetTitle>{t("common.menu")}</SheetTitle>
                <SheetDescription className="sr-only">{t("nav.primary")}</SheetDescription>
              </SheetHeader>
              <nav aria-label={t("nav.mobile")} className="px-4">
                <ul className="space-y-1">
                  {PUBLIC_LINKS.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} onClick={() => setOpen(false)} className="flex h-12 items-center rounded-lg px-3 text-lg font-medium hover:bg-muted">
                        {l.label()}
                      </Link>
                    </li>
                  ))}
                </ul>
                {!signedIn && (
                  <div className="mt-6 grid gap-2">
                    <Button asChild variant="secondary" size="lg">
                      <Link href="/login" onClick={() => setOpen(false)}>
                        {t("nav.login")}
                      </Link>
                    </Button>
                    <Button asChild size="lg">
                      <Link href="/signup" onClick={() => setOpen(false)}>
                        {t("nav.signup")}
                      </Link>
                    </Button>
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
