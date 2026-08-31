import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import { applyTokenSubstitution, fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { buildEmployeeAccountTransactionTemplate } from "./employeeAccountTransactionTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text };

// Team's OWN generate function — deliberately NOT reusing
// accountTransactionGenerate.js's generateAccountTransactionPdf, even though
// the pipeline shape is identical, because that function's rawInputs are
// hardcoded to the Contact template's field names (contactSectionTitle,
// CONTACT_ROW_FIELDS mapping onto contactNameLabel/contactMobileLabel/.../
// contactAddressLabel — 9 rows) — an employee record has only
// name/mobile/email, and employeeAccountTransactionTemplate.js uses its own
// field names (employeeSectionTitle, employeeNameLabel/Value, etc., 3 rows)
// that wouldn't bind onto a template built from the Contact field set.
// Reuses only the genuinely generic pieces: orderInputMapper.js's
// data-resolution helpers and @pdfme/generator's generate() itself.
//
// companyDetails/accountTransactions/payment_type_name/settingDetails/
// currencySymbol/formattedAmount/formattedDate: same shapes
// employeePDFaccountv1 (employeeAccountTransactionService.js) already
// builds. employeeDetails: the raw login/team row (username/
// recovery_mobile/recovery_email).
export async function generateEmployeeAccountTransactionPdf({
  companyDetails,
  accountTransactions,
  employeeDetails,
  payment_type_name,
  settingDetails,
  currencySymbol,
  formattedAmount,
  formattedDate,
  remarkColor = "#1b1bb3",
  templateOverride = null,
}) {
  const isCredit = accountTransactions?.type == 1;
  const showHeader = !!settingDetails?.headerImage;
  const showEmployee = !!settingDetails?.employeeDetails;

  const companyContact = [
    companyDetails?.company_contact ? `Mo. ${companyDetails.company_contact}` : null,
    companyDetails?.company_email ? `Email: ${companyDetails.company_email}` : null,
  ]
    .filter(Boolean)
    .join(" , ");

  const remark = accountTransactions?.remark || "";

  const template = templateOverride || buildEmployeeAccountTransactionTemplate();

  const amountField = template.schemas[0].find((f) => f.name === "amountLine");
  if (amountField) amountField.fontColor = isCredit ? "#008000" : "#cc0000";
  const remarkField = template.schemas[0].find((f) => f.name === "remarkText");
  if (remarkField) remarkField.fontColor = remarkColor;

  const rawInputs = {
    companyName: showHeader ? (companyDetails?.company_name ?? "") : "",
    companyAddress: showHeader ? (companyDetails?.address || "") : "",
    companyContact: showHeader ? companyContact : "",
    companyGSTIN: showHeader && companyDetails?.gst_number ? `GSTIN: ${companyDetails.gst_number}` : "",

    showHeader: showHeader ? "1" : "",
    showEmployee: showEmployee ? "1" : "",
    showRemark: remark ? "1" : "",

    employeeSectionTitle: "Employee Details",
    txnSectionTitle: "Account Transaction",

    employeeNameLabel: "Employee Name:",
    employeeNameValue: employeeDetails?.username || "-",
    employeeMobileLabel: "Mobile No:",
    employeeMobileValue: employeeDetails?.recovery_mobile || "",
    employeeEmailLabel: "Email:",
    employeeEmailValue: employeeDetails?.recovery_email || "",

    txnIdLabel: "Transaction ID:",
    txnIdValue: `# ${accountTransactions?.id ?? ""}`,

    amountLine: `${currencySymbol || "₹"} ${formattedAmount ?? ""} ${isCredit ? "(Credit)" : "(Debit)"}`,

    paymentDateLabel: "Payment Date & Time:",
    paymentDateValue: formattedDate || "-",
    paymentModeLabel: "Payment Mode:",
    paymentModeValue: payment_type_name || "-",

    remarkText: remark,
    thankYouText: "Thank You!",
  };

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  resolvedInputs = applyTokenSubstitution(template, resolvedInputs);

  const pdfBytes = await generate({ template, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
