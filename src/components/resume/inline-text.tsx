"use client";

import { useRef, useState } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Click (or Enter/Space) to edit in place. Enter saves, Escape cancels.
 * Multiline fields use a textarea; Shift+Enter inserts a newline.
 */
export function InlineText({
  value,
  onSave,
  label,
  multiline = false,
  placeholder = "—",
  className,
  as: Tag = "span",
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const finish = (save: boolean) => {
    if (save && draft.trim() !== value) onSave(draft.trim());
    setEditing(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  if (editing) {
    const common = {
      autoFocus: true,
      value: draft,
      "aria-label": t("resume.editField", { field: label }),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: () => finish(true),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          finish(false);
        } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
          e.preventDefault();
          finish(true);
        }
      },
      className: cn("w-full rounded border border-primary bg-primary-soft/40 px-1 outline-none", className),
    };
    return multiline ? <textarea rows={4} {...common} /> : <input {...common} />;
  }

  return (
    <Tag className={cn("inline", Tag !== "span" && "block")}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        aria-label={`${t("resume.editField", { field: label })}: ${value || placeholder}`}
        className={cn(
          "rounded px-0.5 text-left decoration-primary/40 decoration-dashed underline-offset-4 hover:bg-primary-soft/50 hover:underline",
          !value && "text-slate-400 italic",
          className,
        )}
      >
        {value || placeholder}
      </button>
    </Tag>
  );
}
