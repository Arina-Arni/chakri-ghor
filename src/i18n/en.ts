import type { Dictionary } from "./bn";

/** Turns literal string types into `string` so another language can fill the same shape. */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { [K in keyof T]?: Widen<T[K]> };

export type PartialDictionary = Widen<Dictionary>;

/**
 * English dictionary (partial). Bangla is the default UI language; any key missing here falls
 * back to Bangla. Filled further when the English UI ships (post-launch).
 */
export const en: PartialDictionary = {
  brand: { name: "Chakri Radar", tagline: "Every job circular, one radar", logoAlt: "Chakri Radar — home" },
  common: { loading: "Loading…", retry: "Try again", save: "Save", cancel: "Cancel", close: "Close" },
  nav: { jobs: "Find jobs", login: "Log in", signup: "Sign up", logout: "Log out" },
  states: {
    errorTitle: "Something went wrong",
    offline: "No internet connection — we'll retry when you're back online",
  },
};
