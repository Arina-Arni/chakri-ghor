import { connection } from "next/server";
import { ServerNowClient } from "./server-now-client";

function readServerClock(): number {
  return Date.now();
}

/**
 * Streams the server's clock to the client so countdowns ignore a wrong phone clock
 * (spec §10). Rendered inside <Suspense fallback={null}> so the static shell is unaffected.
 */
export async function ServerNowSeed() {
  await connection();
  const now = readServerClock();
  return <ServerNowClient serverNow={now} />;
}
