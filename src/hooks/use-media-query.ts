"use client";

import { useSyncExternalStore } from "react";

/** Subscribe to a CSS media query. Returns `fallback` during server render. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)", true);
