import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-3 py-2 text-base text-ink transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 hover:border-ink/50 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-soft/30 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputClass, className)} {...props} />;
}

export { Input };
