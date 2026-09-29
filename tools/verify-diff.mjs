#!/usr/bin/env node
/**
 * Independent ground truth: parses the two seeded CSVs with a plain CSV
 * reader (no grid, no dependency) and reports added/removed/changed/
 * unchanged counts plus the net amount difference over changed rows only.
 * The headless browser check compares the grid's KPI tiles against this.
 *
 * Run: node tools/verify-diff.mjs
 */
import { readFileSync } from 'node:fs';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    // Fields here are either bare or one double-quoted field (supplier); a
    // tiny parser suffices for this seeded shape.
    const m = line.match(/^([^,]+),"([^"]*)",([^,]+),([^,]+),(.+)$/);
    const [, invoiceId, supplier, amount, vatRate, invoiceDate] = m;
    return { invoiceId, supplier, amount: Number(amount), vatRate: Number(vatRate), invoiceDate };
  });
}

const before = parseCsv(readFileSync(new URL('../data/invoices-before.csv', import.meta.url), 'utf8'));
const after = parseCsv(readFileSync(new URL('../data/invoices-after.csv', import.meta.url), 'utf8'));

const beforeByKey = new Map(before.map((r) => [r.invoiceId, r]));
const afterByKey = new Map(after.map((r) => [r.invoiceId, r]));

let added = 0, removed = 0, changed = 0, unchanged = 0, netAmountDiff = 0;
for (const row of after.values()) {
  const prior = beforeByKey.get(row.invoiceId);
  if (!prior) { added++; continue; }
  const differs = prior.supplier !== row.supplier || prior.amount !== row.amount || prior.vatRate !== row.vatRate;
  if (differs) {
    changed++;
    netAmountDiff += row.amount - prior.amount;
  } else {
    unchanged++;
  }
}
for (const key of beforeByKey.keys()) if (!afterByKey.has(key)) removed++;

netAmountDiff = Math.round(netAmountDiff * 100) / 100;
console.log(JSON.stringify({ added, removed, changed, unchanged, netAmountDiff }, null, 2));
