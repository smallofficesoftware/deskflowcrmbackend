// Structured as a registry, not one Quotation-specific function — mirrors
// buildTemplate.js's own shape (one buildDocTemplate() shared across all 9
// core cart types + Proforma). Extending to Sales Order/Sales Invoice/etc.
// in later passes is registering the SAME dictionary again, zero new code.
// The 5 non-cart-shaped modules (Stock In/Out, Account/Employee Statement,
// Shipping Label) need their own dictionary definitions when their turn
// comes — this registry is exactly where that plugs in later.
import { Op } from "sequelize";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";

const CART_DOC_DICTIONARY = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "companyMobile", label: "Company Mobile", group: "Company" },
  { key: "companyEmail", label: "Company Email", group: "Company" },

  { key: "buyerCompanyName", label: "Buyer Company Name", group: "Buyer" },
  { key: "buyerContactName", label: "Buyer Contact Name", group: "Buyer" },
  { key: "buyerPhone", label: "Buyer Phone", group: "Buyer" },
  { key: "buyerEmail", label: "Buyer Email", group: "Buyer" },
  { key: "billingAddress", label: "Billing Address", group: "Buyer" },
  { key: "shippingAddress", label: "Shipping Address", group: "Buyer" },
  { key: "buyerGSTIN", label: "Buyer GSTIN", group: "Buyer" },
  { key: "supplyTo", label: "Supply To", group: "Buyer" },

  { key: "orderNumber", label: "Order Number", group: "Order" },
  { key: "orderDateTime", label: "Order Date & Time", group: "Order" },
  { key: "contactPerson", label: "Contact Person", group: "Order" },

  { key: "itemsTable", label: "Items Table", group: "Item" },
  { key: "firstItemName", label: "First Item — Name", group: "Item" },
  { key: "firstItemPrice", label: "First Item — Rate", group: "Item" },
  // firstItemImage removed — confirmed via orderInputMapper.js's actual
  // returned object (no such key is ever produced; firstItemName/
  // firstItemPrice are, immediately above them there).

  // No formula layer in pdfme (confirmed — no expression engine, fields just
  // render whatever `inputs` hands them), so every derived number has to be
  // calculated once in orderInputMapper.js and exposed here as its own
  // bindable entry. These 11 are LEGACY keys — orderInputMapper.js still
  // produces them for backward compat with a template saved before the
  // per-row Label/Value fields below existed (its own comment: "no longer
  // bound to a visible field in buildDocTemplate.js... kept here only so a
  // template saved before this change doesn't render blank") — still real,
  // still bindable, just not what a brand-new template's default fields use.
  { key: "subTotal", label: "Sub Total (Legacy)", group: "Computed" },
  { key: "gstAmount", label: "GST Amount (Legacy)", group: "Computed" },
  { key: "packingCharge", label: "Packing & Forwarding Charge (Legacy)", group: "Computed" },
  { key: "transportCharge", label: "Transport Charge (Legacy)", group: "Computed" },
  { key: "tcsAmount", label: "TCS Amount (Legacy)", group: "Computed" },
  { key: "roundOff", label: "Round Off (Legacy)", group: "Computed" },
  { key: "advancePayment", label: "Advance Payment (Legacy)", group: "Computed" },
  { key: "grandTotal", label: "Grand Total (Legacy)", group: "Computed" },
  { key: "grandTotalInWords", label: "Grand Total In Words (Legacy)", group: "Computed" },
  { key: "payableAmount", label: "Payable Amount (Legacy)", group: "Computed" },
  { key: "hsnSummary", label: "HSN Summary (Legacy)", group: "Computed" },

  // The CURRENT default template's own totals-box fields (buildDocTemplate's
  // per-row Label/Value pairs) — these are what a brand-new document
  // actually shows out of the box. gstLine1/gstLine2 split CGST+SGST (same
  // state) or IGST alone (different state), computed from the cart's one
  // total gst_amt column at generate time — there's still no separate
  // cgst/sgst/igst column on cart_items itself.
  { key: "subTotalValue", label: "Sub Total", group: "Totals" },
  { key: "taxableAmountValue", label: "Total Taxable Amount", group: "Totals" },
  { key: "packingChargeValue", label: "Packing & Forwarding Charge", group: "Totals" },
  { key: "transportChargeValue", label: "Transport Charge", group: "Totals" },
  { key: "cashDiscountValue", label: "Cash Discount", group: "Totals" },
  { key: "gstLine1Value", label: "GST Line 1 (CGST or IGST)", group: "Totals" },
  { key: "gstLine2Value", label: "GST Line 2 (SGST)", group: "Totals" },
  { key: "tcsValue", label: "TCS Amount", group: "Totals" },
  { key: "roundOffValue", label: "Round Off", group: "Totals" },
  { key: "grandTotalValue", label: "Grand Total", group: "Totals" },
  { key: "advancePaymentValue", label: "Advance Payment", group: "Totals" },
  { key: "payableAmountValue", label: "Payable Amount", group: "Totals" },
  { key: "hsnTaxTable", label: "HSN Tax Table", group: "Totals" },
  { key: "grandTotalWordsText", label: "Grand Total (In Words)", group: "Totals" },
  { key: "bankDetailsText", label: "Bank Details", group: "Footer" },
  { key: "remarksText", label: "Remarks", group: "Footer" },
  { key: "noteText", label: "Note", group: "Footer" },
];

