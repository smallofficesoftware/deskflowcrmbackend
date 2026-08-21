import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import { fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { buildAccountTransactionTemplate } from "./accountTransactionTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text };

function joinPairs(pairs) {
  const rows = pairs.filter((r) => r.value !== null && r.value !== undefined);
  return {
    labels: rows.map((r) => r.label).join("\n"),
    values: rows.map((r) => r.value).join("\n"),
    count: rows.length,
  };
}

// companyDetails/accountTransactions/contactDetails/payment_type_name/settingDetails:
// same raw shapes accountPDFv1 (accountTransactionServices.js) already builds
// for the EJS path. formattedAmount/formattedDate: pre-formatted strings
// using that same file's own AccountTransactionformatNumber/formatDateAndTime
// helpers — computed at the call site, not duplicated here (same reasoning
// as generateQuotationPdf's numberTowords param).
//
// entityLabel/entitySectionTitle/entityShowKey/entityPairs/remarkColor: the
// employee-statement receipt (employeeAccountPDFv1.ejs, wired from
// employeeAccountTransactionService.js) is the SAME layout with different
// section wording ("Employee Details" not "Contact Details", "Employee
// Name:" not "Customer Name:") and a smaller, differently-keyed field set
// (employeeDetails.username/recover_mobile/recovery_email vs contactDetails'
// 8 fields), plus no blue remark color — parameterized here rather than a
// second near-duplicate template+generate module. Defaults match the
// original contact-receipt behavior exactly, so accountPDFv1's existing call
// site needs no changes.
export async function generateAccountTransactionPdf({
  companyDetails,
  accountTransactions,
  contactDetails,
  payment_type_name,
  settingDetails,
  currencySymbol,
  formattedAmount,
  formattedDate,
  entityLabel = "Customer Name:",
  entitySectionTitle = "Contact Details",
  entityShowKey = "contactDetails",
  entityPairs = null,
  entityName = null,
  remarkColor = "#1b1bb3",
  templateOverride = null,
}) {
  const isCredit = accountTransactions?.type == 1;
  const showHeader = !!settingDetails?.headerImage;
  const showContact = !!settingDetails?.[entityShowKey];
  const resolvedEntityName = entityName ?? (contactDetails?.person_name || "-");

  // Kept as 3 separate lines rather than one joined "Mo. X , Email: Y ,
  // GSTIN: Z" string (closer to the EJS's single wrapped line visually, but
  // that full string reliably wraps at 80mm/7.5pt anyway — line-count-based
  // height budgeting (below) can't predict wrap points, so each piece gets
  // its own line instead of risking an unbudgeted extra wrapped line).
  const contactLine = [
    companyDetails?.company_contact ? `Mo. ${companyDetails.company_contact}` : null,
    companyDetails?.company_email ? `Email: ${companyDetails.company_email}` : null,
  ]
    .filter(Boolean)
    .join(" , ");
  const headerLine2 = [
    companyDetails?.address,
    contactLine || null,
    companyDetails?.gst_number ? `GSTIN: ${companyDetails.gst_number}` : null,
  ].filter(Boolean);

  const defaultContactPairs = [
    { label: "Contact Name:", value: contactDetails?.person_name || "-" },
    { label: "Mobile No:", value: contactDetails?.mobile_number || "-" },
    contactDetails?.company_name ? { label: "Company Name:", value: contactDetails.company_name } : null,
    contactDetails?.country_name ? { label: "Country:", value: contactDetails.country_name } : null,
    contactDetails?.state_name ? { label: "State:", value: contactDetails.state_name } : null,
    contactDetails?.city_name ? { label: "City:", value: contactDetails.city_name } : null,
    contactDetails?.pincode ? { label: "Pincode:", value: contactDetails.pincode } : null,
    contactDetails?.address ? { label: "Address:", value: contactDetails.address } : null,
  ].filter(Boolean);

  const contactPairs = showContact ? entityPairs || defaultContactPairs : [];

  const contact = joinPairs(contactPairs);
  const txnTop = joinPairs([
    { label: "Transaction ID:", value: `# ${accountTransactions?.id ?? ""}` },
    { label: entityLabel, value: resolvedEntityName },
  ]);
  const txnBottom = joinPairs([
    { label: "Payment Date & Time:", value: formattedDate || "-" },
    { label: "Payment Mode:", value: payment_type_name || "-" },
  ]);

  const remark = accountTransactions?.remark || "";
  const remarkLineCount = remark ? remark.split(/\r\n|\n/).length : 0;

  // A company's own customized template (built/edited in Document Designer)
  // has its own fixed field positions already baked in — skip the dynamic
  // line-count sizing entirely and bind the same rawInputs into it instead.
  const template = templateOverride || buildAccountTransactionTemplate({
    headerLineCount: showHeader ? 1 + headerLine2.length : 0,
    contactRowCount: contact.count,
    remarkLineCount,
  });

  const amountField = template.schemas[0].find((f) => f.name === "amountLine");
  if (amountField) amountField.fontColor = isCredit ? "#008000" : "#cc0000";
  const remarkField = template.schemas[0].find((f) => f.name === "remarkText");
  if (remarkField) remarkField.fontColor = remarkColor;

  const rawInputs = {
    companyName: companyDetails?.company_name ?? "",
    companyHeaderLine2: headerLine2.join("\n"),

    contactSectionTitle: entitySectionTitle,
    contactLabels: contact.labels,
    contactValues: contact.values,

    txnSectionTitle: "Account Transaction",
    txnLabelsTop: txnTop.labels,
    txnValuesTop: txnTop.values,
    amountLine: `${currencySymbol || "₹"} ${formattedAmount ?? ""} ${isCredit ? "(Credit)" : "(Debit)"}`,
    txnLabelsBottom: txnBottom.labels,
    txnValuesBottom: txnBottom.values,

    remarkText: remark,
    thankYouText: "Thank You!",
  };

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);

  const pdfBytes = await generate({ template, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
