import { z } from "zod";

/** Shared validation for posting a client-channel message (staff or cabinet). */
export const clientMessageSchema = z.object({
  text: z.string().min(1).max(1000),
});

export type ClientMessageDTO = {
  id: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
  /** True when the author is studio staff (role !== "customer"). */
  isStaff: boolean;
  /** True when the author is the requesting user. */
  isOwn: boolean;
  /** Author's display name. The cabinet UI hides this for staff (shows "Studio"). */
  authorName: string;
};

type RawClientMessage = {
  id: string;
  text: string;
  createdAt: Date;
  editedAt: Date | null;
  userId: string;
  user: { name: string; displayName: string | null; role: string };
};

/** Prisma `include` shared by both message routes so author fields stay in sync. */
export const clientMessageUserInclude = {
  user: { select: { name: true, displayName: true, role: true } },
} as const;

export function serializeClientMessage(
  m: RawClientMessage,
  currentUserId: string,
): ClientMessageDTO {
  return {
    id: m.id,
    text: m.text,
    createdAt: m.createdAt,
    editedAt: m.editedAt,
    isStaff: m.user.role !== "customer",
    isOwn: m.userId === currentUserId,
    authorName: m.user.displayName ?? m.user.name,
  };
}
