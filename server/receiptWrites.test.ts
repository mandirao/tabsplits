import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../shared/schema";
import { receipts, receiptItems, receiptPeople, payments, people, users } from "../shared/schema";
import { deleteReceiptCascade, replaceReceiptContents, replaceReceiptContentsSchema } from "./receiptWrites";

// In-memory Postgres (WASM) — never touches the hosted database.
const client = new PGlite();
const db = drizzle(client, { schema });

const DDL = `
  CREATE TABLE users (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
    password_hash text NOT NULL, name text NOT NULL, created_at timestamp NOT NULL DEFAULT now(),
    reset_token varchar, reset_token_expiry timestamp);
  CREATE TABLE receipts (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar REFERENCES users(id),
    restaurant_name text, date timestamp NOT NULL DEFAULT now(), subtotal numeric(10,2) NOT NULL,
    tax numeric(10,2) NOT NULL, tip numeric(10,2) NOT NULL, total numeric(10,2) NOT NULL, image_url text,
    share_token varchar UNIQUE, paid_by_id varchar, dining_format text);
  CREATE TABLE receipt_items (id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id varchar NOT NULL REFERENCES receipts(id), name text NOT NULL, quantity integer NOT NULL DEFAULT 1,
    price numeric(10,2) NOT NULL, assigned_to jsonb DEFAULT '[]', assigned_quantities jsonb DEFAULT '{}', category text);
  CREATE TABLE people (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar REFERENCES users(id),
    name text NOT NULL, phone text, email text, venmo_username text, is_regular integer NOT NULL DEFAULT 0);
  CREATE TABLE receipt_people (id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id varchar NOT NULL REFERENCES receipts(id), person_id varchar NOT NULL REFERENCES people(id));
  CREATE TABLE payments (id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id varchar NOT NULL REFERENCES receipts(id), person_id varchar NOT NULL REFERENCES people(id),
    amount numeric(10,2) NOT NULL, created_at timestamp NOT NULL DEFAULT now());
`;

let ownerId: string;
let otherUserId: string;
let receiptId: string;
let personId: string;

beforeEach(async () => {
  await client.exec(`DROP TABLE IF EXISTS payments, receipt_people, people, receipt_items, receipts, users CASCADE;`);
  await client.exec(DDL);
  [{ id: ownerId }, { id: otherUserId }] = await db.insert(users).values([
    { email: "owner@example.com", passwordHash: "x", name: "Owner" },
    { email: "other@example.com", passwordHash: "x", name: "Other" },
  ]).returning();
  [{ id: receiptId }] = await db.insert(receipts).values({
    userId: ownerId, restaurantName: "Original Bistro", subtotal: "30.00", tax: "3.00", tip: "6.00", total: "39.00",
  }).returning();
  [{ id: personId }] = await db.insert(people).values({ userId: ownerId, name: "Diner" }).returning();
  await db.insert(receiptPeople).values({ receiptId, personId });
  await db.insert(receiptItems).values([
    { receiptId, name: "Tacos", quantity: 1, price: "10.00", assignedTo: [personId] },
    { receiptId, name: "Burrito", quantity: 1, price: "20.00", assignedTo: [personId] },
  ]);
  await db.insert(payments).values({ receiptId, personId, amount: "39.00" });
});

async function snapshot() {
  const [receipt] = await db.select().from(receipts).where(eq(receipts.id, receiptId));
  const items = await db.select().from(receiptItems).where(eq(receiptItems.receiptId, receiptId));
  return { receipt, items: items.map(i => ({ name: i.name, price: i.price, assignedTo: i.assignedTo })).sort((a, b) => a.name.localeCompare(b.name)) };
}

