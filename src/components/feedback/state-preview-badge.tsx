"use client";

import { useSyncExternalStore } from "react";
import { forcedState } from "@/data";
import { t } from "@/i18n";

/** Dev-only marker so screenshots make clear a state is being forced via ?__state. */
export function StatePreviewBadge() {
  const state = useSyncExternalStore(
    () => () => {},
    () => forcedState(),
    () => null,
  );
  if (process.env.NODE_ENV === "production" || !state) return null;
  return (
    <div className="pointer-events-none fixed right-3 bottom-20 z-[60] rounded-full bg-ai px-3 py-1 text-xs font-semibold text-white shadow-raised lg:bottom-3">
      {t("states.statePreview", { state })}
    </div>
  );
}
