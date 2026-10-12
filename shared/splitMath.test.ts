import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateCents,
  getItemShares,
  getPersonTotals,
  describeSubtotalMismatch,
  reconcileItems,
  type SplittableItem,
} from "./splitMath";

const cents = (n: number) => Math.round(n * 100);
const sumTotalsCents = (totals: ReturnType<typeof getPersonTotals>) =>
  [...totals.values()].reduce((s, t) => s + cents(t.total), 0);

test("price is the line total, not a unit price (quantity doesn't multiply)", () => {
  const shares = getItemShares({ price: "24.00", assignedTo: ["a"] });
  assert.deepEqual(shares, { a: 24 });
  const totals = getPersonTotals([{ price: "24.00", assignedTo: ["a"] }], { subtotal: 24, tax: 0, tip: 0 });
  assert.equal(totals.get("a")!.subtotal, 24);
});

test("equal split divides a line evenly", () => {
  const shares = getItemShares({ price: "30.00", assignedTo: ["a", "b", "c"] });
  assert.deepEqual(shares, { a: 10, b: 10, c: 10 });
});

test("weighted split follows share weights; unweighted people default to 1", () => {
  assert.deepEqual(
    getItemShares({ price: "75.00", assignedTo: ["a", "b", "c"], assignedQuantities: { a: 2, b: 2, c: 1 } }),
    { a: 30, b: 30, c: 15 },
  );
  assert.deepEqual(
    getItemShares({ price: "30.00", assignedTo: ["a", "b"], assignedQuantities: { a: 2 } }),
    { a: 20, b: 10 },
  );
});

test("tax and tip are proportional to each person's subtotal", () => {
  const items: SplittableItem[] = [
    { price: "30.00", assignedTo: ["a"] },
    { price: "10.00", assignedTo: ["b"] },
  ];
  const totals = getPersonTotals(items, { subtotal: 40, tax: 4, tip: 8 });
  assert.deepEqual(totals.get("a"), { subtotal: 30, tax: 3, tip: 6, total: 39 });
  assert.deepEqual(totals.get("b"), { subtotal: 10, tax: 1, tip: 2, total: 13 });
});

test("an awkward three-way split still reconciles to the cent", () => {
  const items: SplittableItem[] = [{ price: "10.00", assignedTo: ["a", "b", "c"] }];
  const totals = getPersonTotals(items, { subtotal: 10, tax: 0.83, tip: 2 });
  assert.equal(sumTotalsCents(totals), cents(10 + 0.83 + 2));
  // Every amount is a whole number of cents.
  for (const t of totals.values()) {
    for (const v of [t.subtotal, t.tax, t.tip, t.total]) assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, String(v));
  }
  // The odd cents land deterministically (largest remainder, then person id).
  assert.deepEqual([...totals.values()].map(t => t.subtotal).sort(), [3.33, 3.33, 3.34]);
  assert.equal(totals.get("a")!.subtotal, 3.34);
});

test("INVARIANT: fully assigned, reconciled receipts allocate the receipt total to the cent", () => {
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 3000; run++) {
    const people = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].slice(0, 2 + Math.floor(rnd() * 7));
    const items: SplittableItem[] = Array.from({ length: 1 + Math.floor(rnd() * 15) }, () => {
      const assignedTo = people.filter(() => rnd() < 0.4);
      if (assignedTo.length === 0) assignedTo.push(people[Math.floor(rnd() * people.length)]);
      const weighted = rnd() < 0.3;
      return {
        price: (Math.floor(rnd() * 9000) / 100).toFixed(2),
        assignedTo,
        assignedQuantities: weighted ? Object.fromEntries(assignedTo.map(p => [p, 1 + Math.floor(rnd() * 3)])) : {},
      };
    });
    const subtotal = reconcileItems(items, 0).itemsTotal;
    const tax = Math.round(subtotal * (5 + rnd() * 6)) / 100;
    const tip = Math.round(subtotal * rnd() * 30) / 100;
    const totals = getPersonTotals(items, { subtotal, tax, tip });
    assert.equal(sumTotalsCents(totals), cents(subtotal) + cents(tax) + cents(tip), `run ${run}`);
  }
});

test("unassigned items are not charged to anyone", () => {
  const items: SplittableItem[] = [
    { price: "20.00", assignedTo: ["a"] },
    { price: "20.00", assignedTo: [] },
  ];
  const totals = getPersonTotals(items, { subtotal: 40, tax: 4, tip: 8 });
  assert.deepEqual([...totals.keys()], ["a"]);
  assert.deepEqual(totals.get("a"), { subtotal: 20, tax: 2, tip: 4, total: 26 });
});

test("allocateCents always sums to the pool and is deterministic", () => {
  const weights = new Map([["b", 1], ["a", 1], ["c", 1]]);
  const result = allocateCents(100, weights);
  assert.equal([...result.values()].reduce((s, v) => s + v, 0), 100);
  assert.deepEqual(Object.fromEntries(result), { a: 34, b: 33, c: 33 });
  assert.deepEqual(Object.fromEntries(allocateCents(5, new Map([["a", 0], ["b", 0]]))), { a: 0, b: 0 });
});

test("reconcileItems compares line totals with the subtotal to the cent", () => {
  assert.equal(reconcileItems([{ price: "10.10" }, { price: "20.20" }], "30.30").matches, true);
  const short = reconcileItems([{ price: "10.00" }], "12.50");
  assert.equal(short.matches, false);
  assert.equal(short.difference, -2.5);
  assert.equal(reconcileItems([{ price: "10.00" }], "10.01").matches, false);
});

test("describeSubtotalMismatch warns (without blocking) when items don't match the subtotal", () => {
  assert.equal(describeSubtotalMismatch([{ price: "10.00" }], "10.00"), null);
  assert.equal(describeSubtotalMismatch([], "25.00"), null);
  const msg = describeSubtotalMismatch([{ price: "40.00" }], "52.75")!;
  assert.match(msg, /Items add up to \$40\.00/);
  assert.match(msg, /\$12\.75 less than the receipt subtotal of \$52\.75/);
  assert.match(msg, /individual amounts won't add up to the bill total/);
  assert.match(describeSubtotalMismatch([{ price: "60.00" }], "52.75")!, /\$7\.25 more than/);
  // Manually created receipts start with a 0.00 subtotal.
  assert.match(describeSubtotalMismatch([{ price: "18.00" }], "0.00")!, /doesn't have a subtotal yet.*\$18\.00/);
});

test("a mismatched bill still splits, and the shortfall is visible rather than hidden", () => {
  // Items total $40 but the receipt says $50 (e.g. a missed $10 item).
  const items = [{ price: "25.00", assignedTo: ["a"] }, { price: "15.00", assignedTo: ["b"] }];
  const totals = getPersonTotals(items, { subtotal: 50, tax: 5, tip: 10 });
  const allocated = [...totals.values()].reduce((s, t) => s + cents(t.total), 0);
  // Diners are charged for what they had plus a proportional share of tax/tip;
  // the gap to the $65 bill is exactly what the warning describes.
  assert.equal(allocated, cents(40 + 4 + 8));
  assert.ok(describeSubtotalMismatch(items, 50));
});
