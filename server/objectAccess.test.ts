import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeObjectAccess, canAttachImageUrl, parseObjectPath, type ObjectAccessLookups } from "./objectAccess";

const ALICE = "11111111-aaaa-4aaa-8aaa-111111111111";
const BOB = "22222222-bbbb-4bbb-8bbb-222222222222";

// Fake data: Alice owns a receipt with a new-style image and one with a legacy image.
const receipts = [
  { userId: ALICE, imageUrl: `/objects/uploads/${ALICE}/img-new`, shareToken: "share-alice-new" },
  { userId: ALICE, imageUrl: "/objects/uploads/legacy-img", shareToken: "share-alice-legacy" },
  { userId: BOB, imageUrl: `/objects/uploads/${BOB}/img-bob`, shareToken: "share-bob" },
];
const lookups: ObjectAccessLookups = {
  findReceiptByShareToken: async token => receipts.find(r => r.shareToken === token),
  userHasReceiptWithImage: async (userId, imageUrl) => receipts.some(r => r.userId === userId && r.imageUrl === imageUrl),
};
const check = (objectPath: string, userId?: string, shareToken?: string) =>
  authorizeObjectAccess({ objectPath, userId, shareToken }, lookups);

test("owner can view their attached image (new and legacy paths)", async () => {
  assert.equal(await check(`uploads/${ALICE}/img-new`, ALICE), "allow");
  assert.equal(await check("uploads/legacy-img", ALICE), "allow");
});

test("owner can view an uploaded image not yet attached to any receipt", async () => {
  assert.equal(await check(`uploads/${ALICE}/just-uploaded`, ALICE), "allow");
});

test("a different account cannot view someone else's image", async () => {
  assert.equal(await check(`uploads/${ALICE}/img-new`, BOB), "forbidden");
  assert.equal(await check("uploads/legacy-img", BOB), "forbidden");
  assert.equal(await check(`uploads/${ALICE}/just-uploaded`, BOB), "forbidden");
});

test("anonymous requests without a share token are rejected", async () => {
  assert.equal(await check(`uploads/${ALICE}/img-new`), "unauthenticated");
  assert.equal(await check("uploads/legacy-img"), "unauthenticated");
});

test("a share token unlocks only its own receipt's image", async () => {
  assert.equal(await check(`uploads/${ALICE}/img-new`, undefined, "share-alice-new"), "allow");
  assert.equal(await check("uploads/legacy-img", undefined, "share-alice-legacy"), "allow");
  // Valid token, different receipt's image:
  assert.equal(await check("uploads/legacy-img", undefined, "share-alice-new"), "forbidden");
  assert.equal(await check(`uploads/${BOB}/img-bob`, undefined, "share-alice-new"), "forbidden");
  // Unknown token:
  assert.equal(await check(`uploads/${ALICE}/img-new`, undefined, "made-up"), "forbidden");
  // Unattached upload can't be reached via someone's share token:
  assert.equal(await check(`uploads/${ALICE}/just-uploaded`, undefined, "share-alice-new"), "forbidden");
});

test("a logged-in user with someone else's share token sees only that receipt's image", async () => {
  assert.equal(await check(`uploads/${BOB}/img-bob`, ALICE, "share-bob"), "allow");
  assert.equal(await check(`uploads/${BOB}/other`, ALICE, "share-bob"), "forbidden");
});

test("malformed or traversal paths are rejected before any lookup", async () => {
  for (const bad of ["../secrets", "uploads/../x", "uploads/a/b/c", "other/abc", "", "uploads/a%2F..", "uploads/"]) {
    assert.equal(parseObjectPath(bad), null, bad);
    assert.equal(await check(bad, ALICE), "invalid", bad);
  }
});

test("users can only attach their own uploads to a receipt", () => {
  assert.equal(canAttachImageUrl(`/objects/uploads/${ALICE}/img`, ALICE), true);
  assert.equal(canAttachImageUrl(`/objects/uploads/${BOB}/img-bob`, ALICE), false);
  assert.equal(canAttachImageUrl("/objects/uploads/legacy-img", ALICE), false);
  assert.equal(canAttachImageUrl("https://evil.example/x.png", ALICE), false);
  assert.equal(canAttachImageUrl(undefined, ALICE), true);
  // Re-saving the receipt's existing (legacy) value is allowed.
  assert.equal(canAttachImageUrl("/objects/uploads/legacy-img", ALICE, "/objects/uploads/legacy-img"), true);
});
