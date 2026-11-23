import type { FieldErrors, FieldValues } from "react-hook-form";

/** DOM id for a form field name ("posts.0.vacancies" → "posts-0-vacancies"). */
export const fieldId = (name: string) => name.replace(/\./g, "-");

export type FlatError = { id: string; message: string; label: string };

/**
 * Flatten react-hook-form errors (nested objects and arrays) for the error summary.
 * `labelFor` turns a field path into a human label.
 */
export function flattenErrors<T extends FieldValues>(errors: FieldErrors<T>, labelFor: (path: string) => string): FlatError[] {
  const out: FlatError[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as { message?: unknown; type?: unknown; ref?: unknown };
    if (typeof n.message === "string" && n.message && (n.type !== undefined || n.ref !== undefined)) {
      out.push({ id: fieldId(path), message: n.message, label: labelFor(path) });
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "ref" || k === "root") continue;
      walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(errors, "");
  return out;
}

/** Map server field errors (Result.error.fields) onto react-hook-form. */
export function applyServerErrors(fields: Record<string, string> | undefined, setError: (name: never, e: { message: string }) => void) {
  if (!fields) return;
  for (const [name, message] of Object.entries(fields)) setError(name as never, { message });
}
