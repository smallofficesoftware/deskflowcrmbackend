import moment from "moment";
import { contactModel } from "../../models/activities/contactModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { checkWarehouseWiseStock } from "../activities/stockAdjustmentServices.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";
import { verifySessionToken } from "./storefrontSession.js";
import { normalizeToTenDigit, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// P4 (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt) - first slice: checkout
// creates a REAL carts row (type 2), exactly the old online-store module's
// own precedent (onlineStoreService.js's orderCreateByOnlineStore) - no
// storefront_orders wrapper, no payment_status column (REVISED 23-10-2026,
// per the user - both dropped, see the plan's own 4.2c). This is checkout
// only - no payment wiring yet (that's the next slice, once per-company
// Razorpay keys + the "which stage means paid" setting exist). cart_status
// stays 0 (draft/pending) here, same as the old module's own "draft"
// orderType - no cart_number assigned yet either, same reasoning (a
// number is only reserved once an order is real/approved, not at
// creation - avoids burning sequential numbers on abandoned checkouts).
const ADDON_CODE = "ecommerce-storefront";

async function resolveAndGate(companySlug) {
  const resolved = await resolveCompanyBySlug(companySlug);
  if (!resolved) return { error: resError({ ack_msg: "Store not found" }) };

  const { enabled } = await isAppEnabledForCompany(resolved.tenantDB, resolved.company_masters_id, ADDON_CODE);
  if (!enabled) return { error: resError({ ack_msg: "This store's online ordering is not enabled." }) };

  return { resolved };
}

/** Optional session read - unlike requireStorefrontSession, a missing/
 * invalid token is NOT an error here: checkout must also work for a guest
 * when the company allows it (Q6). */
function readOptionalSession(req) {
  const token = req.headers.authorization;
  return token ? verifySessionToken(token) : null;
}

/** Finds or creates the ordering contact. Logged-in: the session's own
 * contact. Guest: find-or-create by mobile, same shape/defaults as the old
 * online-store module's own guest contact (person_name "Guest" fallback,
 * source_type_id: -18 - the SAME marker that module already uses, not a
 * new one, since this is the same kind of event: an anonymous storefront
 * order creating a contact). */
async function resolveOrderingContact({ tenantDB, company_masters_id, session, guest_mobile_number, guest_person_name }) {
  if (session) {
    const contact = await contactModel(tenantDB).findOne({ where: { id: session.contact_master_id, company_masters_id, isDelete: 0 } });
    if (!contact) return { error: "Account not found." };
    return { contact };
  }

  const mobile = normalizeToTenDigit(guest_mobile_number);
  if (!mobile) return { error: "A valid mobile number is required." };

  let contact = await contactModel(tenantDB).findOne({ where: { company_masters_id, mobile_number: mobile, isDelete: 0 } });
  if (!contact) {
    contact = await contactModel(tenantDB).create({
      company_masters_id,
      person_name: guest_person_name || "Guest",
      mobile_number: mobile,
      isDelete: 0,
      isActive: 1,
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      source_type_id: -18,
    });
  }
  return { contact };
}

/** Price per item: the contact's OWN assigned price list first, company
 * default second, the product's own rate/net_rate last - matching the old
 * online-store module's real precedent (contact.assinged_to_price_list),
 * which P2's catalog-only pricing didn't check (catalog has no logged-in
 * contact to check against) - checkout does, and must. */
async function resolvePrices(tenantDB, { contactPriceListId, defaultPriceListId, products }) {
  const listIds = [contactPriceListId, defaultPriceListId].filter(Boolean);
  if (listIds.length === 0) return new Map();

  const rows = await priceListModel(tenantDB).findAll({
    where: { pricelist_masters_id: listIds, product_id: products.map((p) => p.id), isDelete: 0 },
    raw: true,
  });
  const byListThenProduct = new Map();
  rows.forEach((r) => byListThenProduct.set(`${r.pricelist_masters_id}_${r.product_id}`, r));

  const priceByProductId = new Map();
  products.forEach((p) => {
    const fromContact = contactPriceListId ? byListThenProduct.get(`${contactPriceListId}_${p.id}`) : null;
    const fromDefault = defaultPriceListId ? byListThenProduct.get(`${defaultPriceListId}_${p.id}`) : null;
    const override = fromContact || fromDefault;
    priceByProductId.set(p.id, override ? { rate: override.rate, net_rate: override.net_rate } : { rate: p.rate, net_rate: p.net_rate });
  });
  return priceByProductId;
}

/** Derived stock check (Q7) - 'reserved' mode is P5, not here (and per the
 * 23-10-2026 correction, won't be a separate table either way - just a
 * cart_status). Warehouse-wise mode (checkStockCheckMode === 2) is SKIPPED
 * for now - the storefront has no warehouse-picker UI yet, and guessing
 * one would be worse than not checking; flagged here, not silently wrong. */
/** Inlined copy of stockAdjustmentServices.js's getStockCheckMode logic,
 * using the ALREADY-RESOLVED company_masters_id directly instead of
 * re-deriving it via getCompanyByLoginId(a_application_login_id) - that
 * helper resolves incorrectly for at least one real company in this
 * dataset (confirmed earlier this session: company 67's own login id
 * resolves to company 692 instead), which would run the stock check
 * against the WRONG company's settings entirely. */
async function getStorefrontStockCheckMode(company_masters_id) {
  const settings = await companyModel.findOne({
    where: { id: company_masters_id, isDelete: 0 },
    attributes: ["is_strict_check_product_stock", "is_strict_wharehouse_wise_product_stock_check"],
    raw: true,
  });
  if (settings?.is_strict_check_product_stock != 2) return 0;
  return settings?.is_strict_wharehouse_wise_product_stock_check == 2 ? 2 : 1;
}

async function checkDerivedStock(tenantDB, company_masters_id, items) {
  const mode = await getStorefrontStockCheckMode(company_masters_id);
  if (mode === 0 || mode === 2) return { status: true };

  const stockItem = items.map((i) => ({ product_id: i.product_id, qty: i.qty, product_name: i.product_name, warehouse_from: null }));
  // checkWarehouseWiseStock reads req.tenantDB internally - this route has no
  // tenantMiddleware (it's public, like every other storefront endpoint), so
  // the real Express req never has that set. Pass a minimal req-shaped object
  // instead of the real req, carrying only what that function actually reads.
  // Grouping by warehouse - with every warehouse_from null here (mode 1, not
  // warehouse-wise), every item collapses into one "null warehouse" bucket
  // per product, which is exactly the company-wide total every cart_item
  // row's own item_warehouse_id would need to match - only correct when
  // cart_items for this company are never warehouse-tagged under mode 1,
  // the same assumption the existing non-warehouse-wise code path
  // (checkStockAvailability) already makes.
  return checkWarehouseWiseStock({ tenantDB }, stockItem);
}

export const createStorefrontCheckout = async (req) => {
  try {
    const { companySlug } = req.params;
    const { items, address, shipping_address, pincode, guest_mobile_number, guest_person_name } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return resBadRequest({ developer_msg: "items[] is required" });
    }

    const { resolved, error } = await resolveAndGate(companySlug);
    if (error) return error;

    const settings = await getStorefrontAuthSettings(resolved.tenantDB, resolved.company_masters_id);
    const session = readOptionalSession(req);
    if (!session && !settings.guest_checkout_enabled) {
      return resError({ ack_msg: "Please log in to continue." });
    }

    const { contact, error: contactError } = await resolveOrderingContact({
      tenantDB: resolved.tenantDB,
      company_masters_id: resolved.company_masters_id,
      session,
      guest_mobile_number,
      guest_person_name,
    });
    if (contactError) return resError({ ack_msg: contactError });

    const productIds = items.map((i) => Number(i.product_id)).filter(Boolean);
    const products = await productModel(resolved.tenantDB).findAll({
      where: { id: productIds, company_masters_id: resolved.company_masters_id, isDelete: 0, isActive: 1, show_in_ecommerce: 1 },
      attributes: ["id", "product_name", "product_code", "rate", "GST", "net_rate", "hsn_code", "is_variant_parent"],
      raw: true,
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const missing = productIds.filter((id) => !productById.has(id));
    if (missing.length > 0) {
      return resError({ ack_msg: `Some items are no longer available: ${missing.join(", ")}` });
    }
    // A variant Parent has no price/stock of its own - only its variants (separate
    // product rows) are orderable, same convention Order Creation already uses.
    const parentsOrdered = products.filter((p) => Number(p.is_variant_parent) === 1);
    if (parentsOrdered.length > 0) {
      return resError({ ack_msg: `Please choose a specific option for: ${parentsOrdered.map((p) => p.product_name).join(", ")}` });
    }

    const defaultPriceListId = settings.default_price_list_id || null;
    const priceByProductId = await resolvePrices(resolved.tenantDB, {
      contactPriceListId: contact.assinged_to_price_list || null,
      defaultPriceListId,
      products,
    });

    const stockItems = items.map((i) => {
      const p = productById.get(Number(i.product_id));
      return { product_id: p.id, qty: Number(i.qty) || 1, product_name: p.product_name };
    });
    const stockResult = await checkDerivedStock(resolved.tenantDB, resolved.company_masters_id, stockItems);
    if (!stockResult.status) {
      return resError({ ack_msg: stockResult.errors.join("; ") });
    }

    const nowFormatted = moment().format("YYYY-MM-DD HH:mm:ss");
    let totalQty = 0;
    let totalAmt = 0;
    const cartItemsToCreate = [];
    for (const i of items) {
      const p = productById.get(Number(i.product_id));
      const price = priceByProductId.get(p.id) || { rate: p.rate, net_rate: p.net_rate };
      const qty = Number(i.qty) || 1;
      const itemTotal = Number((Number(price.net_rate) * qty).toFixed(2));
      totalQty += qty;
      totalAmt += itemTotal;
      cartItemsToCreate.push({
        cart_type: 2,
        company_masters_id: resolved.company_masters_id,
        a_application_login_id: resolved.a_application_login_id,
        item_product_id: p.id,
        item_product_code: p.product_code || "",
        item_product_name: p.product_name,
        item_rate: Number(price.rate),
        item_gst: Number(p.GST) || 0,
        item_net_rate: Number(price.net_rate),
        item_qty: qty,
        item_hsn_code: p.hsn_code || "",
        cart_date: moment().format("YYYY-MM-DD"),
        item_total: itemTotal,
        contact_master_id: contact.id,
        isDelete: 0,
        isActive: 1,
        created_date_time: nowFormatted,
      });
    }

    const cartBody = {
      type: 2,
      cart_date: moment().format("YYYY-MM-DD"),
      cart_remark: "Storefront order",
      Address: address || "",
      shipping_address: shipping_address || "",
      PinCode: pincode || "",
      to_customer_id: contact.id,
      to_customer_name: contact.person_name || "",
      to_customer_phone: contact.mobile_number || "",
      to_customer_email: contact.email_id || "",
      to_customer_price_list_id: contact.assinged_to_price_list || "",
      created_date_time: nowFormatted,
      a_application_login_id: resolved.a_application_login_id,
      company_masters_id: resolved.company_masters_id,
      cart_status: 0,
      total_qty: totalQty,
      total_amt: Number(totalAmt.toFixed(2)),
      grand_total: Number(totalAmt.toFixed(2)),
    };

    const t = await resolved.tenantDB.transaction();
    try {
      const cart = await cartModel(resolved.tenantDB).create(cartBody, { transaction: t });
      await cartItemModel(resolved.tenantDB).bulkCreate(
        cartItemsToCreate.map((ci) => ({ ...ci, cart_id: cart.id })),
        { transaction: t }
      );
      await t.commit();
      return resSuccess({ ack_msg: "Order placed", data: { item: { cart_id: cart.id, grand_total: cartBody.grand_total } } });
    } catch (txError) {
      await t.rollback();
      throw txError;
    }
  } catch (error) {
    return resError({ developer_msg: `createStorefrontCheckout failed: ${error}` });
  }
};
