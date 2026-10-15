// Miracle bank/cash receipt and payment vouchers (BP/BR/CP/CR) have a voucher
// number that Deskflow has no column for on account_transactions. It is kept
// at the start of the remark so it shows on the Deskflow receipt, in the same
// "<p>Label: value<br>..." shape invoice remarks use, and is read back from
// there so a later edit sync to Miracle sends the same number instead of the
// Deskflow row id (ticket #2534).
const REMARK_MAX_LENGTH = 255; // account_transactions.remark is varchar(255)
const RECEIPT_NO_PATTERN = /^<p>Receipt No\.: ([^<]*)<br>([\s\S]*)<\/p>$/;

const escapeNarr = (narr) => String(narr ?? "");

// Remark for a voucher synced from Miracle. No voucher number -> the plain
// narration, exactly as before. The narration is cut so the whole remark
// still fits the column.
export const buildReceiptRemark = (voucherNo, narr) => {
  const number = String(voucherNo ?? "").trim();
  const text = escapeNarr(narr);
  if (!number) return text;

  const head = `<p>Receipt No.: ${number}<br>`;
  const tail = "</p>";
  const room = Math.max(0, REMARK_MAX_LENGTH - head.length - tail.length);
  return `${head}${text.slice(0, room)}${tail}`;
};

// { voucherNo, narr } from a remark written by buildReceiptRemark; a remark
// without the receipt line (every Deskflow-made transaction) comes back as
// { voucherNo: "", narr: remark }.
export const parseReceiptRemark = (remark) => {
  const text = escapeNarr(remark);
  const match = RECEIPT_NO_PATTERN.exec(text);
  if (!match) return { voucherNo: "", narr: text };
  return { voucherNo: match[1].trim(), narr: match[2] };
};
