import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-lg border border-input bg-surface px-3 py-2 text-base text-ink transition-colors duration-150 outline-none placeholder:text-muted-foreground/80 hover:border-ink/50 focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-soft/30",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
