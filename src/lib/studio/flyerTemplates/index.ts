import type { StudioTemplate } from "../templates";
import { FLYER_BACKS } from "./backs";
import { FLYER_FRONTS } from "./fronts";

/**
 * Flyer templates (A6 / A5 / A4 share one layout, DL its own): the fronts by
 * purpose and the backs. Every text is bound to «Datele tale» or a slot and
 * starts as a sample (`placeholder`): an untouched sample is never printed.
 */
export const FLYER_TEMPLATES: readonly StudioTemplate[] = [...FLYER_FRONTS, ...FLYER_BACKS];
