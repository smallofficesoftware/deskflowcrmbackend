import moment from "moment";
import { Op } from "sequelize";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { isAppEnabledForCompany } from "../../middlewares/requireAddon.js";
import { checkWarehouseWiseStock } from "../activities/stockAdjustmentServices.js";
import { getStorefrontAuthSettings } from "./storefrontAuthSettings.js";
import { loadQtySlabs, pickSlab, slabsForProduct } from "./storefrontQtySlabs.js";
import { resolveCompanyBySlug } from "./storefrontCompanyResolver.js";
import { verifySessionToken } from "./storefrontSession.js";
import { arePricesHidden } from "./storefrontPriceVisibility.js";
import { getNumberSeries, normalizeToTenDigit, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// P4 (plans/2026-10-15-ecommerce-b2b-b2c-plan.txt) - first slice: checkout
// creates a REAL carts row (type 2), exactly the old online-store module's
// own precedent (onlineStoreService.js's orderCreateByOnlineStore) - no
// storefront_orders wrapper, no payment_status column (REVISED 23-10-2026,
// per the user - both dropped, see the plan's own 4.2c). cart_number is only
// reserved once an order is real/approved (storefrontPaymentService.js's own
// verify step, or here directly for approval-mode - see isApprovalMode
// below), not at draft creation.
//
// P5 (24-10-2026) adds: credit-limit check (checkCreditLimit), approval-mode
// branch (isApprovalMode - reuses the SAME draft-cart mechanism, no new
// status machine), and 'reserved' stock-check mode (reserveStockForCheckout -
// per the user, still no new table: a hold is just a cart sitting in a
// dedicated cart_status, time-windowed rather than cleaned up by a cron).
const ADDON_CODE = "ecommerce-storefront";

// Distinct from 0 (plain draft/no reservation) and orderServices.js's own
// existing -9/-8 sentinels - unambiguously "stock is held against this cart,
// payment in flight." reserveStockForCheckout's own query excludes carts
// older than RESERVATION_WINDOW_MINUTES from counting as held, so an
// abandoned reservation just stops blocking other checkouts on its own - the
// row itself is left sitting here, same as any other abandoned draft order
// already is today, not a new cleanup problem.
const STOREFRONT_RESERVED_CART_STATUS = -20;
const RESERVATION_WINDOW_MINUTES = 15;

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

/** P5 credit-limit check (24-10-2026). Exposure = the contact's EXISTING
 * closing-balance convention (contactService.js's own getContactById already
 * computes this same SUM(type=2 Debit) - SUM(type=1 Credit) from
 * account_transactions for the "closing_balance" field shown elsewhere in
 * the CRM) plus this new order's own grand_total - per the user's explicit
 * choice over "unpaid carts only." A contact with no credit_limit set (null/
 * 0, the default for every existing contact and every guest) always passes -
 * this is opt-in per B2B contact, not a blanket gate. */
async function checkCreditLimit(tenantDB, company_masters_id, contact, orderTotal) {
  const limit = Number(contact.credit_limit) || 0;
  if (limit <= 0) return { overLimit: false, projected: 0, limit: 0 };

  const row = await accountTransactionsModel(tenantDB).findOne({
    where: { contact_masters_id: contact.id, company_masters_id, isDelete: 0 },
    attributes: [
      [tenantDB.fn("SUM", tenantDB.literal("CASE WHEN type=2 THEN amount ELSE 0 END")), "debit"],
      [tenantDB.fn("SUM", tenantDB.literal("CASE WHEN type=1 THEN amount ELSE 0 END")), "credit"],
    ],
    raw: true,
  });
  const closingBalance = (Number(row?.debit) || 0) - (Number(row?.credit) || 0);
  const projected = closingBalance + orderTotal;
  return { overLimit: projected > limit, projected, limit };
}

/** Derived stock check (Q7) - the DEFAULT mode, unchanged from P4. 'reserved'
 * mode is a separate function below (reserveStockForCheckout) - the two are
 * mutually exclusive per checkout, picked by settings.stock_check_mode.
 * Warehouse-wise mode (checkStockCheckMode === 2) is SKIPPED for now - the
 * storefront has no warehouse-picker UI yet, and guessing one would be worse
 * than not checking; flagged here, not silently wrong. */
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
  if (mode === 0 || mode === 2) return { status: true, mode };

  // warehouse_from: 0, not null - caught during P5 live verification. cart_items.
  // item_warehouse_id is NOT NULL with no DB default; the real "no specific
  // warehouse" sentinel this schema actually uses is 0 (confirmed via a real
  // value distribution query), and checkWarehouseWiseStock's own match is a
  // loose `==` against whatever's passed here - `0 == null` is false in JS,
  // so passing null made every non-warehouse-wise storefront stock check
  // silently see 0 available for every product, always failing once a
  // company turned strict checking on. Not a storefront-specific mistake -
  // the original P4 code had the same null here, just never exercised
  // against a company with strict checking actually active until now.
  const stockItem = items.map((i) => ({ product_id: i.product_id, qty: i.qty, product_name: i.product_name, warehouse_from: 0 }));
  // checkWarehouseWiseStock reads req.tenantDB internally - this route has no
  // tenantMiddleware (it's public, like every other storefront endpoint), so
  // the real Express req never has that set. Pass a minimal req-shaped object
  // instead of the real req, carrying only what that function actually reads.
  const result = await checkWarehouseWiseStock({ tenantDB }, stockItem);
  return { ...result, mode };
}

