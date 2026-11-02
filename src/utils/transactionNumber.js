// How an account transaction is numbered in PDFs and exports:
//   voucher number + payment date before 01-04-2027 -> "CR/01/2026-2027 (#256)"
//   voucher number + payment date from 01-04-2027    -> "CR/01/2027-2028"
//   no voucher number (entry made before the series) -> "#256"
// Keep in step with frontend src/utils/transactionNumber.ts.

const ID_HIDDEN_FROM = 20270401;

const toYmdNumber = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.getFullYear() * 10000 + (value.getMonth() + 1) * 100 + value.getDate();
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
  match = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (match) return Number(match[3]) * 10000 + Number(match[2]) * 100 + Number(match[1]);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear() * 10000 + (parsed.getMonth() + 1) * 100 + parsed.getDate();
};

export const formatTransactionNumber = (voucherNumber, id, paymentDate) => {
  const voucher = String(voucherNumber ?? "").trim();
  if (!voucher) return `#${id ?? ""}`;
  const date = toYmdNumber(paymentDate);
  return date !== null && date >= ID_HIDDEN_FROM ? voucher : `${voucher} (#${id ?? ""})`;
};
