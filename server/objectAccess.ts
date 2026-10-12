/**
 * Authorization rules for receipt images in the private storage bucket.
 *
 * Kept free of database/storage imports so the rules can be unit-tested with
 * plain fakes (see server/objectAccess.test.ts).
 *
 * Path shapes (as stored in receipts.imageUrl):
 *   /objects/uploads/<userId>/<uuid>  — uploads since owner-scoped paths were added;
 *                                       the uploader owns it even before it's
 *                                       attached to a receipt.
 *   /objects/uploads/<uuid>           — legacy uploads; access is derived from
 *                                       the receipt that references the path.
 */

const SEGMENT = "[A-Za-z0-9-]{1,64}";
const OBJECT_PATH_RE = new RegExp(`^uploads/${SEGMENT}(/${SEGMENT})?$`);

/** Returns the bucket-relative path (e.g. "uploads/abc") or null if malformed. */
export function parseObjectPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return OBJECT_PATH_RE.test(raw) ? raw : null;
}

export function ownedUploadPrefix(userId: string): string {
  return `uploads/${userId}/`;
}

export function toImageUrl(objectPath: string): string {
  return `/objects/${objectPath}`;
}

export interface ObjectAccessLookups {
  findReceiptByShareToken(token: string): Promise<{ imageUrl: string | null } | undefined>;
  userHasReceiptWithImage(userId: string, imageUrl: string): Promise<boolean>;
}

export type ObjectAccessDecision = "allow" | "unauthenticated" | "forbidden" | "invalid";

export async function authorizeObjectAccess(
  request: { objectPath: unknown; userId?: string | null; shareToken?: unknown },
  lookups: ObjectAccessLookups,
): Promise<ObjectAccessDecision> {
  const objectPath = parseObjectPath(request.objectPath);
  if (!objectPath) return "invalid";
  const imageUrl = toImageUrl(objectPath);
  const shareToken = typeof request.shareToken === "string" && request.shareToken ? request.shareToken : null;
  const userId = request.userId || null;

  // A share link only unlocks the one image attached to its own receipt.
  if (shareToken) {
    const shared = await lookups.findReceiptByShareToken(shareToken);
    if (shared?.imageUrl === imageUrl) return "allow";
  }

  if (userId) {
    if (objectPath.startsWith(ownedUploadPrefix(userId))) return "allow";
    if (await lookups.userHasReceiptWithImage(userId, imageUrl)) return "allow";
  }

  return userId || shareToken ? "forbidden" : "unauthenticated";
}

/**
 * Whether a user may set `receipts.imageUrl` to `next`. Only images the user
 * uploaded themselves (owner-scoped paths) can be newly attached, so nobody can
 * gain access to someone else's image by pointing their own receipt at it.
 * Re-saving the receipt's current value is always allowed.
 */
export function canAttachImageUrl(next: string | null | undefined, userId: string, current?: string | null): boolean {
  if (next == null || next === "") return true;
  if (current != null && next === current) return true;
  if (!next.startsWith("/objects/")) return false;
  const objectPath = parseObjectPath(next.slice("/objects/".length));
  return !!objectPath && objectPath.startsWith(ownedUploadPrefix(userId));
}
