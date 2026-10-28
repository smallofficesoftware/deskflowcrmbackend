// Turns a CRM sales invoice (carts type 3) or a customer receipt (account_transactions
// type 1) into the push_voucher payload the Tally connector understands
// (tally-connector/src/tally/types.ts TallyVoucherInput). Pure functions - no DB, no
// network - so the accounting rules can be unit tested on their own; the service layer
// (tallyVoucherService.js) loads the data and hands it in.
//
// Shapes were proven against a live Tally Prime on 28-10-2026 (plans/2026-10-08-marketplace-
// tally-plan.txt): an item invoice is stock lines + ledger lines in "Invoice Voucher View";
// a receipt is a plain two-line ledger voucher.

export const REMOTE_ID_PREFIX = "deskflow";

/** Where each ledger role is created in Tally when it does not exist yet. Existing ledgers are
 *  never touched (the connector only creates missing ones), so these are only for first use. */
export const LEDGER_ROLES = {
  party: { parent: "Sundry Debtors" },
  sales: { parent: "Sales Accounts", defaultName: "Sales" },
  round_off: { parent: "Indirect Expenses", defaultName: "Round Off" },
  other_charges: { parent: "Indirect Incomes", defaultName: "Freight and Packing" },
  discount: { parent: "Indirect Expenses", defaultName: "Discount Allowed" },
  tcs: { parent: "Duties & Taxes", defaultName: "TCS Payable" },
  tax: { parent: "Duties & Taxes" },
  cash: { parent: "Cash-in-Hand" },
  bank: { parent: "Bank Accounts" },
};

const round2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
const num = (n) => Number(n) || 0;