/** P5 'reserved' stock-check mode (24-10-2026) - REVISED per the user: no
 * storefront_stock_reservations table, "directly system." A hold is just
 * this checkout's own cart sitting in STOREFRONT_RESERVED_CART_STATUS; this
 * function must run INSIDE the same DB transaction that creates that cart,
 * because the derived ledger calc (checkWarehouseWiseStock's own query,
 * cart_number IS NOT NULL) only ever counts CONFIRMED stock movements
 * (invoices/inward/dispatch) - it never saw any draft/pending cart, storefront
 * or otherwise, which is exactly why two concurrent checkouts for the last
 * unit can both pass it (Q7's own "trust the derived calc" caveat). This
 * function additionally subtracts every OTHER currently-held reservation for
 * the same product, and locks each product row (SELECT ... FOR UPDATE, via
 * Sequelize's transaction lock) for the lifetime of this transaction so a
 * concurrent reserveStockForCheckout on the SAME product must wait for this
 * one to commit/rollback first - that's what actually prevents the race, not
 * just the subtraction query by itself. */
async function reserveStockForCheckout(tenantDB, t, company_masters_id, items) {
  const productIds = [...new Set(items.map((i) => i.product_id))];

  // Locks these product rows for the rest of this transaction - any other
  // reserveStockForCheckout touching the SAME product_id blocks here until
  // this transaction commits or rolls back.
  await productModel(tenantDB).findAll({
    where: { id: productIds, company_masters_id },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  const openQtyRows = await cartItemModel(tenantDB).findAll({
    where: {
      isDelete: 0,
      item_product_id: { [Op.in]: productIds },
      cart_number: { [Op.ne]: null, [Op.not]: "" },
      stock_type: { [Op.ne]: 0 },
      item_warehouse_id: 0, // mode 1 (non-warehouse-wise) sentinel - see checkDerivedStock's own comment above for why 0, not null.
      [Op.or]: [
        { cart_type: 4, reference_type: { [Op.ne]: 8 } },
        { cart_type: 3, reference_type: { [Op.ne]: 9 } },
        { cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] } },
      ],
    },
    attributes: ["item_product_id", [tenantDB.literal("SUM(CASE WHEN cart_type IN (4, 6, 8, 10) THEN item_qty WHEN cart_type IN (3, 7, 9, 11) THEN -item_qty ELSE 0 END)"), "calOpenQty"]],
    group: ["item_product_id"],
    raw: true,
    transaction: t,
  });
  const openQtyByProduct = new Map(openQtyRows.map((r) => [Number(r.item_product_id), Number(r.calOpenQty) || 0]));

  // Every OTHER currently-held reservation for these products - a plain join
  // via two models (no cross-model association declared here), so a raw
  // query, parameterized.
  const [reservedRows] = await tenantDB.query(
    `SELECT ci.item_product_id AS item_product_id, SUM(ci.item_qty) AS reserved_qty
     FROM cart_items ci
     INNER JOIN carts c ON c.id = ci.cart_id
     WHERE ci.isDelete = 0 AND c.isDelete = 0
       AND c.cart_status = :reservedStatus
       AND c.company_masters_id = :company_masters_id
       AND ci.item_product_id IN (:productIds)
       AND c.created_date_time >= :cutoff
     GROUP BY ci.item_product_id`,
    {
      replacements: {
        reservedStatus: STOREFRONT_RESERVED_CART_STATUS,
        company_masters_id,
        productIds,
        cutoff: moment().subtract(RESERVATION_WINDOW_MINUTES, "minutes").format("YYYY-MM-DD HH:mm:ss"),
      },
      transaction: t,
    }
  );
  const reservedByProduct = new Map(reservedRows.map((r) => [Number(r.item_product_id), Number(r.reserved_qty) || 0]));

  const errors = [];
  for (const item of items) {
    const available = (openQtyByProduct.get(item.product_id) || 0) - (reservedByProduct.get(item.product_id) || 0);
    if (available < item.qty) {
      errors.push(`${item.product_name} has only ${Math.max(available, 0)} available right now, requested ${item.qty}`);
    }
  }
  return errors.length ? { status: false, errors } : { status: true };
}

