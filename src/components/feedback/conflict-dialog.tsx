"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
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

export type ConflictChange = { field: string; yours: string; theirs: string };

/** "অন্য কেউ এটি পরিবর্তন করেছে" — reload the latest version, or view what changed. */
export function ConflictDialog({
  open,
  onOpenChange,
  onReload,
  changes = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  changes?: ConflictChange[];
}) {
  const [showChanges, setShowChanges] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("states.conflictTitle")}</DialogTitle>
          <DialogDescription>{t("states.conflictBody")}</DialogDescription>
        </DialogHeader>
        {showChanges && (
          <div className="max-h-64 overflow-auto rounded-lg border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t("states.conflictView")}</caption>
              <thead className="bg-muted">
                <tr>
                  <th scope="col" className="p-2">{t("admin.circulars.field")}</th>
                  <th scope="col" className="p-2">{t("states.conflictYours")}</th>
                  <th scope="col" className="p-2">{t("states.conflictTheirs")}</th>
                </tr>
              </thead>
              <tbody>
                {(changes.length ? changes : [{ field: "—", yours: "—", theirs: "—" }]).map((c, i) => (
                  <tr key={i} className="border-t align-top">
                    <th scope="row" className="p-2 font-medium">{c.field}</th>
                    <td className="p-2 text-danger line-through decoration-danger/50">{c.yours}</td>
                    <td className="p-2 text-success">{c.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowChanges((s) => !s)} aria-expanded={showChanges}>
            {t("states.conflictView")}
          </Button>
          <Button onClick={onReload}>
            <RefreshCw aria-hidden />
            {t("states.conflictReload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
