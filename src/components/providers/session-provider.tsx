"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMe, onSessionChange } from "@/data";
import type { Me, Role } from "@/types";

type Session = {
  status: "loading" | "ready";
  me: Me | null;
  role: Role;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<Session>({
  status: "loading",
  me: null,
  role: "guest",
  refresh: async () => {},
});

/** Current user from the data layer; re-fetches on login, logout and role switches. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ status: "loading" | "ready"; me: Me | null }>({ status: "loading", me: null });

  const refresh = useCallback(async () => {
    const r = await getMe();
    setState({ status: "ready", me: r.ok ? r.data : null });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const off = onSessionChange(() => void refresh());
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);

  const value = useMemo<Session>(
    () => ({ ...state, role: state.me?.role ?? "guest", refresh }),
    [state, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return useContext(SessionContext);
}
