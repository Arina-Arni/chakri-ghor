"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/feedback/offline-banner";
import { SessionExpiredDialog } from "@/components/feedback/session-expired-dialog";
import { StatePreviewBadge } from "@/components/feedback/state-preview-badge";
import { SessionProvider } from "./session-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    // Light/dark: the `dark` class on <html>; first visit follows the device, a choice is remembered.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <TooltipProvider delayDuration={300}>
          <OfflineBanner />
          {children}
          <SessionExpiredDialog />
          <StatePreviewBadge />
          <Toaster />
        </TooltipProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