export const createStorefrontCheckout = async (req) => {
  try {
    const { companySlug } = req.params;
    const { items, address, shipping_address, pincode, guest_mobile_number, guest_person_name, payment_method } = req.body || {};

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

    const isCash = payment_method === "cash";
    const isBank = payment_method === "bank";
    const isUpi = payment_method === "upi";
    const isOffline = isCash || isBank || isUpi;
    const methodEnabled = isCash
      ? settings.payment_cash_enabled
      : isBank
        ? settings.payment_bank_enabled
        : isUpi
          ? settings.payment_upi_enabled
          : settings.payment_razorpay_enabled;
    if (!methodEnabled) {
      return resError({ ack_msg: "This payment method is not available for this store." });
    }
    const offlineStageId = isCash ? settings.cash_stage_status_id : isBank ? settings.bank_stage_status_id : isUpi ? settings.upi_stage_status_id : null;
    if (isOffline && !offlineStageId) {
      return resError({ ack_msg: "This store hasn't configured the stage for this payment method yet." });
    }

    const { contact, error: contactError } = await resolveOrderingContact({
      tenantDB: resolved.tenantDB,
      company_masters_id: resolved.company_masters_id,
      session,
      guest_mobile_number,
      guest_person_name,
    });
    if (contactError) return resError({ ack_msg: contactError });

    // Price visibility: a customer who is not shown prices cannot check out either (no calling this API around the
    // hidden price). They ask for a rate in the store chat instead.
    if (await arePricesHidden(req, resolved, settings)) {
      return resError({ ack_msg: "Prices are not shown for you on this store, so this order can't be placed online. Please ask for a rate." });
    }

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

    // Quantity slabs override the single price per product, using the TOTAL qty
    // ordered for that product (the same product may appear on two lines).
    const qtyByProductId = new Map();
    for (const i of items) {
      const id = Number(i.product_id);
      qtyByProductId.set(id, (qtyByProductId.get(id) || 0) + (Number(i.qty) || 1));
    }
    const slabContext = await loadQtySlabs(resolved.tenantDB, {
      contactPriceListId: contact.assinged_to_price_list || null,
      defaultPriceListId,
      productIds: products.map((p) => p.id),
    });
    for (const p of products) {
      const slab = pickSlab(slabsForProduct(slabContext, p.id), qtyByProductId.get(p.id) || 1);
      if (slab) priceByProductId.set(p.id, { rate: slab.rate, net_rate: slab.net_rate });
    }

    const nowFormatted = moment().format("YYYY-MM-DD HH:mm:ss");
    let totalQty = 0;
    let totalAmt = 0;
    let taxableAmt = 0; // before-tax value of the lines (rate x qty) - the cart's taxable_amt
    const cartItemsToCreate = [];
    const stockItems = [];
    for (const i of items) {
      const p = productById.get(Number(i.product_id));
      const price = priceByProductId.get(p.id) || { rate: p.rate, net_rate: p.net_rate };
      const qty = Number(i.qty) || 1;
      const itemTotal = Number((Number(price.net_rate) * qty).toFixed(2));
      totalQty += qty;
      totalAmt += itemTotal;
      taxableAmt += Number(price.rate) * qty;
      stockItems.push({ product_id: p.id, qty, product_name: p.product_name });
      cartItemsToCreate.push({
        cart_type: 2,
        company_masters_id: resolved.company_masters_id,
        a_application_login_id: resolved.a_application_login_id,
        // Explicit, not relying on MySQL's non-strict-mode implicit-0 for an
        // omitted NOT NULL column (that's what silently made this "work"
        // before - an EXPLICIT null, as a raw-SQL test insert found out, is
        // rejected even under non-strict mode). 0 is this schema's real "no
        // specific warehouse" sentinel - see checkDerivedStock's own comment.
        item_warehouse_id: 0,
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
    const grandTotal = Number(totalAmt.toFixed(2));

    // P5: credit-limit check (logged-in only - a guest contact never has
    // credit_limit set, so this is naturally a no-op for B2C). Checked BEFORE
    // any stock check or transaction - a hard block shouldn't burn a stock
    // reservation or run any other work first.
    let creditWarning = false;
    if (session && contact.credit_limit) {
      const { overLimit } = await checkCreditLimit(resolved.tenantDB, resolved.company_masters_id, contact, grandTotal);
      if (overLimit) {
        if (settings.credit_limit_action === "block") {
          return resError({ ack_msg: "This order exceeds your account's credit limit. Please contact us to proceed." });
        }
        creditWarning = true;
      }
    }

    // P5: approval mode (logged-in only, same reasoning as credit-limit above -
    // this is a B2B workflow, not something that should apply to anonymous
    // B2C guests). The cart stays a plain draft (cart_status 0, no cart_number)
    // exactly like today's default - "approval" is just the storefront
    // skipping its own payment step, not a new backend status machine.
    const isApprovalMode = Boolean(session) && Boolean(settings.approval_mode_enabled);
    // Cash is also a no-payment draft, so it never reserves stock either.
    const isDraftOnly = isApprovalMode || isOffline;

    // Bug caught during live P5 verification: reservedMode must also depend on
    // the company's OWN strict-stock-check setting (same gate checkDerivedStock
    // already applies) - without this, a company with stock checking off
    // (mode 0) or warehouse-wise (mode 2, no picker UI exists for the
    // storefront) would still get every checkout locked/reserved against
    // reserveStockForCheckout, contradicting the settings UI's own text
    // ("Only takes effect when strict stock checking is already on") and
    // checkDerivedStock's own mode 0/2 short-circuit.
    const stockMode = await getStorefrontStockCheckMode(resolved.company_masters_id);
    const reservedMode = !isDraftOnly && stockMode === 1 && settings.stock_check_mode === "reserved";
    let cartStatus = 0;

    if (!reservedMode) {
      // Unchanged P4 path - derived calc, outside any transaction.
      const stockResult = await checkDerivedStock(resolved.tenantDB, resolved.company_masters_id, stockItems);
      if (!stockResult.status) {
        return resError({ ack_msg: stockResult.errors.join("; ") });
      }
    }

    const remarkSuffix = [creditWarning ? "OVER CREDIT LIMIT" : null, isApprovalMode ? "Awaiting approval" : null, isCash ? "Cash payment" : null, isBank ? "Bank transfer" : null, isUpi ? "UPI payment" : null].filter(Boolean).join(" - ");
    const cartBody = {
      type: 2,
      cart_date: moment().format("YYYY-MM-DD"),
      cart_remark: remarkSuffix ? `Storefront order - ${remarkSuffix}` : "Storefront order",
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
      cart_status: cartStatus, // reassigned below for reserved mode, inside the transaction.
      total_qty: totalQty,
      total_amt: grandTotal,
      // Without these the order's tax split read as 0 everywhere (CRM order view, print, storefront order page).
      taxable_amt: Number(taxableAmt.toFixed(2)),
      gst_amt: Number((grandTotal - taxableAmt).toFixed(2)),
      grand_total: grandTotal,
    };

    // A cash order (not approval mode, which stays a plain draft) is a real
    // order straight away: it gets the configured cash stage and an order
    // number, the same two things a confirmed Razorpay payment sets.
    const isCashOrder = isOffline && !isApprovalMode;
    if (isCashOrder) {
      const numberSeries = await getNumberSeries(resolved.company_masters_id, cartBody.type, cartBody.cart_date, null, { tenantDB: resolved.tenantDB });
      if (numberSeries?.ack === 0) {
        return resError({ ack_msg: "Order numbering failed. Please try again.", developer_msg: numberSeries?.developer_msg });
      }
      cartBody.cart_status = offlineStageId;
      cartBody.cart_number = numberSeries.order_no;
      cartBody.sr_by_number = numberSeries.sr_by_no;
      cartBody.sr_by_prifix = numberSeries.sr_by_prifix;
    }

    const t = await resolved.tenantDB.transaction();
    try {
      if (reservedMode) {
        const reserveResult = await reserveStockForCheckout(resolved.tenantDB, t, resolved.company_masters_id, stockItems);
        if (!reserveResult.status) {
          await t.rollback();
          return resError({ ack_msg: reserveResult.errors.join("; ") });
        }
        cartBody.cart_status = STOREFRONT_RESERVED_CART_STATUS;
      }

      const cart = await cartModel(resolved.tenantDB).create(cartBody, { transaction: t });
      await cartItemModel(resolved.tenantDB).bulkCreate(
        cartItemsToCreate.map((ci) => ({ ...ci, cart_id: cart.id })),
        { transaction: t }
      );
      await t.commit();
      return resSuccess({
        ack_msg: "Order placed",
        data: {
          item: {
            cart_id: cart.id,
            grand_total: grandTotal,
            requires_approval: isApprovalMode,
            pay_by_cash: isCashOrder,
            payment_method: isCashOrder ? (isBank ? "bank" : isUpi ? "upi" : "cash") : "razorpay",
            cart_number: cartBody.cart_number || null,
            credit_warning: creditWarning,
          },
        },
      });
    } catch (txError) {
      await t.rollback();
      throw txError;
    }
  } catch (error) {
    return resError({ developer_msg: `createStorefrontCheckout failed: ${error}` });
  }
};
