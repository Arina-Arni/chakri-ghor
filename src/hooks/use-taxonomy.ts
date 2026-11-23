"use client";

import { useEffect, useState } from "react";
import { getTaxonomy } from "@/data";
import type { Taxonomy } from "@/types";

let cache: Taxonomy | null = null;
let inflight: Promise<Taxonomy | null> | null = null;

function loadTaxonomy(): Promise<Taxonomy | null> {
  if (cache) return Promise.resolve(cache);
  inflight ??= getTaxonomy().then((r) => {
    inflight = null;
    if (r.ok) cache = r.data;
    return r.ok ? r.data : null;
  });
  return inflight;
}

/** Divisions, districts, categories, tags and organizations — loaded once per session. */
export function useTaxonomy(): Taxonomy | null {
  const [tax, setTax] = useState<Taxonomy | null>(cache);
  useEffect(() => {
    let alive = true;
    void loadTaxonomy().then((t) => {
      if (alive && t) setTax(t);
    });
    return () => {
      alive = false;
    };
  }, []);
  return tax;
}
