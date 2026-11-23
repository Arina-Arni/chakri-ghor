"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/types";

/** Keyboard-accessible status menu. Every status is listed; the data layer rejects illegal moves with a reason. */
export function StatusSelect({ value, onChange, label, disabled }: { value: ApplicationStatus; onChange: (s: ApplicationStatus) => void; label: string; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ApplicationStatus)} disabled={disabled}>
      <SelectTrigger aria-label={label} className="relative z-10 h-10 min-w-36" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {APPLICATION_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {t(`enums.applicationStatus.${s}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const STATUS_TONE: Record<ApplicationStatus, "neutral" | "primary" | "info" | "warning" | "success" | "danger" | "ai"> = {
  interested: "neutral",
  applied: "primary",
  admit_card: "info",
  exam: "warning",
  viva: "ai",
  selected: "success",
  rejected: "danger",
  withdrawn: "neutral",
};
