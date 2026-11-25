"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getMe, onSessionChange } from "@/data";
import type { Me, Role } from "@/types";

type Session = {
  status: "loading" | "ready";
  me: Me | null;
  role: Role;
  /** Always fetches the session again (after a mutation that changed it). */
  refresh: () => Promise<void>;
  /**
   * Resolves once the session is up to date: waits for a fetch already in flight (e.g. the one a
   * login just triggered) or starts one. Use it before trusting a "guest" state.
   */
  verify: () => Promise<void>;
};

const SessionContext = createContext<Session>({
  status: "loading",
  me: null,
  role: "guest",
  refresh: async () => {},
  verify: async () => {},
});

/** Current user from the data layer; re-fetches on login, logout and role switches. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: "loading" | "ready"; me: Me | null }>({ status: "loading", me: null });
  // Only the newest getMe() may update the state, so a slow request started before login
  // can never overwrite the signed-in session with "guest".
  const seq = useRef(0);
  const latest = useRef<Promise<void> | null>(null);

  const waitLatest = useCallback(async () => {
    let current: Promise<void> | null;
    do {
      current = latest.current;
      if (current) await current;
    } while (current !== latest.current);
  }, []);

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    const request = getMe().then((r) => {
      if (id === seq.current) setState({ status: "ready", me: r.ok ? r.data : null });
    });
    latest.current = request;
    await request.finally(() => {
      if (latest.current === request) latest.current = null;
    });
    await waitLatest();
  }, [waitLatest]);

  const verify = useCallback(async () => {
    if (latest.current) await waitLatest();
    else await refresh();
  }, [refresh, waitLatest]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const off = onSessionChange(() => void refresh());
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);

  const value = useMemo<Session>(
    () => ({ ...state, role: state.me?.role ?? "guest", refresh, verify }),
    [state, refresh, verify],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const subscribeNothing = () => () => {};

/**
 * The session as this component should render it. While a server-rendered part of the page is
 * still hydrating it gets the server's view ("loading"): parts that stream in late (inside
 * Suspense) would otherwise hydrate with the already-loaded user and not match the HTML.
 */
export function useSession(): Session {
  const session = useContext(SessionContext);
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  return hydrated ? session : { ...session, status: "loading", me: null, role: "guest" };
}
