/**
 * Data-layer contract (spec §9). Screens import only from here.
 * Part 1: TEMP fixture implementations. Part 2: real database, auth and business rules.
 */
export * from "./discovery";
export * from "./seeker";
export * from "./resumes";
export * from "./admin";
export * from "./auth";
export { getRole, setRole, onSessionChange } from "./session";
export { forcedState, USING_SAMPLE_DATA, PREVIEW_STATES, type PreviewState } from "./_runtime";
