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

  // No formula layer in pdfme (confirmed — no expression engine, fields just
  // render whatever `inputs` hands them), so every derived number has to be
  // calculated once in orderInputMapper.js and exposed here as its own
  // bindable entry. This list matches real `carts` table columns
  // (orderPdfV1.ejs / orderServices.js's pdfOrder) exactly — confirmed by
  // reading both before wiring §5: `cart_items` has NO cgst/sgst/igst split
  // columns at all, only one total `gst_amt` on the cart, so there's no real
  // "CGST/SGST/IGST amount" to expose here (an earlier draft of this list
  // assumed there was — corrected after checking the actual schema).
  { key: "subTotal", label: "Sub Total (Taxable Amount)", group: "Computed" },
  { key: "gstAmount", label: "GST Amount", group: "Computed" },
  { key: "packingCharge", label: "Packing & Forwarding Charge", group: "Computed" },
  { key: "transportCharge", label: "Transport Charge", group: "Computed" },
  { key: "tcsAmount", label: "TCS Amount", group: "Computed" },
  { key: "roundOff", label: "Round Off", group: "Computed" },
  { key: "advancePayment", label: "Advance Payment", group: "Computed" },
  { key: "grandTotal", label: "Grand Total", group: "Computed" },
  { key: "grandTotalInWords", label: "Grand Total (In Words)", group: "Computed" },
  { key: "payableAmount", label: "Payable Amount (Grand Total − Advance)", group: "Computed" },
  { key: "hsnSummary", label: "HSN Summary", group: "Computed" },
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
  proformaInvoice: 15,
};
const PRODUCT_CUSTOM_FIELD_FORM_TYPE = 4;

export async function buildDataDictionary(req, doc_type) {
  const base = DICTIONARY_BY_DOC_TYPE[doc_type];
  if (!base) {
    throw new Error(`No data dictionary registered for doc_type: ${doc_type}`);
  }

  const { company_masters_id } = req.body || {};
  const CustomField = customFieldFormModel(req.tenantDB);
  const cartCustomFieldFormType = CART_CUSTOM_FIELD_FORM_TYPE_BY_DOC_TYPE[doc_type];
  // data_type 11/12 (pageText/pageURL) are deliberately excluded — those
  // render as before/after extra pages (orderInputMapper.js), not bindable
  // data a field on the main canvas can point to.
  const customFields = await CustomField.findAll({
    where: {
      form_type: [cartCustomFieldFormType, PRODUCT_CUSTOM_FIELD_FORM_TYPE],
      company_masters_id,
      print_or_not: 1,
      isDelete: 0,
      data_type: { [Op.notIn]: [11, 12] },
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
