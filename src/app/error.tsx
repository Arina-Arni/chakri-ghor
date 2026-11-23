"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/feedback/error-state";
import { t } from "@/i18n";

/** Route error boundary: Bangla message, retry and a reference id — never a stack trace. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = error.digest ? `ERR-${error.digest.slice(0, 8).toUpperCase()}` : "ERR-CLIENT";
  return (
    <main id="main" className="container-page flex min-h-[60vh] flex-col items-center justify-center gap-4 py-12">
      <ErrorState error={{ code: "UNKNOWN", message_bn: t("states.errorBody"), requestId: ref }} onRetry={reset} className="w-full max-w-lg" />
      <Button asChild variant="link">
        <Link href="/">{t("states.goHome")}</Link>
      </Button>
    </main>
  );
}
