"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/components/providers/session-provider";
import { listNotifications, markNotificationsRead } from "@/data";
import { formatRelativeBn, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Notification } from "@/types";

/** Unread count + dropdown of the latest five. */
export function NotificationBell() {
  const { me, refresh } = useSession();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const unread = me?.unreadNotifications ?? 0;

  const onOpen = async (o: boolean) => {
    setOpen(o);
    if (o) {
      const r = await listNotifications();
      setItems(r.ok ? r.data.slice(0, 5) : []);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => void onOpen(o)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? t("notifications.bellLabel", { n: unread }) : t("notifications.bellLabelNone")}>
          <Bell aria-hidden />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] leading-5 font-bold text-on-solid tabular-nums" aria-hidden>
              {toBnDigits(unread > 9 ? "9+" : unread)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">{t("notifications.title")}</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={async () => {
                await markNotificationsRead("all");
                setItems((xs) => xs?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
                void refresh();
              }}
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <ul className="max-h-96 overflow-auto" aria-busy={items == null}>
          {items == null && <li className="p-4 text-muted-foreground">{t("common.loading")}</li>}
          {items?.length === 0 && <li className="p-4 text-muted-foreground">{t("notifications.emptyTitle")}</li>}
          {items?.map((n) => (
            <li key={n.id} className="border-b last:border-0">
              <Link
                href={n.href ?? "/notifications"}
                onClick={() => setOpen(false)}
                className={cn("flex gap-3 px-4 py-3 hover:bg-muted", !n.readAt && "bg-primary-soft/40")}
              >
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium text-ink">
                    {!n.readAt && <span className="sr-only">{t("notifications.unread")}: </span>}
                    {n.titleBn}
                  </span>
                  <span className="line-clamp-2 block text-sm text-muted-foreground">{n.bodyBn}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeBn(n.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="p-2">
          <Button asChild variant="ghost" className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              {t("common.seeAll")}
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
