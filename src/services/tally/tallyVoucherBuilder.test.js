// Dependency-free self-test for tallyVoucherBuilder.js. Runnable directly:
//
//   node src/services/tally/tallyVoucherBuilder.test.js
//
// The invoice figures are real ones from company 67 (invoice 1742 etc.), so the rounding and
// GST-on-charges behaviour is checked against how this CRM actually stores totals.
import assert from "assert";
import {
  buildReceiptPayload,
  buildSalesInvoicePayload,
  invoiceRemoteId,
  resolveLedgerNames,
  toTallyDate,
} from "./tallyVoucherBuilder.js";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}\n  ${error.message}`);
  }
}

const ledgers = resolveLedgerNames({});
const gstLedgerName = (rate, slot) => `Output ${slot.toUpperCase()} @${slot === "igst" ? rate : rate / 2}%`;
const base = { companyId: 67, partyName: "Acme Traders", ledgers, isSameState: true, stockItemName: (i) => i.item_product_name, gstLedgerName };
const line = (over = {}) => ({ item_product_name: "Advance", item_unit_name: "Piece", item_qty: 64, item_total: 7168, item_gst: 18, ...over });
const cart = (over = {}) => ({ id: 1742, cart_number: "INV1/80/2026-2027", cart_date: "2026-10-19", total_amt: 7168, gst_amt: 1290.24, round_off: -0.24, grand_total: 8458, ...over });

const sum = (entries, debit) => Math.round(entries.filter((e) => e.isDebit === debit).reduce((s, e) => s + e.amount, 0) * 100) / 100;
const balanced = (p) => Math.abs(sum(p.entries, true) - (p.inventoryEntries.reduce((s, l) => s + l.amount, 0) + sum(p.entries, false))) < 0.005;

test("dates: DATEONLY string and IST Date", () => {
  assert.strictEqual(toTallyDate("2026-10-19"), "20261019");
  assert.strictEqual(toTallyDate(new Date("2026-10-18T18:30:00.000Z")), "20261019"); // 19 Oct 00:00 IST
  assert.strictEqual(toTallyDate(null), null);
});

test("invoice 1742: same state -> CGST+SGST halves, round-off debit, balanced", () => {
  const { payload, problems } = buildSalesInvoicePayload({ ...base, cart: cart(), items: [line()] });
  assert.strictEqual(problems, undefined);
  assert.strictEqual(payload.remoteId, invoiceRemoteId(67, 1742));
  assert.strictEqual(payload.date, "20261019");
  assert.strictEqual(payload.vchType, "Sales");
  const byLedger = Object.fromEntries(payload.entries.map((e) => [e.ledgerName, e]));
  assert.strictEqual(byLedger["Acme Traders"].amount, 8458);
  assert.strictEqual(byLedger["Acme Traders"].isDebit, true);
  assert.strictEqual(byLedger["Acme Traders"].isPartyLedger, true);
  assert.strictEqual(byLedger["Output CGST @9%"].amount, 645.12);
  assert.strictEqual(byLedger["Output SGST @9%"].amount, 645.12);
  assert.strictEqual(byLedger["Round Off"].isDebit, true);
  assert.strictEqual(byLedger["Round Off"].amount, 0.24);
  assert.ok(balanced(payload));
});

test("inter-state -> a single IGST line", () => {
  const { payload } = buildSalesInvoicePayload({ ...base, isSameState: false, cart: cart(), items: [line()] });
  const igst = payload.entries.find((e) => e.ledgerName === "Output IGST @18%");
  assert.strictEqual(igst.amount, 1290.24);
  assert.ok(!payload.entries.some((e) => /CGST|SGST/.test(e.ledgerName) && !/IGST/.test(e.ledgerName)));
  assert.ok(balanced(payload));
});

test("charges are credited to the charges ledger and GST still balances (invoice 377)", () => {
  const { payload } = buildSalesInvoicePayload({
    ...base,
    cart: cart({ id: 377, total_amt: 1800, transport_charge: 200, gst_amt: 360, round_off: 0, grand_total: 2360 }),
    items: [line({ item_qty: 1, item_total: 1800 })],
  });
  assert.strictEqual(payload.entries.find((e) => e.ledgerName === "Freight and Packing").amount, 200);
  assert.ok(balanced(payload));
});

test("two GST rates split the cart GST in proportion", () => {
  const { payload } = buildSalesInvoicePayload({
    ...base,
    cart: cart({ total_amt: 2000, gst_amt: 190, round_off: 0, grand_total: 2190 }),
    items: [line({ item_product_name: "A", item_qty: 1, item_total: 1000, item_gst: 18 }), line({ item_product_name: "B", item_qty: 1, item_total: 1000, item_gst: 5 })],
  });
  const total = payload.entries.filter((e) => /@/.test(e.ledgerName)).reduce((s, e) => s + e.amount, 0);
  assert.strictEqual(Math.round(total * 100) / 100, 190);
  assert.ok(payload.entries.some((e) => e.ledgerName === "Output CGST @9%"));
  assert.ok(payload.entries.some((e) => e.ledgerName === "Output CGST @2.5%"));
  assert.ok(balanced(payload));
});

test("a bigger shortfall is booked as a discount", () => {
  const { payload } = buildSalesInvoicePayload({ ...base, cart: cart({ round_off: 0, gst_amt: 1290.24, grand_total: 8408.24 }), items: [line()] });
  const d = payload.entries.find((e) => e.ledgerName === "Discount Allowed");
  assert.strictEqual(d.isDebit, true);
  assert.strictEqual(d.amount, 50);
  assert.ok(balanced(payload));
});

test("a total that exceeds its parts is refused, not guessed", () => {
  const r = buildSalesInvoicePayload({ ...base, cart: cart({ grand_total: 9999 }), items: [line()] });
  assert.ok(r.problems && /more than/.test(r.problems[0]));
  assert.strictEqual(r.payload, undefined);
});

test("problems: no items, no party, no qty, no GST rate, no stock name", () => {
  assert.ok(buildSalesInvoicePayload({ ...base, cart: cart(), items: [] }).problems);
  assert.ok(buildSalesInvoicePayload({ ...base, partyName: "", cart: cart(), items: [line()] }).problems);
  assert.ok(buildSalesInvoicePayload({ ...base, cart: cart(), items: [line({ item_qty: 0 })] }).problems);
  assert.ok(buildSalesInvoicePayload({ ...base, cart: cart(), items: [line({ item_gst: 0 })] }).problems);
  assert.ok(buildSalesInvoicePayload({ ...base, stockItemName: () => "", cart: cart(), items: [line()] }).problems);
});

test("ensureLedgers lists every ledger the voucher uses, once, with a parent", () => {
  const { payload } = buildSalesInvoicePayload({ ...base, cart: cart(), items: [line()] });
  const names = payload.ensureLedgers.map((l) => l.name);
  assert.deepStrictEqual(names, [...new Set(names)]);
  for (const used of payload.entries.map((e) => e.ledgerName).concat("Sales")) assert.ok(names.includes(used), used);
  assert.ok(payload.ensureLedgers.every((l) => l.parent));
});

test("a configured ledger name overrides the default", () => {
  const custom = resolveLedgerNames({ sales: " Domestic Sales " });
  assert.strictEqual(custom.sales, "Domestic Sales");
  assert.strictEqual(custom.round_off, "Round Off");
});

test("receipt: bank debit, customer credit as the party line", () => {
  const { payload, problems } = buildReceiptPayload({
    companyId: 67,
    tx: { id: 564, amount: 234, payment_date_time: new Date("2026-10-16T18:30:00.000Z"), voucher_number: "CR1/02/2026-2027", remark: "" },
    partyName: "Acme Traders",
    paymentLedger: "HDFC Bank",
  });
  assert.strictEqual(problems, undefined);
  assert.strictEqual(payload.vchType, "Receipt");
  assert.strictEqual(payload.date, "20261017");
  assert.deepStrictEqual(payload.entries, [
    { ledgerName: "Acme Traders", isDebit: false, isPartyLedger: true, amount: 234 },
    { ledgerName: "HDFC Bank", isDebit: true, amount: 234 },
  ]);
});

test("receipt problems: unmapped payment mode, zero amount", () => {
  const tx = { id: 1, amount: 100, payment_date_time: "2026-10-16" };
  assert.ok(buildReceiptPayload({ companyId: 1, tx, partyName: "A", paymentLedger: "" }).problems);
  assert.ok(buildReceiptPayload({ companyId: 1, tx: { ...tx, amount: 0 }, partyName: "A", paymentLedger: "Cash" }).problems);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
