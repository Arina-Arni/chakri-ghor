"use client";

import { cloneElement, isValidElement } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

/**
 * Label + control + hint + error, wired with aria-describedby / aria-invalid.
 * Required fields say so in text, not only by color.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  labelClassName,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: React.ReactElement<FieldControlProps> | ((p: FieldControlProps) => React.ReactNode);
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const control: FieldControlProps = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
  };
  return (
    <div className={cn("space-y-1.5", className)} data-field={id}>
      <label htmlFor={id} className={cn("block font-medium text-ink", labelClassName)}>
        {label}
        {required && <span className="ml-1 text-sm font-normal text-muted-foreground">{t("common.requiredMark")}</span>}
      </label>
      {typeof children === "function" ? children(control) : isValidElement(children) ? cloneElement(children, control) : children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <p id={`${id}-error`} aria-live="polite" className={cn("text-sm font-medium text-danger", !error && "sr-only")}>
        {error ? `⚠ ${error}` : ""}
      </p>
    </div>
  );
}

/** Group of related checkboxes/radios with a legend. */
export function Fieldset({ legend, hint, error, children, className, id }: { legend: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <fieldset className={cn("space-y-2", className)} aria-describedby={error && id ? `${id}-error` : undefined} data-field={id}>
      <legend className="font-medium text-ink">{legend}</legend>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
      {error && (
        <p id={id ? `${id}-error` : undefined} className="text-sm font-medium text-danger" aria-live="polite">
          ⚠ {error}
        </p>
      )}
    </fieldset>
  );
}

/** Error summary at the top of long forms, linking to each invalid field. */
export function ErrorSummary({ errors, id = "error-summary" }: { errors: { id: string; message: string; label: string }[]; id?: string }) {
  if (!errors.length) return null;
  return (
    <div id={id} tabIndex={-1} role="alert" className="rounded-xl border-2 border-danger/40 bg-danger-soft/50 p-4 outline-none">
      <h2 className="font-semibold text-danger">{t("validation.summaryTitle", { n: errors.length })}</h2>
      <p className="text-sm text-muted-foreground">{t("validation.summaryHint")}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              className="text-danger underline underline-offset-4"
              onClick={(ev) => {
                const el = document.getElementById(e.id);
                if (el) {
                  ev.preventDefault();
                  el.focus();
                  el.scrollIntoView({ block: "center" });
                }
              }}
            >
              {e.label}: {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
