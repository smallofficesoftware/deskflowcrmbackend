// Many system_document_templates rows have text fields with content: "" —
// by design, since the real generator (accountTransactionGenerate.js etc.)
// fills them per-transaction at PDF-generation time, and the pdfme Designer
// never runs that generate-time logic. Fine for the tenant-side Document
// Designer (a company sees the same empty boxes there too), but made it
// hard for an admin building/reviewing a system template in the new admin
// panel to tell which empty box is which just by looking at the canvas
// (see admin panel System Document Template Library work). This backfills
// readable placeholder text into every currently-EMPTY, non-readOnly text
// field across every existing row — using the REAL label text the
// generators hardcode where one exists (e.g. "Transaction ID:", "Payment
// Mode:"), and a bracketed "[Field Name]" placeholder for value fields with
// no fixed real text of their own. Falls back to a humanized bracketed
// version of the field's own name for anything not in the explicit map
// below (so a future field with no placeholder here still gets something
// readable instead of staying blank).
//
// Idempotent by construction: only ever touches fields whose content is
// already empty — running this again after fields have real placeholder
// text is a no-op.

const PLACEHOLDER_BY_FIELD_NAME = {
  // Cart doc types (quotation/salesOrder/.../proformaInvoice) — genuinely
  // free-text, company-customized fields with no fixed default anywhere.
  bankDetailsText: "[Bank Details]",
  grandTotalWordsText: "Grand Total In Words : [Amount In Words]",
  remarksText: "[Remarks]",
  noteText: "[Note]",

  // accountStatement / employeeAccountStatement header + contact block.
  companyName: "COMPANY NAME",
  companyAddress: "[Company Address]",
  companyContactLine: "Mo. 0000000000 | company@example.com",
  companyGSTIN: "GSTIN: 00XXXXX0000X0X0",
  statementDateRange: "From 01-01-2026 to 31-01-2026",
  contactName: "[Contact Name]",
  contactCompany: "[Contact Company Name]",
  contactMobile: "Mo. 0000000000",
  contactEmail: "[Contact Email]",
  contactAddress: "[Contact Address]",
  contactShippingAddress: "[Contact Shipping Address]",
  contactGSTIN: "GSTIN: 00XXXXX0000X0X0",
  employeeName: "[Employee Name]",
  employeeMobile: "Mo. 0000000000",
  employeeEmail: "[Employee Email]",

  // accountTransaction / employeeAccountTransaction receipt — label text
  // matches accountTransactionGenerate.js / employeeAccountTransactionGenerate.js
  // exactly (rawInputs.*Label literal strings).
  companyContact: "Mo. 0000000000 , Email: company@example.com",
  contactNameLabel: "Contact Name:",
  contactNameValue: "[Contact Name]",
  contactMobileLabel: "Mobile No:",
  contactMobileValue: "[Mobile Number]",
  contactEmailLabel: "Email:",
  contactEmailValue: "[Email]",
  contactCompanyLabel: "Company Name:",
  contactCompanyValue: "[Company Name]",
  contactCountryLabel: "Country:",
  contactCountryValue: "[Country]",
  contactStateLabel: "State:",
  contactStateValue: "[State]",
  contactCityLabel: "City:",
  contactCityValue: "[City]",
  contactPincodeLabel: "Pincode:",
  contactPincodeValue: "[Pincode]",
  contactAddressLabel: "Address:",
  contactAddressValue: "[Address]",
  txnIdLabel: "Transaction ID:",
  txnIdValue: "# 0000",
  entityLabel: "Customer Name:",
  entityValue: "[Customer Name]",
  paymentDateLabel: "Payment Date & Time:",
  paymentDateValue: "[Payment Date]",
  paymentModeLabel: "Payment Mode:",
  paymentModeValue: "[Payment Mode]",
  remarkText: "[Remark]",
  employeeNameLabel: "Employee Name:",
  employeeNameValue: "[Employee Name]",
  employeeMobileLabel: "Mobile No:",
  employeeMobileValue: "[Mobile Number]",
  employeeEmailLabel: "Email:",
  employeeEmailValue: "[Employee Email]",

  // shippingLabel
  termsText: "[Terms]",
};

function humanize(name) {
  const withSpaces = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
  return `[${withSpaces}]`;
}

function fillEmptyContent(fields) {
  let changed = 0;
  for (const field of fields || []) {
    if (field.type !== "text" || field.readOnly) continue;
    if (field.content && String(field.content).trim() !== "") continue;
    field.content = PLACEHOLDER_BY_FIELD_NAME[field.name] || humanize(field.name);
    changed++;
  }
  return changed;
}

export const up = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT id, template_json FROM system_document_templates WHERE isDelete = 0",
  );

  for (const row of rows) {
    let templateJson;
    try {
      templateJson = JSON.parse(row.template_json);
    } catch {
      continue; // not valid JSON — leave untouched rather than crash the migration
    }

    let changed = 0;
    changed += fillEmptyContent(templateJson.basePdf?.staticSchema);
    for (const page of templateJson.schemas || []) {
      changed += fillEmptyContent(page);
    }
    if (!changed) continue;

    await queryInterface.sequelize.query(
      "UPDATE system_document_templates SET template_json = ? WHERE id = ?",
      { replacements: [JSON.stringify(templateJson), row.id] },
    );
  }
};

// Not reversible — the "down" direction would need to know which fields
// were genuinely empty before `up` ran, which isn't recorded anywhere.
export const down = async () => {};
