/**
 * Data-layer contract. Screens import only from here.
 * Reads → POST /api/q/<name> (Route Handler); mutations → Server Actions; file upload and
 * PDF download → Route Handlers. Same signatures and Result<T> shape as Part 1.
 */
export * from "./discovery";
export * from "./seeker";
export * from "./resumes";
export * from "./admin";
export * from "./auth";
export { getRole, setRole, onSessionChange, notifySessionChanged } from "./session";
export { forcedState, USING_SAMPLE_DATA, PREVIEW_STATES, type PreviewState } from "./_runtime";
