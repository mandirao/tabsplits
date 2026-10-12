import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { z } from "zod";
import * as schema from "../shared/schema";
import { receipts, receiptItems, receiptPeople, payments, numericStringSchema, type Receipt, type ReceiptItem } from "../shared/schema";

// Multi-statement receipt writes that must succeed or fail as a unit. They take
// the database handle as a parameter (rather than importing ./db) so tests can
// run them against an in-memory Postgres — see server/receiptWrites.test.ts.

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export const replaceReceiptContentsSchema = z.object({
  receipt: z.object({
    restaurantName: z.string().trim().min(1).max(200).optional(),
    subtotal: numericStringSchema.optional(),
    tax: numericStringSchema.optional(),
    tip: numericStringSchema.optional(),
    total: numericStringSchema.optional(),
  }).strict(),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().positive().max(999),
    price: numericStringSchema,
  }).strict()).min(1, "No items detected in the image").max(200),
}).strict();

export type ReplaceReceiptContents = z.infer<typeof replaceReceiptContentsSchema>;

/**
 * Replaces a receipt's totals and its entire item list in one transaction
 * (used by re-scan). Replacement items start unassigned — the old item ids no
 * longer exist, so prior assignments can't carry over. Diners already added to
 * the receipt are kept. If anything fails, the original receipt is untouched.
 */
export async function replaceReceiptContents(
  database: Database,
  receiptId: string,
  userId: string,
  data: ReplaceReceiptContents,
): Promise<{ receipt: Receipt; items: ReceiptItem[] }> {
  return database.transaction(async tx => {
    const ownedReceipt = and(eq(receipts.id, receiptId), eq(receipts.userId, userId));
    const [receipt] = Object.keys(data.receipt).length > 0
      ? await tx.update(receipts).set(data.receipt).where(ownedReceipt).returning()
      : await tx.select().from(receipts).where(ownedReceipt);
    if (!receipt) throw new Error("Receipt not found");

    await tx.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId));
    const items = await tx
      .insert(receiptItems)
      .values(data.items.map(item => ({ ...item, receiptId })))
      .returning();
    return { receipt, items };
  });
}

/** Deletes a receipt and every row that depends on it, all-or-nothing. */
export async function deleteReceiptCascade(database: Database, receiptId: string): Promise<void> {
  await database.transaction(async tx => {
    await tx.delete(payments).where(eq(payments.receiptId, receiptId));
    await tx.delete(receiptPeople).where(eq(receiptPeople.receiptId, receiptId));
    await tx.delete(receiptItems).where(eq(receiptItems.receiptId, receiptId));
    await tx.delete(receipts).where(eq(receipts.id, receiptId));
  });
}
