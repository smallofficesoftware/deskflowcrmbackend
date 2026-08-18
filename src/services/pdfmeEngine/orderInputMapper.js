// Shapes real cart/item/company data into the pdfme `inputs` array shape,
// and provides the small generate-time template transforms (data-source
// resolution, conditional visibility, watermark injection, extra pages)
// that run right before @pdfme/generator's generate() call. Field-name
// extraction from the raw cart/company DB rows happens in orderServices.js's
// generate-integration point (same scope orderServices.js already has this
// data in, before its ejs.render() call) — this module only shapes and
// transforms, it doesn't reach into raw DB rows itself.
import QRCode from "qrcode";
import { resolveColumns } from "./tableColumns.js";

// dataSource defaults to the field's own name (buildTemplate.js's
// textField/imageField helpers) — a plain field is unaffected. This is what
// makes a RENAMED duplicate (native pdfme copy/paste auto-renames copies)
// still resolve to the correct real data: the copy keeps its original
// dataSource, so this runs BEFORE pdfme's own name-based `inputs` lookup.
export function resolveDataSources(template, inputs) {
  const resolved = { ...inputs };
  (template.schemas || []).forEach((page) => {
    page.forEach((field) => {
      if (field.dataSource && field.dataSource !== field.name && resolved[field.dataSource] !== undefined) {
        resolved[field.name] = resolved[field.dataSource];
      }
    });
  });
  return resolved;
}

// pdfme's generate() renders a schema field blank if its name is absent
// from `inputs` — fine for fields orderInputMapper already knows about, but
// any field added ad hoc via the Designer's field palette (or a Static Text
// field never meant to be data-bound) has no matching inputs entry. Falls
// back to the field's own template content so it shows something meaningful.
export function fillMissingInputsFromContent(template, inputs) {
  const filled = { ...inputs };
  (template.schemas || []).forEach((page) => {
    page.forEach((field) => {
      if (!field.readOnly && !(field.name in filled) && field.content) {
        filled[field.name] = field.content;
      }
    });
  });
  return filled;
}

function isEmptyValue(value) {
  return value === undefined || value === null || value === "" || value === "0" || value === 0;
}

function evaluateCondition(condition, inputs) {
  if (!condition) return true;
  if (condition.mode === "hideIfEmpty") {
    // The field's own resolved value (by this point inputs[field.name] has
    // already run through resolveDataSources) is what "empty" checks — the
    // caller passes the field itself, not just the condition, so this is
    // invoked per-field below rather than here.
    return true;
  }
  if (condition.mode === "compare") {
    const actual = inputs[condition.field];
    switch (condition.operator) {
      case "isEmpty":
        return isEmptyValue(actual);
      case "isNotEmpty":
        return !isEmptyValue(actual);
      case "equals":
        return String(actual) === String(condition.value);
      case "notEquals":
        return String(actual) !== String(condition.value);
      case "greaterThan":
        return Number(actual) > Number(condition.value);
      case "lessThan":
        return Number(actual) < Number(condition.value);
      default:
        return true;
    }
  }
  return true;
}

// pdfme has no per-field "if" concept — a field bound to an empty value
// still renders (an empty box). Filters fields whose visibilityCondition
// evaluates false OUT of a per-request clone entirely, so they're genuinely
// absent, not just blank. Never mutates the saved template — resolved fresh
// against this specific cart's real data on every generate.
export function applyConditionalVisibility(template, resolvedInputs) {
  const cloned = structuredClone(template);
  cloned.schemas = cloned.schemas.map((page) =>
    page.filter((field) => {
      const condition = field.visibilityCondition;
      if (!condition) return true;
      if (condition.mode === "hideIfEmpty") {
        return !isEmptyValue(resolvedInputs[field.name]);
      }
      return evaluateCondition(condition, resolvedInputs);
    }),
  );
  return cloned;
}

