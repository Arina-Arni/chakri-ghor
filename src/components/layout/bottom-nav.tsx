"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, KanbanSquare, Search, User } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: () => t("nav.home"), Icon: Home },
  { href: "/jobs", label: () => t("nav.search"), Icon: Search },
  { href: "/applications", label: () => t("nav.tracker"), Icon: KanbanSquare },
  { href: "/profile", label: () => t("nav.profile"), Icon: User },
];

/** Mobile bottom navigation for signed-in seekers. */
export function BottomNav() {
  const { me } = useSession();
  const pathname = usePathname();
  if (!me) return null;
  return (
    <>
      <div className="h-16 lg:hidden" aria-hidden />
      <nav aria-label={t("nav.mobile")} className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-4">
          {ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-0.5 text-sm font-medium", active ? "text-primary" : "text-muted-foreground")}
                >
                  <Icon className={cn("size-6", active && "fill-primary-soft")} aria-hidden />
                  {label()}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
