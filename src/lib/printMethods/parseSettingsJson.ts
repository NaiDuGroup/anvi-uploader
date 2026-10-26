import type { z } from "zod";

type NumberShape = Record<string, z.ZodTypeAny>;

/**
 * Key-by-key tolerant read of a settings JSON object: each key that passes its
 * own schema is kept, every other key falls back to its default.
 */
export function parseSettingsJson<S extends NumberShape, T extends { [K in keyof S]: z.infer<S[K]> }>(
  schema: z.ZodObject<S>,
  defaults: T,
  raw: unknown,
): T {
  const base: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const merged: T = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const field: z.ZodTypeAny | undefined = schema.shape[key];
    const candidate = field?.safeParse(base[key]);
    if (candidate?.success) merged[key] = candidate.data as T[typeof key];
  }
  return merged;
}
