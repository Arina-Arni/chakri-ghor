"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/feedback/offline-banner";
import { SessionExpiredDialog } from "@/components/feedback/session-expired-dialog";
import { StatePreviewBadge } from "@/components/feedback/state-preview-badge";
import { SessionProvider } from "./session-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={300}>
        <OfflineBanner />
        {children}
        <SessionExpiredDialog />
        <StatePreviewBadge />
        <Toaster />
      </TooltipProvider>
    </SessionProvider>
  );
}
