import type { FeatureFlags } from "@/types";

/** Feature-flag defaults (seeded into `feature_flags`). */
export const DEFAULT_FLAGS: FeatureFlags = { autoPublish: false, aiSearch: true, aiCvParse: true, aiResumeTailor: true, aiCircularExtract: true };
