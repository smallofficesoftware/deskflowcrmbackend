import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import { applyConditionalVisibility, applyTokenSubstitution, fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { buildEmployeeAccountStatementTemplate, STATEMENT_COLUMNS } from "./employeeAccountStatementTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text, table: plugins.table };

// Same toNumber/fmtNum/formatBalance round-trip as accountStatementGenerate.js
// (rowsWithBalance already stores balance as a toLocaleString string, not the
// raw number).
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

// Team's OWN generate function — deliberately NOT reusing
// accountStatementGenerate.js's generateAccountStatementPdf, even though the
// pipeline shape is identical, because that function's rawInputs are
// hardcoded to the Contact template's field names (contactName/
// contactCompany/contactAddress/contactShippingAddress/contactGSTIN) — an
// employee record has none of those, and employeeAccountStatementTemplate.js
// uses its own field names (employeeName/employeeMobile/employeeEmail) that
// wouldn't bind onto a template built from the Contact field set. Reuses
// only the genuinely generic pieces: orderInputMapper.js's data-resolution
// helpers and @pdfme/generator's generate() itself.
//
// companyData/rowsWithBalance/totalCredit/totalDebit/lastRowBalance/
// fromDate/toDate/settingDetails: same shapes
// allAccountTransactionOfEmployeePDF (employeeAccountTransactionService.js)
// already builds. employeeData: the raw login/team row (username/
// recovery_mobile/recovery_email).
export async function generateEmployeeAccountStatementPdf({
  companyData,
  employeeData,
  rowsWithBalance,
  totalCredit,
  totalDebit,
  lastRowBalance,
  fromDate,
  toDate,
  settingDetails,
  templateOverride = null,
}) {
  const showCompanyHeader = !!settingDetails?.headerImage;
  const companyContactLine = [
    companyData?.company_contact ? `Mo. ${companyData.company_contact}` : null,
    companyData?.company_email || null,
  ]
    .filter(Boolean)
    .join(" | ");

  const rows = (rowsWithBalance || []).map((tx) =>
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

  const template = templateOverride || buildEmployeeAccountStatementTemplate({ hasRows });

  if (hasRows) {
    rows.push(["Total", "", "", totalCredit || "0", totalDebit || "0", formatBalance(lastRowBalance)]);
  } else {
    // pdfme's dynamic-table pagination throws on a genuinely empty `content`
    // array — one blank row keeps the header visible and avoids the crash;
    // noDataText carries the actual "No transactions found" message.
    rows.push(["", "", "", "", "", ""]);
  }

  const rawInputs = {
    companyName: showCompanyHeader ? String(companyData?.company_name || "").toUpperCase() : "",
    companyAddress: showCompanyHeader ? companyData?.address || "" : "",
    companyContactLine: showCompanyHeader ? companyContactLine : "",
    companyGSTIN: showCompanyHeader && companyData?.gst_number ? `GSTIN: ${companyData.gst_number}` : "",

    statementTitle: "Employee Account Statement",
    statementDateRange: `From ${fromDate || ""} to ${toDate || ""}`,
    employeeName: employeeData?.username || "",
    employeeMobile: employeeData?.recovery_mobile ? `Mo. ${employeeData.recovery_mobile}` : "",
    employeeEmail: employeeData?.recovery_email || "",

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
