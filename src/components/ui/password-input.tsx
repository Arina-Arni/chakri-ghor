"use client";

import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClass } from "@/components/ui/input";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={show ? "text" : "password"} className={cn(inputClass, "pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
        className="absolute top-0 right-0 grid size-11 place-items-center rounded-lg text-muted-foreground hover:text-ink"
      >
        {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
});