// Fixed company-wide overlay, outside Designer control — matches
// company_masters.watermark_in_print (1=off, 2=on) exactly as it works
// today (orderServices.js:4661-4671): centered, translucent, same logo,
// same position on every generate. Not part of template_json.
export function injectWatermarkField(template, company) {
  if (company?.watermark_in_print != 2 || !company?.logoImage) return template;

  const cloned = structuredClone(template);
  const { width, height } = cloned.basePdf;
  const boxSize = Math.min(width, height) * 0.55;

  cloned.schemas[0] = [
    ...cloned.schemas[0],
    {
      name: "__watermark",
      type: "image",
      content: company.logoImage,
      position: { x: (width - boxSize) / 2, y: (height - boxSize) / 2 },
      width: boxSize,
      height: boxSize,
      opacity: 0.15,
      readOnly: true,
    },
  ];
  return cloned;
}

// UPI payment QR — same deep link the old EJS pipeline builds
// (orderServices.js:4494-4505), only for the same 3 doc types that get it
// today (cart.type 1/2/3 — Quotation/Sales Order/Sales Invoice), only when
// the company has enabled printSetting.paymentQR AND configured UPI
// details. Same "resolved fresh at generate time, never baked into the
// saved template_json" reasoning as the watermark above — async because
// QR PNG generation is, unlike everything else in this file.
const PAYMENT_QR_DOC_TYPES = ["quotation", "salesOrder", "salesInvoice"];