// Field names match textField/tableField `name`s in their respective
// pdfmeEngine builders exactly (accountStatementTemplate.js,
// accountTransactionTemplate.js, taskDueListTemplate.js,
// shippingLabelTemplate.js) — these 4 are the "Account/Employee Statement,
// Shipping Label" doc types from the comment above. Stock In/Out still has
// no builder, so it's not registered here yet.
// leftHeaderBlock/rightHeaderBlock never matched any real field in
// accountStatementTemplate.js (which already builds granular fields) — a
// dictionary bug found while wiring up the admin panel's System Document
// Template Library, fixed here to list the template's actual field names.
const ACCOUNT_STATEMENT_DICTIONARY = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyContactLine", label: "Company Contact Line", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "statementDateRange", label: "Statement Date Range", group: "Statement" },
  { key: "contactName", label: "Contact Name", group: "Contact" },
  { key: "contactCompany", label: "Contact Company Name", group: "Contact" },
  { key: "contactMobile", label: "Contact Mobile", group: "Contact" },
  { key: "contactEmail", label: "Contact Email", group: "Contact" },
  { key: "contactAddress", label: "Contact Address", group: "Contact" },
  { key: "contactShippingAddress", label: "Contact Shipping Address", group: "Contact" },
  { key: "contactGSTIN", label: "Contact GSTIN", group: "Contact" },
  { key: "statementTable", label: "Transactions Table", group: "Item" },
];
// Same bug as above, worse — only 4 of the real ~17 fields were listed and
// "companyHeaderLine2" doesn't exist at all. See accountTransactionTemplate.js.
const ACCOUNT_TRANSACTION_DICTIONARY = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyContact", label: "Company Contact", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "contactNameValue", label: "Contact Name", group: "Contact" },
  { key: "contactMobileValue", label: "Contact Mobile", group: "Contact" },
  { key: "contactEmailValue", label: "Contact Email", group: "Contact" },
  { key: "contactCompanyValue", label: "Contact Company Name", group: "Contact" },
  { key: "contactCountryValue", label: "Contact Country", group: "Contact" },
  { key: "contactStateValue", label: "Contact State", group: "Contact" },
  { key: "contactCityValue", label: "Contact City", group: "Contact" },
  { key: "contactPincodeValue", label: "Contact Pincode", group: "Contact" },
  { key: "contactAddressValue", label: "Contact Address", group: "Contact" },
  { key: "txnIdValue", label: "Transaction ID", group: "Transaction" },
  { key: "entityValue", label: "Entity", group: "Transaction" },
  { key: "paymentDateValue", label: "Payment Date", group: "Transaction" },
  { key: "paymentModeValue", label: "Payment Mode", group: "Transaction" },
  { key: "amountLine", label: "Amount Line", group: "Computed" },
  { key: "remarkText", label: "Remark", group: "Computed" },
  { key: "thankYouText", label: "Thank You Text", group: "Computed" },
];
// pendingOrderTemplate.js's actual fields — pendingSalesOrder/
// pendingPurchaseOrder were previously mapped to CART_DOC_DICTIONARY below,
// but that template shares none of CART_DOC_DICTIONARY's field names at all.
const PENDING_ORDER_DICTIONARY = [
  { key: "buyerCompanyName", label: "Buyer Company Name", group: "Buyer" },
  { key: "buyerContactName", label: "Buyer Contact Name", group: "Buyer" },
  { key: "billingAddress", label: "Billing Address", group: "Buyer" },
  { key: "orderNumber", label: "Order Number", group: "Order" },
  { key: "orderDateTime", label: "Order Date & Time", group: "Order" },
  { key: "contactPerson", label: "Contact Person", group: "Order" },
  { key: "pendingItemsTable", label: "Pending Items Table", group: "Item" },
  { key: "termsAndConditions", label: "Terms & Conditions", group: "Footer" },
  { key: "signatureLine", label: "Signature Line", group: "Footer" },
  { key: "signatureImage", label: "Signature Image", group: "Footer" },
];
// employeeAccountStatement / employeeAccountTransaction — Team's OWN
// customization slot, deliberately separate from accountStatement /
// accountTransaction (the Contact variant's slot) even though the layouts
// started similar, so a company can brand an employee payment receipt
// differently from a customer one. Per-field entries (like
// CONTACT_DOC_DICTIONARY below), not group-level blocks like
// ACCOUNT_STATEMENT_DICTIONARY above — each field is individually bindable.
// See employeeAccountStatementTemplate.js / employeeAccountTransactionTemplate.js.
const EMPLOYEE_ACCOUNT_STATEMENT_DICTIONARY = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyContactLine", label: "Company Contact Line", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "statementTitle", label: "Statement Title", group: "Statement" },
  { key: "statementDateRange", label: "Statement Date Range", group: "Statement" },
  { key: "employeeName", label: "Employee Name", group: "Employee" },
  { key: "employeeMobile", label: "Employee Mobile", group: "Employee" },
  { key: "employeeEmail", label: "Employee Email", group: "Employee" },
  { key: "statementTable", label: "Transactions Table", group: "Item" },
];
const EMPLOYEE_ACCOUNT_TRANSACTION_DICTIONARY = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyContact", label: "Company Contact", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "employeeNameValue", label: "Employee Name", group: "Employee" },
  { key: "employeeMobileValue", label: "Employee Mobile", group: "Employee" },
  { key: "employeeEmailValue", label: "Employee Email", group: "Employee" },
  { key: "txnIdValue", label: "Transaction ID", group: "Transaction" },
  { key: "amountLine", label: "Amount Line", group: "Computed" },
  { key: "paymentDateValue", label: "Payment Date", group: "Transaction" },
  { key: "paymentModeValue", label: "Payment Mode", group: "Transaction" },
  { key: "remarkText", label: "Remark", group: "Computed" },
  { key: "thankYouText", label: "Thank You Text", group: "Computed" },
];
// companyHeaderBlock split into granular fields — taskDueListTemplate.js
// and taskDueListGenerate.js updated to match (was one combined text field
// with no separate bind targets for name/address/contact/GSTIN).
const TASK_DUE_LIST_DICTIONARY = [
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyContactLine", label: "Company Contact Line", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "taskTable", label: "Tasks Table", group: "Item" },
];
const SHIPPING_LABEL_DICTIONARY = [
  { key: "toCustomerName", label: "To: Customer Name", group: "Buyer" },
  { key: "toAddress", label: "To: Address", group: "Buyer" },
  { key: "toPhone", label: "To: Phone", group: "Buyer" },
  { key: "fromCompanyName", label: "From: Company Name", group: "Company" },
  { key: "fromAddress", label: "From: Address", group: "Company" },
  { key: "fromPhone", label: "From: Phone", group: "Company" },
  { key: "orderNumberText", label: "Order Number", group: "Order" },
  { key: "qrImage", label: "QR Code", group: "Order" },
  { key: "itemsTable", label: "Items Table", group: "Item" },
  { key: "grandTotalText", label: "Grand Total", group: "Computed" },
  { key: "termsText", label: "Terms", group: "Computed" },
];
// contactAddress / contactEnvelope share this — same bindable fields, only
// layout (label sheet vs. A4-landscape envelope) differs between them.
const CONTACT_DOC_DICTIONARY = [
  { key: "toName", label: "To: Name", group: "Contact" },
  { key: "toCompanyName", label: "To: Company Name", group: "Contact" },
  { key: "toPhone", label: "To: Contact No.", group: "Contact" },
  { key: "toEmail", label: "To: Email", group: "Contact" },
  { key: "toLocationLine", label: "To: Area/City/State/Country - Pincode", group: "Contact" },
  { key: "toAddress", label: "To: Address", group: "Contact" },
  { key: "fromCompanyName", label: "From: Company Name", group: "Company" },
  { key: "fromLocationLine", label: "From: City, State", group: "Company" },
  { key: "fromPhone", label: "From: Contact No.", group: "Company" },
  { key: "fromEmail", label: "From: Email", group: "Company" },
  { key: "fromAddress", label: "From: Address", group: "Company" },
];

