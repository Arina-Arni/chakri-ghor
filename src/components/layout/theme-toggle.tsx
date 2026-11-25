"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const subscribeNothing = () => () => {};

/**
 * Light/dark switch. The first visit follows the device setting; a choice is remembered
 * (next-themes, localStorage). The icon is only known after hydration, so the server renders an
 * empty placeholder of the same size.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const dark = hydrated && resolvedTheme === "dark";
  const label = dark ? t("theme.toLight") : t("theme.toDark");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("shrink-0", className)}
      aria-label={label}
      title={label}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {hydrated ? dark ? <Sun aria-hidden /> : <Moon aria-hidden /> : <span className="size-5" aria-hidden />}
    </Button>
  );
}
