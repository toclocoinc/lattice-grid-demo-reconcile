#!/usr/bin/env node
/**
 * Generates the two seeded extracts the demo ships: a "before" (last month)
 * and an "after" (this month) supplier-invoice CSV, ~5,000 rows each,
 * differing in ~120 rows by a stated recipe. Deterministic (seeded PRNG), so
 * re-running this script reproduces byte-identical files.
 *
 * Recipe (BACKLOG-0001529): of the 5,000 invoices in "before" —
 *   - 30 are settled and removed from "after" (paid, no longer open)
 *   - 40 have their amount changed (a correction/credit note)
 *   - 15 have their VAT rate changed 20% -> 21% (a rate rise applied to
 *     invoices raised on/after a cut-over date)
 *   - 5 belong to one supplier who was renamed ("Meridian Supplies Ltd" ->
 *     "Meridian Supplies Limited") — these 5 rows are otherwise unchanged
 *   - 30 new invoices are added in "after" that were not in "before"
 * Total exception rows: 30 + 40 + 15 + 5 + 30 = 120. The five categories are
 * disjoint (a permutation of row indices is sliced, not sampled with
 * replacement), so no row carries two exceptions at once.
 *
 * Run: node tools/gen-data.mjs
 */

const ROWS = 5000;
const SEED = 20260929;

function mulberry32(seed) {
  let a = seed;
  return function rnd() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = mulberry32(SEED);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const SUPPLIERS = [
  'Northfield Timber Co', 'Alderman Logistics', 'Berkshire Print & Signage',
  'Cascade Office Supplies', 'Delta Facilities Group', 'Everline Electrical',
  'Foxglove Catering', 'Granite Fleet Services', 'Harbour Point Packaging',
  'Ironside Security', 'Juniper IT Services', 'Kestrel Waste Management',
  'Larkspur Cleaning Contracts', 'Newton Freight', 'Oakwood Landscaping',
  'Pinnacle Consulting', 'Quarryside Aggregates', 'Riverside Maintenance',
  'Solstice Energy Partners',
]; // 'Meridian Supplies Ltd' is deliberately not in this pool — see below.

function invoiceDate(i) {
  const day = 1 + (i % 28);
  const month = 8 + Math.floor(i / 28) % 2; // Aug/Sep
  return `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function money(n) { return Math.round(n * 100) / 100; }

// A Fisher-Yates shuffle of the seeded PRNG, so five disjoint, exact-count
// index pools can be sliced off the front rather than sampled with retries.
const order = Array.from({ length: ROWS }, (_, i) => i);
for (let i = ROWS - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
const removedIdx = new Set(order.slice(0, 30));
const amountIdx = new Set(order.slice(30, 70));
const vatIdx = new Set(order.slice(70, 85));
const meridianIdx = new Set(order.slice(85, 90));

const before = [];
for (let i = 0; i < ROWS; i++) {
  before.push({
    invoiceId: `INV-${100000 + i}`,
    supplier: meridianIdx.has(i) ? 'Meridian Supplies Ltd' : pick(SUPPLIERS),
    amount: money(int(4000, 950000) / 100),
    vatRate: 0.20,
    invoiceDate: invoiceDate(i),
  });
}

const after = [];
for (let i = 0; i < ROWS; i++) {
  if (removedIdx.has(i)) continue; // settled — absent from "after"
  const row = { ...before[i] };
  if (amountIdx.has(i)) row.amount = money(row.amount + (rnd() < 0.5 ? -1 : 1) * int(500, 20000) / 100);
  if (vatIdx.has(i)) row.vatRate = 0.21;
  if (meridianIdx.has(i)) row.supplier = 'Meridian Supplies Limited';
  after.push(row);
}
// 30 new invoices, unseen in "before".
for (let i = 0; i < 30; i++) {
  after.push({
    invoiceId: `INV-${200000 + i}`,
    supplier: pick(SUPPLIERS),
    amount: money(int(4000, 950000) / 100),
    vatRate: 0.21,
    invoiceDate: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`,
  });
}

function toCsv(rows) {
  const header = 'invoiceId,supplier,amount,vatRate,invoiceDate';
  const lines = rows.map((r) => `${r.invoiceId},"${r.supplier}",${r.amount},${r.vatRate},${r.invoiceDate}`);
  return [header, ...lines].join('\r\n') + '\r\n';
}

const fs = await import('node:fs');
fs.writeFileSync(new URL('../data/invoices-before.csv', import.meta.url), toCsv(before));
fs.writeFileSync(new URL('../data/invoices-after.csv', import.meta.url), toCsv(after));

console.log(`before: ${before.length} rows, after: ${after.length} rows`);
console.log(`removed: ${removedIdx.size}, amount-changed: ${amountIdx.size}, vat-changed: ${vatIdx.size}, `
  + `renamed-supplier: ${meridianIdx.size}, added: 30`);
console.log(`total exception rows: ${removedIdx.size + amountIdx.size + vatIdx.size + meridianIdx.size + 30}`);
