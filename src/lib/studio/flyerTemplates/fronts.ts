import type { StudioTemplate } from "../templates";
import { EVENT_FLYERS } from "./events";
import { FOOD_FLYERS } from "./food";
import { PROMO_FLYERS } from "./promo";
import { SERVICE_FLYERS } from "./services";
import { TRADE_FLYERS } from "./trades";

/**
 * Flyer fronts by family (one file each): promotions and openings, food,
 * services (beauty, medical, fitness), trades (auto, construction, realty,
 * education) and events / Christmas. Every front is drawn for the ISO files
 * and for DL (`kit.ts`).
 */
export const FLYER_FRONTS: StudioTemplate[] = [...PROMO_FLYERS, ...FOOD_FLYERS, ...SERVICE_FLYERS, ...TRADE_FLYERS, ...EVENT_FLYERS];
