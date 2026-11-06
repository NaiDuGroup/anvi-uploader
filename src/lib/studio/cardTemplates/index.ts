import type { StudioTemplate } from "../templates";
import { BACK_CARDS } from "./backs";
import { BOLD_CARDS } from "./bold";
import { CORPORATE_CARDS } from "./corporate";
import { ELEGANT_CARDS } from "./elegant";
import { MINIMAL_CARDS } from "./minimal";
import { PHOTO_CARDS } from "./photo";

/**
 * Business-card templates, one file per family (minimal, corporate, bold
 * colour, elegant, photo) plus the backs: 24 fronts + 8 backs. Every text is bound to «Datele mele» and starts as a sample
 * (`placeholder`): an untouched sample is never printed on a card.
 */
export const CARD_TEMPLATES: readonly StudioTemplate[] = [...MINIMAL_CARDS, ...CORPORATE_CARDS, ...BOLD_CARDS, ...ELEGANT_CARDS, ...PHOTO_CARDS, ...BACK_CARDS];
