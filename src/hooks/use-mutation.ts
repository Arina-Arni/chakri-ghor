"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { notifySessionExpired } from "@/lib/events";
import type { ApiError, Result } from "@/types";

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

type Options<T> = {
  /** Toast shown on success. */
  successMessage?: string | ((data: T) => string);
  /** Show the error as a toast (default true). Forms that show inline errors pass false. */
  toastError?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: ApiError) => void;
};

/**
 * Run a data-layer mutation with a fresh idempotency key per submit.
 * While pending, further calls are ignored, so double submits are impossible.
 */
export function useMutation<A extends unknown[], T>(
  fn: (key: string, ...args: A) => Promise<Result<T>>,
  options: Options<T> = {},
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  const run = useCallback(
    async (...args: A): Promise<Result<T> | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      setError(null);
      const key = newIdempotencyKey();
      let result: Result<T>;
      try {
        result = await fn(key, ...args);
      } catch {
        result = { ok: false, error: { code: "NETWORK", message_bn: "সার্ভারের সাথে যোগাযোগ করা যায়নি।" } };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
      const o = optsRef.current;
      if (result.ok) {
        const msg = typeof o.successMessage === "function" ? o.successMessage(result.data) : o.successMessage;
        if (msg) toast.success(msg);
        o.onSuccess?.(result.data);
      } else {
        setError(result.error);
        if (result.error.code === "UNAUTHENTICATED") notifySessionExpired();
        if (o.toastError !== false && result.error.code !== "CONFLICT") {
          toast.error(result.error.message_bn, {
            description: result.error.requestId ? `রেফারেন্স: ${result.error.requestId}` : undefined,
          });
        }
        o.onError?.(result.error);
      }
      return result;
    },
    [fn],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
