import moment from "moment";
import { QueryTypes } from "sequelize";
import { PRODUCT_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";

// Extra, read-only variables added to a run's context so flows can send
// readable data (names instead of ids, plain dates, clean item keys) without
// extra steps. Derived only - nothing here is written back to the database.
//   contact:  source_type_name, label_names, status_name, price_list_name
//   cart:     invoice_date, invoice_time, delivery_date, line_items

const ids = (csv) =>
  [...new Set(String(csv ?? "").split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0))];

const namesById = async (tenantDB, table, nameColumn, list) => {
  if (!list.length) return {};
  const rows = await tenantDB.query(`SELECT id, \`${nameColumn}\` AS name FROM \`${table}\` WHERE id IN (:list)`, {
    replacements: { list },
    type: QueryTypes.SELECT,
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
};

/** Adds readable names onto a contact row (mutates it). */
export const enrichContact = async (tenantDB, contact) => {
  if (!contact) return;
  const [source, status, priceList, labels] = await Promise.all([
    namesById(tenantDB, "source_types", "source_name", ids(contact.source_type_id)),
    namesById(tenantDB, "stage_status_masters", "name", ids(contact.contact_status)),
    namesById(tenantDB, "pricelist_masters", "price_list_name", ids(contact.assinged_to_price_list)),
    namesById(tenantDB, "lable_masters", "lable_name", ids(contact.lable)),
  ]);
  contact.source_type_name = source[Number(contact.source_type_id)] ?? "";
  contact.status_name = status[Number(contact.contact_status)] ?? "";
  contact.price_list_name = priceList[Number(contact.assinged_to_price_list)] ?? "";
  contact.label_names = ids(contact.lable).map((id) => labels[id]).filter(Boolean).join(", ");
};

const dateOnly = (v) => (v ? moment(v).format("YYYY-MM-DD") : "");

/** Adds plain dates and clean-named items onto a cart record (mutates it). */
export const enrichCart = async (tenantDB, cart) => {
  if (!cart) return;
  cart.invoice_date = dateOnly(cart.cart_date);
  // cart_date is often date-only (00:00) - then the time the document was created is the useful one.
  const dated = cart.cart_date ? moment(cart.cart_date) : null;
  const timeSource = dated && dated.format("HH:mm") !== "00:00" ? dated : cart.created_date_time ? moment(cart.created_date_time) : dated;
  cart.invoice_time = timeSource ? timeSource.format("HH:mm") : "";
  cart.delivery_date = dateOnly(cart.due_date);

  const items = Array.isArray(cart.items) ? cart.items : [];
  const productIds = [...new Set(items.map((i) => Number(i.item_product_id)).filter(Boolean))];
  const images = await namesById(tenantDB, "products", "product_img", productIds);
  cart.line_items = items.map((i, idx) => ({
    no: idx + 1,
    product_code: i.item_product_code ?? "",
    product_name: i.item_product_name ?? "",
    particular_description: i.item_product_description || i.item_product_name || "",
    hsn_sac_code: i.item_hsn_code ?? "",
    unit_name: i.item_unit_name ?? "",
    qty: Number(i.item_qty) || 0,
    rate: Number(i.item_rate) || 0,
    amount: Number(i.item_total) || 0,
    gst_percent: Number(i.item_gst) || 0,
    discount_percent: Number(i.item_discount_pct) || 0,
    product_image: images[Number(i.item_product_id)] ? PRODUCT_IMG_LINK_EXTENDED + images[Number(i.item_product_id)] : "",
  }));
};

/** Run-context entry point: enrich whatever the trigger record / its contact is. */
export const enrichContext = async (tenantDB, ctx) => {
  if (ctx.contact) await enrichContact(tenantDB, ctx.contact);
  if (ctx.record_type === "cart" && ctx.record) await enrichCart(tenantDB, ctx.record);
};
