/**
 * Normalizes a JS Date for Prisma/PostgreSQL `@db.Date` columns (store calendar day in UTC).
 */
export function toDatabaseDateOnly(input: Date): Date {
  return new Date(
    Date.UTC(
      input.getUTCFullYear(),
      input.getUTCMonth(),
      input.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
}
