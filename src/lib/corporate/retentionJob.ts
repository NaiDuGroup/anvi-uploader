import "server-only";
import { prisma } from "@/lib/prisma";
import { corporateIpEraseArgs } from "./retention";

/** Erase the IP / user agent of «Pentru companii» requests older than 12 months; returns how many requests changed. */
export async function eraseOldCorporateRequestIps(now: Date = new Date()): Promise<number> {
  const res = await prisma.corporateRequest.updateMany(corporateIpEraseArgs(now));
  return res.count;
}
