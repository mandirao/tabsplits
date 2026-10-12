/**
 * Single source of truth for turning a receipt line item into dollar amounts
 * owed per person. `item.price` is always the TOTAL cost of the line (it
 * already covers every unit in `quantity` — see server/routes.ts scan prompt),
 * never a per-unit price.
 *
 * `assignedQuantities` is a relative weight, not a literal unit count — the
 * assign-person UI lets people split an item into weighted "shares" (e.g. 1
 * share each for 4 people splitting a single appetizer) independent of how
 * many physical units were purchased. A person with no explicit weight entry
 * defaults to a weight of 1, matching AssignPersonSheetBody's own display math.
 */

export interface SplittableItem {
  price: string | number;
  assignedTo?: string[] | null;
  assignedQuantities?: Record<string, number> | null;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Total dollar cost of this line item. */
export function getItemLineTotal(item: Pick<SplittableItem, "price">): number {
  return toNumber(item.price);
}

/** True when at least one assigned person has an explicit custom share weight. */
function hasCustomShares(assignedTo: string[], qtys: Record<string, number>): boolean {
  return assignedTo.some(pid => (qtys[pid] ?? 0) > 0);
}

/**
 * Total number of "shares" this item is divided into: the sum of everyone's
 * weight when custom shares are set, otherwise just the number of people
 * splitting it evenly.
 */
export function getItemTotalShares(item: Pick<SplittableItem, "assignedTo" | "assignedQuantities">): number {
  const assignedTo = item.assignedTo ?? [];
  const qtys = item.assignedQuantities ?? {};
  if (!hasCustomShares(assignedTo, qtys)) return assignedTo.length;
  return assignedTo.reduce((sum, pid) => sum + (qtys[pid] ?? 1), 0);
}

/** Dollar share of this line item for every person it's assigned to. */
export function getItemShares(item: SplittableItem): Record<string, number> {
  const assignedTo = item.assignedTo ?? [];
  if (assignedTo.length === 0) return {};

  const lineTotal = getItemLineTotal(item);
  const qtys = item.assignedQuantities ?? {};
  const shares: Record<string, number> = {};

  if (hasCustomShares(assignedTo, qtys)) {
    const totalShares = getItemTotalShares(item);
    for (const personId of assignedTo) {
      shares[personId] = totalShares > 0 ? ((qtys[personId] ?? 1) / totalShares) * lineTotal : 0;
    }
  } else {
    const evenShare = lineTotal / assignedTo.length;
    for (const personId of assignedTo) {
      shares[personId] = evenShare;
    }
  }

  return shares;
}

/** Dollar share of this line item owed by a single person (0 if not assigned). */
export function getPersonItemShare(item: SplittableItem, personId: string): number {
  return getItemShares(item)[personId] ?? 0;
}

export interface PersonTotals {
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Splits `totalCents` across people in proportion to `weights`, in whole cents,
 * so the parts always add back up to exactly `totalCents`. Each person gets the
 * floor of their exact share; leftover cents go to the largest fractional
 * remainders, ties broken by person id so the result is deterministic.
 */
export function allocateCents(totalCents: number, weights: Map<string, number>): Map<string, number> {
  const ids = Array.from(weights.keys()).sort();
  const weightSum = ids.reduce((sum, id) => sum + Math.max(0, weights.get(id)!), 0);
  const result = new Map<string, number>(ids.map(id => [id, 0]));
  if (weightSum <= 0 || totalCents <= 0) return result;

  const exact = ids.map(id => (Math.max(0, weights.get(id)!) / weightSum) * totalCents);
  let remaining = totalCents;
  ids.forEach((id, i) => {
    const floor = Math.floor(exact[i] + 1e-9);
    result.set(id, floor);
    remaining -= floor;
  });
  const byRemainder = ids
    .map((id, i) => ({ id, rem: exact[i] - result.get(id)! }))
    .sort((x, y) => (y.rem - x.rem) || (x.id < y.id ? -1 : 1));
  for (let i = 0; remaining > 0; i = (i + 1) % byRemainder.length, remaining--) {
    const id = byRemainder[i].id;
    result.set(id, result.get(id)! + 1);
  }
  return result;
}

/**
 * Per-person subtotal, tax, tip, and total across every item on a receipt, in
 * whole cents. Tax and tip are split proportionally to each person's share of
 * the receipt subtotal. Every component is allocated with `allocateCents`, so
 * for a fully assigned receipt whose items add up to its subtotal, the
 * per-person totals add up to subtotal + tax + tip exactly.
 */
export function getPersonTotals(
  items: SplittableItem[],
  receiptTotals: { subtotal: number; tax: number; tip: number }
): Map<string, PersonTotals> {
  const exactSubtotals = new Map<string, number>();
  let assignedCents = 0;

  items.forEach(item => {
    const shares = getItemShares(item);
    if (Object.keys(shares).length === 0) return;
    assignedCents += toCents(getItemLineTotal(item));
    Object.entries(shares).forEach(([personId, share]) => {
      exactSubtotals.set(personId, (exactSubtotals.get(personId) ?? 0) + share);
    });
  });

  const receiptSubtotalCents = toCents(receiptTotals.subtotal);
  const proportionAssigned = receiptSubtotalCents > 0 ? assignedCents / receiptSubtotalCents : 0;
  const subtotalCents = allocateCents(assignedCents, exactSubtotals);
  const taxCents = allocateCents(Math.round(toCents(receiptTotals.tax) * proportionAssigned), exactSubtotals);
  const tipCents = allocateCents(Math.round(toCents(receiptTotals.tip) * proportionAssigned), exactSubtotals);

  const personTotals = new Map<string, PersonTotals>();
  exactSubtotals.forEach((_, personId) => {
    const sub = subtotalCents.get(personId)!;
    const tax = taxCents.get(personId)!;
    const tip = tipCents.get(personId)!;
    personTotals.set(personId, { subtotal: sub / 100, tax: tax / 100, tip: tip / 100, total: (sub + tax + tip) / 100 });
  });
  return personTotals;
}

export interface ItemReconciliation {
  itemsTotal: number;
  subtotal: number;
  /** itemsTotal - subtotal, in dollars (negative = items fall short). */
  difference: number;
  matches: boolean;
}

/** Compares the sum of line items with the receipt's stored subtotal, to the cent. */
export function reconcileItems(items: Pick<SplittableItem, "price">[], subtotal: string | number): ItemReconciliation {
  const itemsCents = items.reduce((sum, item) => sum + toCents(getItemLineTotal(item)), 0);
  const subtotalCents = toCents(toNumber(subtotal));
  return {
    itemsTotal: itemsCents / 100,
    subtotal: subtotalCents / 100,
    difference: (itemsCents - subtotalCents) / 100,
    matches: itemsCents === subtotalCents,
  };
}

/**
 * Plain-language warning when a receipt's items don't add up to its stored
 * subtotal, or null when they match (or there are no items yet). Advisory
 * only: the organizer can still share. Shown to the organizer and, in short
 * form, on the shared link, so a discrepancy is never silent.
 */
export function describeSubtotalMismatch(items: Pick<SplittableItem, "price">[], subtotal: string | number): string | null {
  if (items.length === 0) return null;
  const r = reconcileItems(items, subtotal);
  if (r.matches) return null;
  if (r.subtotal === 0) {
    return `This receipt doesn't have a subtotal yet, so tax and tip aren't being split and individual amounts ` +
      `won't add up to the bill. You can set the subtotal to the items total ($${r.itemsTotal.toFixed(2)}).`;
  }
  const gap = Math.abs(r.difference).toFixed(2);
  const direction = r.difference < 0 ? `$${gap} less than` : `$${gap} more than`;
  return `Items add up to $${r.itemsTotal.toFixed(2)}, which is ${direction} the receipt subtotal of $${r.subtotal.toFixed(2)}, ` +
    `so individual amounts won't add up to the bill total. You can still share, or fix the items or subtotal first.`;
}
