"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { t } from "@/i18n";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Global connection banner (aria-live). Shows briefly when the connection returns. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const [showBack, setShowBack] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) {
      const timer = setTimeout(() => setWasOffline(true), 0);
      return () => clearTimeout(timer);
    }
    if (wasOffline) {
      const show = setTimeout(() => setShowBack(true), 0);
      const hide = setTimeout(() => {
        setShowBack(false);
        setWasOffline(false);
      }, 3000);
      return () => {
        clearTimeout(show);
        clearTimeout(hide);
      };
    }
  }, [online, wasOffline]);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center">
      {!online && (
        <p className="pointer-events-auto mt-2 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-background shadow-raised">
          <WifiOff className="size-4" aria-hidden />
          {t("states.offline")}
        </p>
      )}
      {online && showBack && (
        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-on-solid shadow-raised">
          <Wifi className="size-4" aria-hidden />
          {t("states.backOnline")}
        </p>
      )}
    </div>
  );
}
