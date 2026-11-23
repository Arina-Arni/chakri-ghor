"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, CreditCard, FileText, LayoutDashboard, LogOut, Settings, Shield, User, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession } from "@/components/providers/session-provider";
import { signOut } from "@/data";
import { t } from "@/i18n";
import { notifySessionExpired } from "@/lib/events";

/** Avatar menu. In development it also has a session-expiry trigger. */
export function UserMenu() {
  const { me, role } = useSession();
  const router = useRouter();
  if (!me) return null;
  const staff = role === "admin" || role === "moderator";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t("nav.account")}: ${me.fullName}`}
          className="grid size-11 place-items-center rounded-full"
        >
          <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-white">{me.initials}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block font-semibold text-ink">{me.fullName}</span>
          <span className="block text-sm font-normal text-muted-foreground">{me.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {[
          { href: "/dashboard", label: t("nav.dashboard"), Icon: LayoutDashboard },
          { href: "/profile", label: t("nav.profile"), Icon: User },
          { href: "/resumes", label: t("nav.resumes"), Icon: FileText },
          { href: "/bookmarks", label: t("nav.bookmarks"), Icon: Bookmark },
          { href: "/billing", label: t("nav.billing"), Icon: CreditCard },
          { href: "/settings", label: t("nav.settings"), Icon: Settings },
        ].map(({ href, label, Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href}>
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
        {staff && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield className="size-4" aria-hidden />
              {t("nav.admin")}
            </Link>
          </DropdownMenuItem>
        )}
        {process.env.NODE_ENV !== "production" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => notifySessionExpired()}>
              <Wrench className="size-4" aria-hidden />
              {t("states.sessionExpiredTitle")} (ডেভ)
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut();
            toast.success(t("auth.loggedOut"));
            router.push("/");
          }}
        >
          <LogOut className="size-4" aria-hidden />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
