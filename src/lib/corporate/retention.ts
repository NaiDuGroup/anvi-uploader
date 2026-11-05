/**
 * «Pentru companii» privacy retention (policy «Cât timp păstrăm datele»):
 * the IP address and user agent stored with a request for abuse prevention
 * are erased (set to null) 12 months after the request. The request itself
 * stays (commercial relationship). Pure; the job is `retentionJob.ts`.
 */

export const CORPORATE_IP_RETENTION_MONTHS = 12;

/**
 * Requests created before this moment lose their IP / user agent: `now`
 * minus whole calendar months (UTC). A day that does not exist in the target
 * month clamps to its last day (29 Feb 2028 − 12 months → 28 Feb 2027).
 */
export function corporateIpRetentionCutoff(now: Date, months: number = CORPORATE_IP_RETENTION_MONTHS): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - months;
  const targetY = y + Math.floor(m / 12);
  const targetM = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetY,
      targetM,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

/** Prisma `updateMany` args: null the IP / user agent of requests older than the cutoff that still have one. */
export function corporateIpEraseArgs(now: Date) {
  return {
    where: {
      createdAt: { lt: corporateIpRetentionCutoff(now) },
      OR: [{ ip: { not: null } }, { userAgent: { not: null } }],
    },
    data: { ip: null, userAgent: null },
  };
}
