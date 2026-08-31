import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import { applyConditionalVisibility, applyTokenSubstitution, fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
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
// entity: the employee-statement variant (allAccountTransactionofEmployeeV1.ejs,
// wired from employeeAccountTransactionService.js) is the SAME layout with a
// smaller, differently-keyed right-side block (employeeData.username/
// recovery_mobile/recovery_email vs contactData's 7 fields) — caller passes
// this object instead of contactData so it binds onto the same named
// contactName/contactCompany/... fields the default contact path uses.
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
  entity: entityOverride = null,
  templateOverride = null,
}) {
  const showCompanyHeader = !!settingDetails?.headerImage;
  const companyContactLine = [
    companyData?.company_contact ? `Mo. ${companyData.company_contact}` : null,
    companyData?.company_email || null,
  ]
    .filter(Boolean)
    .join(" | ");

  const entity = entityOverride ?? {
    name: contactData?.person_name || "",
    company: contactData?.company_name || "",
    mobile: contactData?.mobile_number ? `Mo. ${contactData.mobile_number}` : "",
    email: contactData?.email_id || "",
    address: contactData?.address || "",
    shippingAddress: contactData?.shipping_address || "",
    gstin: contactData?.gst_number ? `GSTIN: ${contactData.gst_number}` : "",
  };

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
  // has its own fixed field positions already baked in — bind the same
  // rawInputs into it directly instead of building the default layout.
  const template = templateOverride || buildAccountStatementTemplate({ hasRows });

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
    companyName: showCompanyHeader ? String(companyData?.company_name || "").toUpperCase() : "",
    companyAddress: showCompanyHeader ? companyData?.address || "" : "",
    companyContactLine: showCompanyHeader ? companyContactLine : "",
    companyGSTIN: showCompanyHeader && companyData?.gst_number ? `GSTIN: ${companyData.gst_number}` : "",

    statementTitle: "Account Statement",
    statementDateRange: `From ${fromDate || ""} to ${toDate || ""}`,
    contactName: entity.name || "",
    contactCompany: entity.company || "",
    contactMobile: entity.mobile || "",
    contactEmail: entity.email || "",
    contactAddress: entity.address || "",
    contactShippingAddress: entity.shippingAddress || "",
    contactGSTIN: entity.gstin || "",

    hasRows: hasRows ? "1" : "",
    statementTable: JSON.stringify(rows),
    noDataText: "No transactions found",
  };

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  resolvedInputs = applyTokenSubstitution(template, resolvedInputs);
  const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

  const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