// doc_type -> which base dictionary applies. All 10 cart-shaped doc_types
// point at the same array (same pattern as templates.js's titleById).
const DICTIONARY_BY_DOC_TYPE = {
  quotation: CART_DOC_DICTIONARY,
  salesOrder: CART_DOC_DICTIONARY,
  salesInvoice: CART_DOC_DICTIONARY,
  purchaseOrder: CART_DOC_DICTIONARY,
  purchaseInvoice: CART_DOC_DICTIONARY,
  returnSalesInvoice: CART_DOC_DICTIONARY,
  returnPurchaseInvoice: CART_DOC_DICTIONARY,
  inward: CART_DOC_DICTIONARY,
  dispatch: CART_DOC_DICTIONARY,
  proformaInvoice: CART_DOC_DICTIONARY,
  // Pending Sales/Purchase Order render via pendingOrderTemplate.js, a
  // completely different field set than the other cart-shaped types —
  // previously pointed at CART_DOC_DICTIONARY, which shares none of its
  // field names.
  pendingSalesOrder: PENDING_ORDER_DICTIONARY,
  pendingPurchaseOrder: PENDING_ORDER_DICTIONARY,
  accountStatement: ACCOUNT_STATEMENT_DICTIONARY,
  accountTransaction: ACCOUNT_TRANSACTION_DICTIONARY,
  taskDueList: TASK_DUE_LIST_DICTIONARY,
  shippingLabel: SHIPPING_LABEL_DICTIONARY,
  contactAddress: CONTACT_DOC_DICTIONARY,
  contactEnvelope: CONTACT_DOC_DICTIONARY,
  employeeAccountStatement: EMPLOYEE_ACCOUNT_STATEMENT_DICTIONARY,
  employeeAccountTransaction: EMPLOYEE_ACCOUNT_TRANSACTION_DICTIONARY,
};