test("re-scan replaces totals and items together", async () => {
  const result = await replaceReceiptContents(db, receiptId, ownerId, {
    receipt: { restaurantName: "Rescanned Bistro", subtotal: "42.50", tax: "4.25", tip: "8.50", total: "55.25" },
    items: [
      { name: "Tacos", quantity: 2, price: "20.00" },
      { name: "Burrito", quantity: 1, price: "20.00" },
      { name: "Horchata", quantity: 1, price: "2.50" },
    ],
  });
  assert.equal(result.items.length, 3);
  const after = await snapshot();
  assert.equal(after.receipt.restaurantName, "Rescanned Bistro");
  assert.equal(after.receipt.subtotal, "42.50");
  assert.deepEqual(after.items.map(i => i.name), ["Burrito", "Horchata", "Tacos"]);
  // Replacement items start unassigned; diners on the receipt are kept.
  assert.ok(after.items.every(i => (i.assignedTo as string[]).length === 0));
  assert.equal((await db.select().from(receiptPeople).where(eq(receiptPeople.receiptId, receiptId))).length, 1);
});

test("a failure partway through a re-scan leaves the original receipt intact", async () => {
  const before = await snapshot();
  await assert.rejects(replaceReceiptContents(db, receiptId, ownerId, {
    receipt: { subtotal: "99.00", total: "99.00" },
    items: [
      { name: "Fine", quantity: 1, price: "10.00" },
      // Overflows numeric(10,2): fails in the database *after* the totals update
      // and the delete have already run inside the transaction.
      { name: "Boom", quantity: 1, price: "123456789012.00" },
    ],
  }));
  assert.deepEqual(await snapshot(), before);
});

test("re-scan is scoped to the receipt owner", async () => {
  const before = await snapshot();
  await assert.rejects(
    replaceReceiptContents(db, receiptId, otherUserId, { receipt: { subtotal: "1.00" }, items: [{ name: "X", quantity: 1, price: "1.00" }] }),
    /Receipt not found/,
  );
  await assert.rejects(
    replaceReceiptContents(db, receiptId, otherUserId, { receipt: {}, items: [{ name: "X", quantity: 1, price: "1.00" }] }),
    /Receipt not found/,
  );
  assert.deepEqual(await snapshot(), before);
});

test("re-scan input is validated before anything is written", () => {
  const ok = { receipt: { subtotal: "10.00" }, items: [{ name: "Tacos", quantity: 1, price: "10.00" }] };
  assert.equal(replaceReceiptContentsSchema.safeParse(ok).success, true);
  for (const bad of [
    { ...ok, items: [] },
    { ...ok, items: [{ name: "Comp", quantity: 1, price: "-5.00" }] },
    { ...ok, items: [{ name: "", quantity: 1, price: "1.00" }] },
    { ...ok, items: [{ name: "X", quantity: 0, price: "1.00" }] },
    { ...ok, receipt: { subtotal: "abc" } },
    { ...ok, receipt: { userId: "someone-else" } },
  ]) {
    assert.equal(replaceReceiptContentsSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

test("deleting a receipt removes it and all dependent rows", async () => {
  await deleteReceiptCascade(db, receiptId);
  assert.equal((await db.select().from(receipts).where(eq(receipts.id, receiptId))).length, 0);
  assert.equal((await db.select().from(receiptItems).where(eq(receiptItems.receiptId, receiptId))).length, 0);
  assert.equal((await db.select().from(receiptPeople).where(eq(receiptPeople.receiptId, receiptId))).length, 0);
  assert.equal((await db.select().from(payments).where(eq(payments.receiptId, receiptId))).length, 0);
  // The person (organizer's contact) is not deleted.
  assert.equal((await db.select().from(people).where(eq(people.id, personId))).length, 1);
});

test("receipt deletion is all-or-nothing", async () => {
  // Another table referencing the receipt makes the final DELETE fail after the
  // earlier deletes already ran; the transaction must undo them.
  await client.exec(`CREATE TABLE blocker (receipt_id varchar REFERENCES receipts(id));`);
  await client.query(`INSERT INTO blocker VALUES ($1)`, [receiptId]);
  const before = await snapshot();
  await assert.rejects(deleteReceiptCascade(db, receiptId));
  assert.deepEqual(await snapshot(), before);
  assert.equal((await db.select().from(payments).where(eq(payments.receiptId, receiptId))).length, 1);
  assert.equal((await db.select().from(receiptPeople).where(eq(receiptPeople.receiptId, receiptId))).length, 1);
  await client.exec(`DROP TABLE blocker;`);
});