/** YYYY-MM-DD (a DATEONLY string) or a Date -> Tally's YYYYMMDD, in India time for a Date. */
export const toTallyDate = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10).replace(/-/g, "");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}${parts.month}${parts.day}`;
};

export const invoiceRemoteId = (companyId, cartId) => `${REMOTE_ID_PREFIX}-${companyId}-invoice-${cartId}`;
export const receiptRemoteId = (companyId, txId) => `${REMOTE_ID_PREFIX}-${companyId}-receipt-${txId}`;

/** Ledger names to use for each role: the company's setting if set, else the role's default. */
export const resolveLedgerNames = (configured = {}) => {
  const out = {};
  for (const [role, def] of Object.entries(LEDGER_ROLES)) {
    const set = typeof configured?.[role] === "string" ? configured[role].trim() : "";
    out[role] = set || def.defaultName || null;
  }
  return out;
};

/**
 * @param {object} p
 * @param {number} p.companyId
 * @param {object} p.cart            carts row (type 3)
 * @param {object[]} p.items         cart_items rows
 * @param {string} p.partyName       Tally ledger for the customer
 * @param {object} p.ledgers         resolveLedgerNames() output
 * @param {boolean} p.isSameState    company state === customer state (CGST+SGST) else IGST
 * @param {(item:object)=>string} p.stockItemName  Tally stock item name for a line
 * @param {(rate:number, slot:"cgst"|"sgst"|"igst")=>string} p.gstLedgerName  Output GST ledger
 * @returns {{payload?: object, problems?: string[]}}
 */
export const buildSalesInvoicePayload = ({ companyId, cart, items, partyName, ledgers, isSameState, stockItemName, gstLedgerName }) => {
  const problems = [];
  const date = toTallyDate(cart.cart_date);
  if (!date) problems.push("The invoice has no valid date.");
  if (!partyName) problems.push("The customer has no name to use as a Tally ledger.");
  if (!items?.length) problems.push("The invoice has no items.");
  if (problems.length) return { problems };

  const inventoryEntries = [];
  const weightByRate = new Map(); // gst rate -> taxable value x rate, to split the cart's GST
  for (const item of items) {
    const qty = num(item.item_qty);
    const amount = round2(item.item_total);
    const name = stockItemName(item);
    if (!name) problems.push(`Line "${item.item_product_name}" has no Tally stock item name.`);
    if (qty <= 0) problems.push(`Line "${item.item_product_name}" has no quantity.`);
    inventoryEntries.push({
      stockItemName: name,
      qty,
      unit: String(item.item_unit_name || "Nos").trim() || "Nos",
      rate: qty > 0 ? round2(amount / qty) : 0,
      amount,
      ledgerName: ledgers.sales,
    });
    const rate = num(item.item_gst);
    if (rate > 0) weightByRate.set(rate, round2((weightByRate.get(rate) || 0) + amount * rate));
  }
  if (problems.length) return { problems };

  const itemsTotal = round2(inventoryEntries.reduce((s, l) => s + l.amount, 0));
  const charges = round2(num(cart.packing_forwarding_charge) + num(cart.transport_charge));
  const gstTotal = round2(cart.gst_amt);
  const tcs = round2(cart.tcs_amt);
  const roundOff = round2(cart.round_off);
  const grandTotal = round2(cart.grand_total);

  // Credits to the books (income side) as [ledgerName, amount]; debits come after the party line.
  const credits = [];
  const debits = [];
  const ensure = new Map(); // ledger name -> parent group, in first-use order
  const use = (name, parent) => {
    if (name && !ensure.has(name)) ensure.set(name, parent);
    return name;
  };
  use(partyName, LEDGER_ROLES.party.parent);
  use(ledgers.sales, LEDGER_ROLES.sales.parent);

  // GST: the cart's own gst_amt is authoritative; split it across the rates in proportion to
  // each rate's taxable value x rate, then halve into CGST/SGST (same state) or IGST.
  if (gstTotal > 0) {
    const rates = [...weightByRate.keys()].sort((a, b) => a - b);
    if (!rates.length) return { problems: ["The invoice has GST but none of its lines has a GST rate."] };
    const weightSum = rates.reduce((s, r) => s + weightByRate.get(r), 0);
    let left = gstTotal;
    rates.forEach((rate, i) => {
      const part = i === rates.length - 1 ? round2(left) : round2((gstTotal * weightByRate.get(rate)) / weightSum);
      left = round2(left - part);
      if (part <= 0) return;
      if (isSameState) {
        const cgst = round2(part / 2);
        credits.push([use(gstLedgerName(rate, "cgst"), LEDGER_ROLES.tax.parent), cgst]);
        credits.push([use(gstLedgerName(rate, "sgst"), LEDGER_ROLES.tax.parent), round2(part - cgst)]);
      } else {
        credits.push([use(gstLedgerName(rate, "igst"), LEDGER_ROLES.tax.parent), part]);
      }
    });
  }
  if (charges > 0) credits.push([use(ledgers.other_charges, LEDGER_ROLES.other_charges.parent), charges]);
  if (tcs > 0) credits.push([use(ledgers.tcs, LEDGER_ROLES.tcs.parent), tcs]);

  // Anything between the book total and the document's grand total is round-off (small) or a
  // discount (larger, negative); a positive gap we cannot explain stops the send.
  const booked = round2(itemsTotal + credits.reduce((s, [, a]) => s + a, 0) + roundOff);
  let gap = round2(grandTotal - booked);
  if (roundOff > 0) credits.push([use(ledgers.round_off, LEDGER_ROLES.round_off.parent), roundOff]);
  else if (roundOff < 0) debits.push([use(ledgers.round_off, LEDGER_ROLES.round_off.parent), Math.abs(roundOff)]);
  if (Math.abs(gap) > 0.005) {
    if (Math.abs(gap) <= 1) {
      // Rounding noise on top of the stored round-off - fold into the round-off ledger.
      (gap > 0 ? credits : debits).push([use(ledgers.round_off, LEDGER_ROLES.round_off.parent), Math.abs(gap)]);
    } else if (gap < 0) {
      debits.push([use(ledgers.discount, LEDGER_ROLES.discount.parent), Math.abs(gap)]);
    } else {
      return { problems: [`The invoice total ${grandTotal} is ${gap} more than its items, tax and charges add up to. Fix the invoice, then send again.`] };
    }
    gap = 0;
  }

  // One line per ledger: the same ledger can land on both sides (e.g. a stored round-off plus a
  // small fold-in), so net them rather than send Tally two lines for one ledger.
  const net = new Map();
  for (const [ledgerName, amount] of credits) net.set(ledgerName, round2((net.get(ledgerName) || 0) + amount));
  for (const [ledgerName, amount] of debits) net.set(ledgerName, round2((net.get(ledgerName) || 0) - amount));
  const entries = [
    { ledgerName: partyName, isDebit: true, isPartyLedger: true, amount: grandTotal },
    ...[...net]
      .filter(([, amount]) => Math.abs(amount) > 0.005)
      .map(([ledgerName, amount]) => ({ ledgerName, isDebit: amount < 0, amount: Math.abs(amount) })),
  ];

  // Final safety net: Tally rejects an unbalanced voucher, so never send one.
  const debitSum = round2(entries.filter((e) => e.isDebit).reduce((s, e) => s + e.amount, 0));
  const creditSum = round2(itemsTotal + entries.filter((e) => !e.isDebit).reduce((s, e) => s + e.amount, 0));
  if (Math.abs(debitSum - creditSum) > 0.005) {
    return { problems: [`The voucher does not balance (debit ${debitSum}, credit ${creditSum}).`] };
  }

  return {
    payload: {
      vchType: "Sales",
      remoteId: invoiceRemoteId(companyId, cart.id),
      voucherNumber: cart.cart_number || undefined,
      date,
      partyLedgerName: partyName,
      narration: [`Deskflow ${cart.cart_number || cart.id}`, cart.cart_remark].filter(Boolean).join(" - ").slice(0, 240),
      ensureLedgers: [...ensure].map(([name, parent]) => ({ name, parent })),
      inventoryEntries,
      entries,
    },
  };
};

/**
 * A customer receipt: money in. Debit the cash/bank ledger, credit the customer.
 * @returns {{payload?: object, problems?: string[]}}
 */
export const buildReceiptPayload = ({ companyId, tx, partyName, paymentLedger, paymentLedgerParent }) => {
  const problems = [];
  const date = toTallyDate(tx.payment_date_time);
  const amount = round2(tx.amount);
  if (!date) problems.push("The receipt has no valid date.");
  if (!partyName) problems.push("The customer has no name to use as a Tally ledger.");
  if (!paymentLedger) problems.push("This payment mode is not mapped to a Tally cash/bank ledger.");
  if (amount <= 0) problems.push("The receipt amount is zero.");
  if (problems.length) return { problems };

  return {
    payload: {
      vchType: "Receipt",
      remoteId: receiptRemoteId(companyId, tx.id),
      voucherNumber: tx.voucher_number || undefined,
      date,
      partyLedgerName: partyName,
      narration: [`Deskflow ${tx.voucher_number || tx.id}`, tx.remark].filter(Boolean).join(" - ").slice(0, 240),
      ensureLedgers: [
        { name: partyName, parent: LEDGER_ROLES.party.parent },
        { name: paymentLedger, parent: paymentLedgerParent || LEDGER_ROLES.bank.parent },
      ],
      entries: [
        { ledgerName: partyName, isDebit: false, isPartyLedger: true, amount },
        { ledgerName: paymentLedger, isDebit: true, amount },
      ],
    },
  };
};
