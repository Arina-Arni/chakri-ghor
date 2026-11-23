"use client";

import { useEffect } from "react";
import { setServerNow } from "@/domain/countdown";

export function ServerNowClient({ serverNow }: { serverNow: number }) {
  useEffect(() => {
    setServerNow(serverNow);
  }, [serverNow]);
  return null;
}
