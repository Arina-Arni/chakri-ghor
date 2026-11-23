"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError, Result } from "@/types";

export type DataState<T> =
  | { status: "loading"; data: undefined; error: undefined }
  | { status: "success"; data: T; error: undefined }
  | { status: "error"; data: undefined; error: ApiError };

/**
 * Load data through a data-layer function. Re-runs when `deps` change.
 * Keeps the previous data while refetching (`refreshing`) so lists don't flash.
 */
export function useData<T>(fetcher: () => Promise<Result<T>>, deps: unknown[] = []) {
  const [state, setState] = useState<DataState<T>>({ status: "loading", data: undefined, error: undefined });
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const load = useCallback(async (mode: "initial" | "refresh") => {
    const id = ++seq.current;
    if (mode === "refresh") setRefreshing(true);
    else setState({ status: "loading", data: undefined, error: undefined });
    let result: Result<T>;
    try {
      result = await fetcherRef.current();
    } catch {
      result = { ok: false, error: { code: "NETWORK", message_bn: "সার্ভারের সাথে যোগাযোগ করা যায়নি।" } };
    }
    if (id !== seq.current) return;
    setRefreshing(false);
    setState(
      result.ok
        ? { status: "success", data: result.data, error: undefined }
        : { status: "error", data: undefined, error: result.error },
    );
  }, []);

  useEffect(() => {
    // Data loads after mount: the server-rendered shell shows the skeleton.
    const timer = setTimeout(() => void load("initial"), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /** Replace data locally (optimistic updates, results of mutations). */
  const setData = useCallback((updater: T | ((prev: T) => T)) => {
    setState((s) =>
      s.status === "success"
        ? { ...s, data: typeof updater === "function" ? (updater as (p: T) => T)(s.data) : updater }
        : s,
    );
  }, []);

  return {
    ...state,
    refreshing,
    reload: useCallback(() => load("initial"), [load]),
    refresh: useCallback(() => load("refresh"), [load]),
    setData,
  };
}