export async function injectPaymentQRField(template, { docType, company, order, payableAmount }) {
  if (!PAYMENT_QR_DOC_TYPES.includes(docType)) return template;
  if (!company?.paymentQREnabled) return template;
  if (!company?.upiId || !company?.upiName) return template;

  const upiString =
    `upi://pay?pa=${company.upiId}&pn=${encodeURIComponent(company.upiName)}` +
    `&am=${payableAmount}&cu=INR&tn=${encodeURIComponent(`Invoice No ${order?.number || ""}`)}`;

  let qrDataUri;
  try {
    qrDataUri = await QRCode.toDataURL(upiString, {
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  } catch {
    // A broken UPI string or QR-lib failure shouldn't take down the whole
    // generate — just skip the QR code for this one document.
    return template;
  }

  const cloned = structuredClone(template);
  cloned.schemas[0] = [
    ...cloned.schemas[0],
    {
      name: "__paymentQR",
      type: "image",
      content: qrDataUri,
      position: { x: 10, y: 220 },
      width: 22,
      height: 22,
      readOnly: true,
    },
    {
      name: "__paymentQRLabel",
      type: "text",
      content: "Scan to Pay",
      position: { x: 10, y: 242 },
      width: 22,
      height: 5,
      fontSize: 6,
      alignment: "center",
      readOnly: true,
    },
  ];
  return cloned;
}

// pageText (formType/data_type 11) / pageURL (data_type 12) — per-cart
// custom-field-driven extra pages, sourced from the SAME custom-field rows
// orderServices.js already fetches for the EJS pipeline (form_type scoped
// to the cart's doc type, print_or_not: 1). Returns { before: [], after: [] }
// where each entry is { kind: "text"|"image", value, display_order } —
// caller (orderServices.js's generate flow) turns each into its own tiny
// pdfme template + generate() + pdf-lib splice, matching the main doc's
// basePdf so a cover/outro page carries the same page size.
export function buildExtraPages(customFieldRows, cartValues) {
  const before = [];
  const after = [];

  customFieldRows.forEach((field) => {
    const dataType = Number(field.data_type);
    if (dataType !== 11 && dataType !== 12) return;

    const value = cartValues?.[field.reference_column_name];
    const isValid =
      value !== undefined &&
      value !== null &&
      value !== "" &&
      value !== " " &&
      value !== "0" &&
      value !== "00:00:00" &&
      value !== "0000-00-00" &&
      value !== "0000-00-00 00:00:00";
    if (!isValid) return;

    const entry = {
      kind: dataType === 11 ? "text" : "image",
      value,
      display_order: field.display_order,
    };
    (Number(field.display_order) <= 0 ? before : after).push(entry);
  });

  const byOrder = (a, b) => a.display_order - b.display_order;
  return { before: before.sort(byOrder), after: after.sort(byOrder) };
}

// Maps the real `carts` table's own numeric columns (confirmed against
// orderPdfV1.ejs / orderServices.js's pdfOrder — cart.taxable_amt/gst_amt/
// packing_forwarding_charge/transport_charge/tcs_amt/round_off/
// advance_payment/grand_total) into the Computed dictionary group's shape.
// `cart` is the raw `resultCartById.dataValues` row, `numberTowords` is the
// SAME numberToWordsCurrency(...) string orderServices.js already computes
// today — passed in, not recomputed, so there's exactly one source of truth.
// carts.grand_total/taxable_amt/etc are DOUBLE columns — mysql2 returns
// these as JS numbers (unlike DECIMAL, which comes back as a string), and
// a pdfme text field's content must be a string (@pdfme/schemas' line-
// break logic calls .split on it) or generate() throws. Matches the old
// EJS pipeline's own formatNum(x, 2) (src/utils/sharedFunctions.js).
function num(value, decimals = 2) {
  if (value === undefined || value === null || value === "") return "";
  return Number(value).toFixed(decimals);
}

export function buildComputedFields(cart, numberTowords) {
  const grandTotal = Number(cart?.grand_total) || 0;
  const advancePayment = Number(cart?.advance_payment) || 0;

  return {
    subTotal: num(cart?.taxable_amt),
    gstAmount: num(cart?.gst_amt),
    packingCharge: num(cart?.packing_forwarding_charge),
    transportCharge: num(cart?.transport_charge),
    tcsAmount: num(cart?.tcs_amt),
    roundOff: num(cart?.round_off),
    advancePayment: num(cart?.advance_payment),
    grandTotal: num(cart?.grand_total),
    grandTotalInWords: numberTowords ?? "",
    payableAmount: (grandTotal - advancePayment).toFixed(2),
  };
}

// HSN Summary — grouped from real item rows (item_hsn_code + item_total),
// since there's no precomputed summary column anywhere in the real system
// (the old EJS pipeline doesn't build one either — this is new value, not a
// port of existing logic). One line per distinct HSN code: code, item count,
// summed taxable total.
export function buildHsnSummary(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const hsn = item.item_hsn_code || "—";
    const amount = Number(item.item_total) || 0;
    const entry = groups.get(hsn) || { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += amount;
    groups.set(hsn, entry);
  });

  return Array.from(groups.entries())
    .map(([hsn, { count, amount }]) => `${hsn}: ${count} item(s), ${amount.toFixed(2)}`)
    .join("\n");
}

// Sample data for Generate Preview's empty-state fallback — a company with
// zero Quotations yet still needs to see SOMETHING when previewing a new
// template. Real order data (§6's default, whenever at least one order
// exists) takes priority over this everywhere it's used.
export function getSampleDataForPreview() {
  return {
    company: { name: "Sample Company Pvt Ltd", address: "123 Business Street, City, State, PIN", gstin: "00XXXXX0000X0X0", mobile: "9876543210", email: "company@example.com" },
    buyer: { companyName: "Customer Company Name", contactName: "Customer Contact Name", phone: "9876543210", email: "customer@example.com", billingAddress: "123 Street, City, State, PIN", shippingAddress: "123 Street, City, State, PIN", gstin: "00XXXXX0000X0X0", supplyTo: "State - City" },
    order: { number: "SAMPLE/00/2026-2027", dateTime: "01-01-2026 12:00 PM", contactPerson: "Team Member Name" },
    items: [
      { description: "Sample Item 1\nProduct Code: ABC", hsn: "1234", qty: "1.00 / Nos", rate: "100.00", discount: "0.00", total: "100.00", item_hsn_code: "1234", item_total: "100.00" },
      { description: "Sample Item 2\nProduct Code: XYZ", hsn: "5678", qty: "2.00 / Nos", rate: "50.00", discount: "0.00", total: "100.00", item_hsn_code: "5678", item_total: "100.00" },
    ],
    cart: { taxable_amt: "200.00", gst_amt: "36.00", packing_forwarding_charge: "0", transport_charge: "0", tcs_amt: "0", round_off: "0", advance_payment: "0", grand_total: "236.00" },
    numberTowords: "Two Hundred Thirty Six Rupees Only",
  };
}

// Builds one pdfme `inputs` record (generate() takes an array of these —
// this pilot only ever generates one cart at a time, so it's a 1-length
// array at the call site) from clean, already-extracted values. Field-name
// extraction from raw cart.dataValues/companyDetail happens at the call
// site (orderServices.js), not here — keeps this module's job to shaping,
// not digging through DB rows it doesn't own the schema of.
export function buildInputsForCart({ company, buyer, order, computed, items, columnOptions }) {
  const columns = resolveColumns(columnOptions);

  const itemsTableRows = (items || []).map((item, index) =>
    columns.map((c) => {
      switch (c.key) {
        case "no":
          return String(index + 1);
        case "image":
          return "";
        case "description":
          return item.description ?? "";
        case "hsn":
          return item.hsn ?? "";
        case "qty":
          return item.qty === undefined || item.qty === null ? "" : String(item.qty);
        case "rate":
          return num(item.rate);
        case "discount":
          return num(item.discount);
        case "cgst":
          return num(item.cgst);
        case "sgst":
          return num(item.sgst);
        case "igst":
          return num(item.igst);
        case "total":
          return num(item.total);
        default:
          return "";
      }
    }),
  );

  return {
    companyName: company?.name ?? "",
    companyAddress: company?.address ?? "",
    companyGSTIN: company?.gstin ?? "",
    companyMobile: company?.mobile ?? "",
    companyEmail: company?.email ?? "",

    buyerCompanyName: buyer?.companyName ?? "",
    buyerContactName: buyer?.contactName ?? "",
    buyerPhone: buyer?.phone ?? "",
    buyerEmail: buyer?.email ?? "",
    billingAddress: buyer?.billingAddress ?? "",
    shippingAddress: buyer?.shippingAddress ?? "",
    buyerGSTIN: buyer?.gstin ?? "",
    supplyTo: buyer?.supplyTo ?? "",

    orderNumber: order?.number ?? "",
    orderDateTime: order?.dateTime ?? "",
    contactPerson: order?.contactPerson ?? "",

    itemsTable: JSON.stringify(itemsTableRows),

    subTotal: computed?.subTotal ?? "",
    gstAmount: computed?.gstAmount ?? "",
    packingCharge: computed?.packingCharge ?? "",
    transportCharge: computed?.transportCharge ?? "",
    tcsAmount: computed?.tcsAmount ?? "",
    roundOff: computed?.roundOff ?? "",
    advancePayment: computed?.advancePayment ?? "",
    grandTotal: computed?.grandTotal ?? "",
    grandTotalInWords: computed?.grandTotalInWords ?? "",
    payableAmount: computed?.payableAmount ?? "",
    hsnSummary: computed?.hsnSummary ?? "",

    // totalsBlock/grandTotalWords are the template's own static-text
    // fields (buildTemplate.js) — kept in sync with the Computed group so
    // either binding style (whole block vs individual figures) works.
    totalsBlock: `Sub Total: ${computed?.subTotal ?? ""}\nGrand Total: ${computed?.grandTotal ?? ""}`,
    grandTotalWords: `Grand Total In Words: ${computed?.grandTotalInWords ?? ""}`,
  };
}
