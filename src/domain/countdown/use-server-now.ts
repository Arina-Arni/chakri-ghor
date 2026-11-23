"use client";

import { useEffect, useState } from "react";
import { serverNow } from "./index";

/**
 * Server-corrected "now" that re-renders every `tickMs`.
 * Returns null until mounted so server and client render the same markup.
 */
export function useServerNow(tickMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(serverNow());
    const first = setTimeout(update, 0);
    const id = setInterval(update, tickMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [tickMs]);
  return now;
}
