import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import { applyConditionalVisibility, fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { buildAccountStatementTemplate, STATEMENT_COLUMNS } from "./accountStatementTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text, table: plugins.table };

// Same toNumber/fmtNum/formatBalanceCell logic as
// allAccountTransactionOfContactV1.ejs — re-parses the already-formatted
// (comma-grouped) balance string back to a number to classify Cr/Dr, same
// round-trip the EJS itself does (rowsWithBalance already stores balance as
// a toLocaleString string, not the raw number).
function toNumber(v) {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[, ]+/g, ""));
  return Number.isNaN(n) ? 0 : n;
}
function fmtNum(n) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function formatBalance(v) {
  const num = toNumber(v);
  const abs = fmtNum(Math.abs(num));
  return num < 0 ? `${abs} (Dr)` : `${abs} (Cr)`;
}

// companyData/contactData/rowsWithBalance/totalCredit/totalDebit/
// lastRowBalance/fromDate/toDate/settingDetails: same shapes
// allAccountTransactionOfContactPDF (accountTransactionServices.js) already
// builds for the EJS path.
//
// entityLines: the employee-statement variant (allAccountTransactionofEmployeeV1.ejs,
// wired from employeeAccountTransactionService.js's allAccountTransactionOfEmployeePDF)
// is the SAME layout with a smaller, differently-keyed right-side block
// (employeeData.username/recovery_mobile/recovery_email vs contactData's 7
// fields) — caller pre-builds that block's lines and passes them here rather
// than a second near-duplicate module. Defaults to the original contact
// behavior so allAccountTransactionOfContactPDF's call site needs no changes.
export async function generateAccountStatementPdf({
  companyData,
  contactData,
  rowsWithBalance,
  totalCredit,
  totalDebit,
  lastRowBalance,
  fromDate,
  toDate,
  settingDetails,
  entityLines = null,
  templateOverride = null,
}) {
  const showCompanyHeader = !!settingDetails?.headerImage;

  const leftLines = [];
  if (showCompanyHeader) {
    leftLines.push(String(companyData?.company_name || "").toUpperCase());
    if (companyData?.address) leftLines.push(companyData.address);
    const contactLine = [
      companyData?.company_contact ? `Mo. ${companyData.company_contact}` : null,
      companyData?.company_email || null,
    ]
      .filter(Boolean)
      .join(" | ");
    if (contactLine) leftLines.push(contactLine);
    if (companyData?.gst_number) leftLines.push(`GSTIN: ${companyData.gst_number}`);
  }

  const defaultEntityLines = [];
  if (contactData) {
    if (contactData.person_name) defaultEntityLines.push(contactData.person_name);
    if (contactData.company_name) defaultEntityLines.push(contactData.company_name);
    if (contactData.mobile_number) defaultEntityLines.push(`Mo. ${contactData.mobile_number}`);
    if (contactData.email_id) defaultEntityLines.push(contactData.email_id);
    if (contactData.address) defaultEntityLines.push(contactData.address);
    if (contactData.shipping_address) defaultEntityLines.push(contactData.shipping_address);
    if (contactData.gst_number) defaultEntityLines.push(`GSTIN: ${contactData.gst_number}`);
  }

  const rightLines = [
    "Account Statement",
    `From ${fromDate || ""} to ${toDate || ""}`,
    ...(entityLines ?? defaultEntityLines),
  ];

  const rows = (rowsWithBalance || []).map((tx, idx) =>
    STATEMENT_COLUMNS.map((c) => {
      switch (c.key) {
        case "no":
          return `#${tx.id}`;
        case "date":
          return tx.payment_date ?? "";
        case "remark":
          return tx.remark ?? "";
        case "credit":
          return tx.credit || "-";
        case "debit":
          return tx.debit || "-";
        case "balance":
          return formatBalance(tx.balance);
        default:
          return "";
      }
    }),
  );

  const hasRows = rows.length > 0;

  // A company's own customized template (built/edited in Document Designer)
  // has its own fixed field positions already baked in — skip the dynamic
  // line-count sizing entirely and bind the same rawInputs into it instead.
  const template = templateOverride || buildAccountStatementTemplate({
    leftLineCount: leftLines.length,
    rightLineCount: rightLines.length,
    hasRows,
  });

  if (hasRows) {
    rows.push(["Total", "", "", totalCredit || "0", totalDebit || "0", formatBalance(lastRowBalance)]);
  } else {
    // pdfme's dynamic-table pagination (@pdfme/common's placeUnitsOnPages)
    // throws on a genuinely empty `content` array (confirmed — TypeError
    // reading 'push' on an undefined page bucket) — one blank row keeps the
    // header visible and avoids the crash; noDataText (below) carries the
    // actual "No transactions found" message.
    rows.push(["", "", "", "", "", ""]);
  }

  const rawInputs = {
    leftHeaderBlock: leftLines.join("\n"),
    rightHeaderBlock: rightLines.join("\n"),
    hasRows: hasRows ? "1" : "",
    statementTable: JSON.stringify(rows),
    noDataText: "No transactions found",
  };

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

  const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