// Cart custom fields (carts_column_*) use a DIFFERENT form_type per doc
// type — not one shared constant. Mirrors orderServices.js's own
// customFieldsWhere.form_type assignment exactly (~line 4202-4230); a
// dictionary built with the wrong form_type here silently returns some
// OTHER doc type's custom fields (or none) as "Cart Custom Field" entries.
const CART_CUSTOM_FIELD_FORM_TYPE_BY_DOC_TYPE = {
  quotation: 5,
  salesOrder: 6,
  salesInvoice: 7,
  purchaseInvoice: 8,
  purchaseOrder: 9,
  returnSalesInvoice: 10,
  returnPurchaseInvoice: 11,
  inward: 12,
  dispatch: 13,
  proformaInvoice: 16,
  // Same cart type/custom-field form_type as their confirmed-order
  // counterpart — pendingSalesOrder/pendingPurchaseOrder print the same
  // underlying cart record (cart.type 2/5), just a different doc_type.
  pendingSalesOrder: 6,
  pendingPurchaseOrder: 9,
};
const PRODUCT_CUSTOM_FIELD_FORM_TYPE = 4;

// Report Builder's doc_type is dynamic — "report_" + report_definition_id
// (reportPdfExport.js's reportDocType()), one per report, not a fixed
// registrable id like the cart-shaped types above. Same bindable set for
// every report (reportPdfExport.js's rawInputs: reportTitle/reportTable/
// appliedFilters, plus the company fields it also now feeds in alongside
// withCompanyHeader's static-field injection) — no per-report customization
// needed since a report's OWN columns render inside the single reportTable
// field, not as individually bindable keys.
const REPORT_DICTIONARY = [
  { key: "reportTitle", label: "Report Title", group: "Report" },
  { key: "reportTable", label: "Report Table", group: "Report" },
  { key: "appliedFilters", label: "Applied Filters", group: "Report" },
  { key: "companyName", label: "Company Name", group: "Company" },
  { key: "companyAddress", label: "Company Address", group: "Company" },
  { key: "companyGSTIN", label: "Company GSTIN", group: "Company" },
  { key: "companyMobile", label: "Company Mobile", group: "Company" },
  { key: "companyEmail", label: "Company Email", group: "Company" },
];

