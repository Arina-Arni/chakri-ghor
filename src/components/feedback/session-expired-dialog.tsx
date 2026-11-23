"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { onSessionExpired } from "@/lib/events";

/**
 * Opens when a request reports an expired session. Drafts live in localStorage,
 * so logging in again (in a new tab or here) keeps them.
 */
function SessionExpiredDialogInner() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => onSessionExpired(() => setOpen(true)), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("states.sessionExpiredTitle")}</DialogTitle>
          <DialogDescription>{t("states.sessionExpiredBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
              <LogIn aria-hidden />
              {t("states.sessionExpiredAction")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reads the URL, so it streams inside Suspense (Cache Components). */
export function SessionExpiredDialog() {
  return (
    <Suspense fallback={null}>
      <SessionExpiredDialogInner />
    </Suspense>
  );
}
