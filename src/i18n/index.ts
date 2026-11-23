import { toBnDigits } from "@/domain/bn";
import { bn, type Dictionary } from "./bn";
import { en } from "./en";

export type Locale = "bn" | "en";

/** The UI ships in Bangla; English is partial and used only where filled. */
const locale: Locale = "bn";

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly unknown[]
      ? never
      : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every dotted key that points at a string in the Bangla dictionary. */
export type TKey = Leaves<Dictionary>;

export type TVars = Record<string, string | number>;

function lookup(dict: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object") return (node as Record<string, unknown>)[part];
    return undefined;
  }, dict);
}

function interpolate(template: string, vars?: TVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const v = vars[name];
    if (v === undefined) return match;
    return typeof v === "number" && locale === "bn" ? toBnDigits(v) : String(v);
  });
}

/** Translate a key. Numbers in `vars` are shown with Bangla digits. */
export function t(key: TKey, vars?: TVars): string {
  const fromLocale = (locale as Locale) === "en" ? lookup(en, key) : undefined;
  const value = typeof fromLocale === "string" ? fromLocale : lookup(bn, key);
  return typeof value === "string" ? interpolate(value, vars) : key;
}

/** Whole dictionary, for structured entries (lists, enum label maps). */
export const messages: Dictionary = bn;

export { bn };
