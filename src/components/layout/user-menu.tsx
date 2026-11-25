"use client";

import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { signOut } from "@/data";
import { t } from "@/i18n";
import { leaveTo, notifySessionExpired } from "@/lib/events";

/** Role badge colours, the same as the admin users list. */
const ROLE_BADGE = { admin: "ai", moderator: "info", seeker: "neutral" } as const;

/**
 * Avatar menu. Shows which kind of account this is (job seeker / moderator / admin); staff also
 * get a small shield on the avatar. In development it also has a session-expiry trigger.
 */
export function UserMenu() {
  const { me, role } = useSession();
  if (!me || role === "guest") return null;
  const staff = role === "admin" || role === "moderator";
  const roleLabel = t(`nav.roles.${role}`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t("nav.account")}: ${me.fullName} (${roleLabel})`}
          className="relative grid size-11 place-items-center rounded-full"
        >
          <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{me.initials}</span>
          {staff && (
            <span
              className={`absolute right-0 bottom-0 grid size-4.5 place-items-center rounded-full text-on-solid ring-2 ring-background ${role === "admin" ? "bg-ai" : "bg-info"}`}
              aria-hidden
            >
              <Shield className="size-2.5" strokeWidth={3} />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block font-semibold text-ink">{me.fullName}</span>
          <span className="block text-sm font-normal text-muted-foreground">{me.email}</span>
          <Badge size="sm" variant={ROLE_BADGE[role]} className="mt-1.5">
            {staff && <Shield className="size-3" aria-hidden />}
            {roleLabel}
          </Badge>
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
              {t("adminNav.title")}
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
            // Full page load, not router.push: see leaveTo().
            leaveTo("/");
          }}
        >
          <LogOut className="size-4" aria-hidden />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
