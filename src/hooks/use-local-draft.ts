"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage full or blocked — drafts are a convenience
  }
}
function safeRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Autosave a form draft to localStorage (debounced) and offer to restore it.
 * `pendingDraft` is set when an earlier unfinished draft exists.
 */
export function useLocalDraft<T>(key: string, value: T, opts: { enabled?: boolean; delayMs?: number } = {}) {
  const { enabled = true, delayMs = 800 } = opts;
  const storageKey = `cr:draft:${key}`;
  const [pendingDraft, setPendingDraft] = useState<T | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const checked = useRef(false);
  const skipNext = useRef(true);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    const raw = safeGet(storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { savedAt: number; value: T };
      const timer = setTimeout(() => setPendingDraft(parsed.value), 0);
      return () => clearTimeout(timer);
    } catch {
      safeRemove(storageKey);
    }
  }, [storageKey]);

  const serialized = JSON.stringify(value);
  useEffect(() => {
    if (!enabled) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const savedAt = Date.now();
      safeSet(storageKey, JSON.stringify({ savedAt, value: JSON.parse(serialized) }));
      setLastSavedAt(savedAt);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [serialized, storageKey, enabled, delayMs]);

  const clear = useCallback(() => {
    safeRemove(storageKey);
    setPendingDraft(null);
  }, [storageKey]);

  const dismiss = useCallback(() => {
    safeRemove(storageKey);
    setPendingDraft(null);
  }, [storageKey]);

  return { pendingDraft, dismiss, clear, lastSavedAt, acceptDraft: () => setPendingDraft(null) };
}