export async function buildDataDictionary(req, doc_type) {
  if (doc_type.startsWith("report_")) {
    return REPORT_DICTIONARY;
  }

  const base = DICTIONARY_BY_DOC_TYPE[doc_type];
  if (!base) {
    throw new Error(`No data dictionary registered for doc_type: ${doc_type}`);
  }

  const { company_masters_id } = req.body || {};
  const cartCustomFieldFormType = CART_CUSTOM_FIELD_FORM_TYPE_BY_DOC_TYPE[doc_type];
  // The 4 non-cart doc types have no cart custom-field form_type mapping —
  // custom fields are a cart-document concept, so skip the lookup entirely
  // rather than querying form_type IN (undefined, ...).
  if (!cartCustomFieldFormType) {
    return base;
  }

  const CustomField = customFieldFormModel(req.tenantDB);
  // data_type 11/12/14 (pageText/pageURL/Document Designer Page) are
  // deliberately excluded — those render as before/after extra pages
  // (orderInputMapper.js), not bindable data a field on the main canvas can
  // point to.
  const customFields = await CustomField.findAll({
    where: {
      form_type: [cartCustomFieldFormType, PRODUCT_CUSTOM_FIELD_FORM_TYPE],
      company_masters_id,
      print_or_not: 1,
      isDelete: 0,
      data_type: { [Op.notIn]: [11, 12, 14] },
    },
    attributes: ["title", "reference_column_name", "form_type"],
  });

  const customEntries = customFields.map((f) => ({
    key: f.reference_column_name,
    label: f.title,
    group: f.form_type === PRODUCT_CUSTOM_FIELD_FORM_TYPE ? "Product Custom Field" : "Cart Custom Field",
  }));

  return [...base, ...customEntries];
}
