import "server-only";
import { redirect } from "next/navigation";
import type { UserRole } from "@/server/context";
import { resolveActor } from "@/server/request";

/**
 * Server-side check before anything sensitive renders (spec §2). Signed-out users go to
 * /login (the proxy adds `next`), suspended users are bounced, wrong roles go home.
 * Must sit inside <Suspense>: it reads the request cookies.
 */
export async function ServerRoleGate({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const actor = await resolveActor();
  if (actor.kind !== "user") redirect("/login");
  if (actor.status === "suspended") redirect("/login?error=suspended");
  if (!roles.includes(actor.role)) redirect("/");
  return <>{children}</>;
}
