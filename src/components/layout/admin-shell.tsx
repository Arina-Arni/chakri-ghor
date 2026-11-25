"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  FileStack,
  LayoutDashboard,
  Menu,
  ScrollText,
  Settings,
  Users,
  Workflow,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useSession } from "@/components/providers/session-provider";
import { getFaultInjection, setFaultInjection } from "@/data";
import { formatCountdownBn } from "@/domain/countdown";
import { useServerNow } from "@/domain/countdown/use-server-now";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { FaultInjection, Role } from "@/types";
import { Logo, RadarMark } from "./logo";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

type Item = { href: string; label: () => string; Icon: typeof LayoutDashboard; roles: Role[] };

const ITEMS: Item[] = [
  { href: "/admin", label: () => t("adminNav.dashboard"), Icon: LayoutDashboard, roles: ["moderator", "admin"] },
  { href: "/admin/circulars", label: () => t("adminNav.circulars"), Icon: FileStack, roles: ["moderator", "admin"] },
  { href: "/admin/review", label: () => t("adminNav.review"), Icon: ClipboardCheck, roles: ["moderator", "admin"] },
  { href: "/admin/ingest", label: () => t("adminNav.ingest"), Icon: Workflow, roles: ["moderator", "admin"] },
  { href: "/admin/organizations", label: () => t("adminNav.organizations"), Icon: Building2, roles: ["moderator", "admin"] },
  { href: "/admin/users", label: () => t("adminNav.users"), Icon: Users, roles: ["admin"] },
  { href: "/admin/audit", label: () => t("adminNav.audit"), Icon: ScrollText, roles: ["admin"] },
  { href: "/admin/ai-health", label: () => t("adminNav.aiHealth"), Icon: Activity, roles: ["moderator", "admin"] },
  { href: "/admin/settings", label: () => t("adminNav.settings"), Icon: Settings, roles: ["admin"] },
];

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { role } = useSession();
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {ITEMS.filter((i) => i.roles.includes(role)).map(({ href, label, Icon }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href) || (href === "/admin/ingest" && pathname.startsWith("/admin/workflows"));
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? label() : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 font-medium transition-colors duration-150",
                active ? "bg-primary-soft text-primary-hover" : "text-ink hover:bg-muted",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className={cn(collapsed && "sr-only")}>{label()}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Warning banner on every admin page while fault injection is active. */
function FaultBanner() {
  const [fi, setFi] = useState<FaultInjection | null>(null);
  const now = useServerNow(1000);
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const r = await getFaultInjection();
      if (alive && r.ok) setFi(r.data);
    };
    const first = setTimeout(() => void poll(), 0);
    const id = setInterval(() => void poll(), 5000);
    const onChange = () => void poll();
    window.addEventListener("cr:fault-changed", onChange);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
      window.removeEventListener("cr:fault-changed", onChange);
    };
  }, []);
  if (!fi || now == null) return null;
  const left = new Date(fi.expiresAt).getTime() - now;
  if (left <= 0) return null;
  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning-soft px-4 py-2 text-warning">
      <AlertTriangle className="size-5 shrink-0" aria-hidden />
      <p className="flex-1 font-medium tabular-nums">
        {t("admin.aiHealth.banner", {
          feature: t(`enums.aiFeature.${fi.feature}`),
          mode: fi.mode,
          time: left >= 3_600_000 ? formatCountdownBn(left) : `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`.replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]),
        })}
      </p>
      <Button
        size="sm"
        variant="secondary"
        onClick={async () => {
          await setFaultInjection(null, null);
          setFi(null);
          window.dispatchEvent(new Event("cr:fault-changed"));
        }}
      >
        {t("admin.aiHealth.disable")}
      </Button>
    </div>
  );
}

/** Admin chrome: collapsible sidebar on desktop, menu sheet on mobile. */
function AdminShellInner({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b px-4", collapsed && "justify-center px-0")}>
          {collapsed ? (
            <Link href="/admin" aria-label={t("adminNav.title")} className="text-primary">
              <RadarMark />
            </Link>
          ) : (
            <Logo href="/admin" />
          )}
        </div>
        <nav aria-label={t("adminNav.title")} className="flex-1 overflow-y-auto p-3">
          <NavList collapsed={collapsed} />
        </nav>
        <div className="space-y-1 border-t p-3">
          <Link href="/" className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 text-muted-foreground hover:bg-muted", collapsed && "justify-center px-0")}>
            <ArrowLeft className="size-5" aria-hidden />
            <span className={cn(collapsed && "sr-only")}>{t("adminNav.backToSite")}</span>
          </Link>
          <Button variant="ghost" className={cn("w-full justify-start gap-3 px-3", collapsed && "justify-center px-0")} onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
            {collapsed ? <ChevronsRight aria-hidden /> : <ChevronsLeft aria-hidden />}
            <span className={cn(collapsed && "sr-only")}>{collapsed ? t("adminNav.expand") : t("adminNav.collapse")}</span>
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-surface px-4 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("common.openMenu")}>
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>{t("adminNav.title")}</SheetTitle>
                <SheetDescription className="sr-only">{t("adminNav.title")}</SheetDescription>
              </SheetHeader>
              <nav aria-label={t("adminNav.title")} className="px-3">
                <NavList onNavigate={() => setOpen(false)} />
              </nav>
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-ink lg:hidden">{t("adminNav.title")}</span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <FaultBanner />
        {children}
      </div>
    </div>
  );
}

/** Reads the URL, so it streams inside Suspense (Cache Components). */
export function AdminShell(props: React.ComponentProps<typeof AdminShellInner>) {
  return (
    <Suspense fallback={null}>
      <AdminShellInner {...props} />
    </Suspense>
  );
}
