/**
 * Gor Factory (ROLY / Stamina) article codes and their photos on
 * static.gorfactory.es. The supplier allows using the photos unchanged.
 *
 * - Stamina «NB8091S102»: model 8091, then «S», one digit, colour «02» (up to 5 digits: «01226» = white/fern green).
 *   A few have two letters instead: «BL1333TA49» = model 1333, colour 49.
 * - ROLY «CA65020101»: model 6502, size «01», colour «01» (two colours: «0555»).
 * Photo: models/{model}/model/large/{model}_{colour}_2_1.jpg
 */

export const GOR_FACTORY_IMAGE_HOST = "static.gorfactory.es";

export function gorFactoryModelColor(code: string): { model: string; color: string } | null {
  const c: string = code.trim().toUpperCase();
  const stamina = /^[A-Z]{2}(\d{4})(?:S\d|[A-Z]{2})(\d{2,5})$/.exec(c);
  if (stamina) return { model: stamina[1]!, color: stamina[2]! };
  const roly = /^[A-Z]{2}(\d{4})\d{2}(\d{2,4})$/.exec(c);
  if (roly) return { model: roly[1]!, color: roly[2]! };
  return null;
}

export function gorFactoryImageUrl(code: string): string | null {
  const mc = gorFactoryModelColor(code);
  if (!mc) return null;
  return `https://${GOR_FACTORY_IMAGE_HOST}/images/models/${mc.model}/model/large/${mc.model}_${mc.color}_2_1.jpg`;
}
