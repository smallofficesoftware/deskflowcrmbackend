import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import { fillMissingInputsFromContent, resolveDataSources } from "./orderInputMapper.js";
import { buildAccountTransactionTemplate } from "./accountTransactionTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text };

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
// (employeeDetails.username/recovery_mobile/recovery_email vs contactDetails'
// 9 fields) — entityPairs lets the caller supply exactly which named rows
// to fill (each {label,value} maps onto the field pair below matching its
// position: 1st->name, 2nd->mobile, 3rd->email, ...). Defaults match the
// original contact-receipt behavior exactly, so accountPDFv1's existing call
// site needs no changes.
const CONTACT_ROW_FIELDS = [
  ["contactNameLabel", "contactNameValue"],
  ["contactMobileLabel", "contactMobileValue"],
  ["contactEmailLabel", "contactEmailValue"],
  ["contactCompanyLabel", "contactCompanyValue"],
  ["contactCountryLabel", "contactCountryValue"],
  ["contactStateLabel", "contactStateValue"],
  ["contactCityLabel", "contactCityValue"],
  ["contactPincodeLabel", "contactPincodeValue"],
  ["contactAddressLabel", "contactAddressValue"],
];

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

  const contactLine = [
    companyDetails?.company_contact ? `Mo. ${companyDetails.company_contact}` : null,
    companyDetails?.company_email ? `Email: ${companyDetails.company_email}` : null,
  ]
    .filter(Boolean)
    .join(" , ");

  const defaultContactPairs = [
    { label: "Contact Name:", value: contactDetails?.person_name || "-" },
    { label: "Mobile No:", value: contactDetails?.mobile_number || "-" },
    contactDetails?.email_id ? { label: "Email:", value: contactDetails.email_id } : null,
    contactDetails?.company_name ? { label: "Company Name:", value: contactDetails.company_name } : null,
    contactDetails?.country_name ? { label: "Country:", value: contactDetails.country_name } : null,
    contactDetails?.state_name ? { label: "State:", value: contactDetails.state_name } : null,
    contactDetails?.city_name ? { label: "City:", value: contactDetails.city_name } : null,
    contactDetails?.pincode ? { label: "Pincode:", value: contactDetails.pincode } : null,
    contactDetails?.address ? { label: "Address:", value: contactDetails.address } : null,
  ].filter(Boolean);

  const contactPairs = showContact ? entityPairs || defaultContactPairs : [];

  const remark = accountTransactions?.remark || "";

  // A company's own customized template (built/edited in Document Designer)
  // has its own fixed field positions already baked in — bind the same
  // rawInputs into it directly instead of building the default layout.
  const template = templateOverride || buildAccountTransactionTemplate();

  const amountField = template.schemas[0].find((f) => f.name === "amountLine");
  if (amountField) amountField.fontColor = isCredit ? "#008000" : "#cc0000";
  const remarkField = template.schemas[0].find((f) => f.name === "remarkText");
  if (remarkField) remarkField.fontColor = remarkColor;

  const rawInputs = {
    companyName: showHeader ? (companyDetails?.company_name ?? "") : "",
    companyAddress: showHeader ? (companyDetails?.address || "") : "",
    companyContact: showHeader ? contactLine : "",
    companyGSTIN: showHeader && companyDetails?.gst_number ? `GSTIN: ${companyDetails.gst_number}` : "",

    showHeader: showHeader ? "1" : "",
    showContact: showContact ? "1" : "",
    showRemark: remark ? "1" : "",

    contactSectionTitle: entitySectionTitle,
    txnSectionTitle: "Account Transaction",

    txnIdLabel: "Transaction ID:",
    txnIdValue: `# ${accountTransactions?.id ?? ""}`,
    entityLabel,
    entityValue: resolvedEntityName,

    amountLine: `${currencySymbol || "₹"} ${formattedAmount ?? ""} ${isCredit ? "(Credit)" : "(Debit)"}`,

    paymentDateLabel: "Payment Date & Time:",
    paymentDateValue: formattedDate || "-",
    paymentModeLabel: "Payment Mode:",
    paymentModeValue: payment_type_name || "-",

    remarkText: remark,
    thankYouText: "Thank You!",
  };

  CONTACT_ROW_FIELDS.forEach(([labelField, valueField], idx) => {
    const pair = contactPairs[idx];
    rawInputs[labelField] = pair?.label || "";
    rawInputs[valueField] = pair?.value || "";
  });

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);

  const pdfBytes = await generate({ template, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
