import type { StudioTemplate } from "../templates";
import { BACK_CARDS } from "./backs";
import { BOLD_CARDS } from "./bold";
import { CORPORATE_CARDS } from "./corporate";
import { ELEGANT_CARDS } from "./elegant";
import { MINIMAL_CARDS } from "./minimal";

/**
 * Business-card templates, one file per family (minimal, corporate, bold
 * colour, elegant) plus the backs. Phase 1 (bc-1/bc-2) has one front per
 * family and two backs; the full set (24 fronts + 8 backs) goes into the same
 * files. Every text is bound to «Datele mele» and starts as a sample
 * (`placeholder`): an untouched sample is never printed on a card.
 */
export const CARD_TEMPLATES: readonly StudioTemplate[] = [...MINIMAL_CARDS, ...CORPORATE_CARDS, ...BOLD_CARDS, ...ELEGANT_CARDS, ...BACK_CARDS];
