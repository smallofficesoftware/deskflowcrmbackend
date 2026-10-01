import { Op } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { isFeatureEnabled } from "../company_setup/featureFlagServices.js";

// An account transaction can optionally point at a cart (carts.type values:
// 1 Quotation, 2 Sales Order, 3 Sales Invoice, 4 Purchase Invoice,
// 5 Purchase Order, 6 Sales Return, 7 Purchase Return, 12 Proforma).
// Link is stored in the existing account_transactions.reference_table /
// reference_id columns, so no schema change.
export const CART_LINK_REFERENCE_TABLE = "carts";

// account_transactions.type: 1 = Credit (Receipt), 2 = Debit (Payment)
export const CART_TYPES_BY_TRANSACTION_TYPE = {
  1: [3, 2, 12, 7],
  2: [4, 5, 6],
};

const CART_TYPE_LABEL = {
  1: "Quotation",
  2: "Sales Order",
  3: "Sales Invoice",
  4: "Purchase Invoice",
  5: "Purchase Order",
  6: "Sales Return",
  7: "Purchase Return",
  12: "Proforma Invoice",
};

// Returns { cart } when cart_id is linkable to this contact + transaction
// type, else { error }. Used by create to validate the optional cart_id.
export const validateCartLink = async (tenantDB, { cart_id, contact_masters_id, type, company_masters_id }) => {
  const allowedTypes = CART_TYPES_BY_TRANSACTION_TYPE[Number(type)];
  if (!allowedTypes) return { error: "Invalid payment type" };

  const cart = await cartModel(tenantDB).findOne({
    where: { id: cart_id, company_masters_id, isDelete: 0 },
    attributes: ["id", "type", "to_customer_id", "grand_total"],
    raw: true,
  });
  if (!cart) return { error: "Selected cart not found" };
  if (Number(cart.to_customer_id) !== Number(contact_masters_id)) {
    return { error: "Selected cart belongs to a different contact" };
  }
  if (!allowedTypes.includes(Number(cart.type))) {
    return { error: `${CART_TYPE_LABEL[cart.type] || "This cart type"} cannot be linked to this payment type` };
  }
  return { cart };
};

// Per-company switches, stored as company_feature_flags rows (no schema
// change; toggled from the company Module Settings screen).
export const ACCOUNT_TRANSACTION_BILL_TO_BILL_KEY = "accountTransaction_bill_to_bill";
export const ACCOUNT_TRANSACTION_BLOCK_OVERPAYMENT_KEY = "accountTransaction_block_overpayment";

export const getCartLinkSettings = async (company_masters_id) => ({
  bill_to_bill: await isFeatureEnabled(company_masters_id, ACCOUNT_TRANSACTION_BILL_TO_BILL_KEY),
  block_overpayment: await isFeatureEnabled(company_masters_id, ACCOUNT_TRANSACTION_BLOCK_OVERPAYMENT_KEY),
});

// Excel import: resolve a sheet's cart_number to a cart id for this contact,
// limited to the cart types allowed for the row's transaction type.
export const resolveCartIdByNumber = async (tenantDB, { cart_number, contact_masters_id, type, company_masters_id }) => {
  const allowedTypes = CART_TYPES_BY_TRANSACTION_TYPE[Number(type)];
  if (!allowedTypes) return { error: "Invalid payment type" };
  const carts = await cartModel(tenantDB).findAll({
    where: {
      company_masters_id,
      to_customer_id: contact_masters_id,
      cart_number: String(cart_number).trim(),
      type: { [Op.in]: allowedTypes },
      isDelete: 0,
    },
    attributes: ["id"],
    raw: true,
  });
  if (!carts.length) return { error: `Cart '${cart_number}' not found for this contact and payment type` };
  if (carts.length > 1) return { error: `Cart number '${cart_number}' matches more than one cart` };
  return { cart_id: carts[0].id };
};

// Applies the two company settings + the base link rules. Returns an error
// message, or null when the transaction may be saved.
//  - bill_to_bill: every transaction must be linked to a cart.
//  - block_overpayment: amount may not exceed the cart's remaining amount
//    (cart total minus all other non-deleted linked transactions, approved
//    or not, so two unapproved entries cannot together overpay).
// settings may be passed in (bulk import reads them once); extraCommitted is
// the amount already queued against this cart earlier in the same import.
export const checkCartLinkRules = async (
  tenantDB,
  { cart_id, contact_masters_id, type, amount, company_masters_id, excludeTransactionId, settings: preloadedSettings, extraCommitted = 0, isAutoReverse = false }
) => {
  const settings = preloadedSettings || (await getCartLinkSettings(company_masters_id));
  if (!cart_id) {
    return settings.bill_to_bill && !isAutoReverse ?"Bill to bill payment is on: please select a cart to link" : null;
  }
  const { cart, error } = await validateCartLink(tenantDB, { cart_id, contact_masters_id, type, company_masters_id });
  if (error) return error;
  if (settings.block_overpayment) {
    const committed = (await getPaidAmountByCartId(tenantDB, company_masters_id, [cart.id], true, excludeTransactionId)).get(Number(cart.id)) || 0;
    const available = (Number(cart.grand_total) || 0) - committed - extraCommitted;
    if (Number(amount) > available + 0.005) {
      return `Amount exceeds the pending amount of this cart (${Math.max(available, 0).toFixed(2)})`;
    }
  }
  return null;
};

// Sum of transactions linked to each of the given cart ids. Approved only by
// default (report); includeUnapproved counts every non-deleted one (picker +
// over-payment guard).
const getPaidAmountByCartId = async (
  tenantDB,
  company_masters_id,
  cartIds,
  includeUnapproved = false,
  excludeTransactionId = null
) => {
  const paidMap = new Map();
  if (!cartIds.length) return paidMap;
  const where = {
    company_masters_id,
    isDelete: 0,
    reference_table: CART_LINK_REFERENCE_TABLE,
    reference_id: { [Op.in]: cartIds },
  };
  if (!includeUnapproved) where.approve_by_a_application_login_id = { [Op.ne]: 0 };
  if (excludeTransactionId) where.id = { [Op.ne]: excludeTransactionId };
  const rows = await accountTransactionsModel(tenantDB).findAll({
    where,
    attributes: ["reference_id", "amount"],
    raw: true,
  });
  for (const r of rows) {
    paidMap.set(Number(r.reference_id), (paidMap.get(Number(r.reference_id)) || 0) + (Number(r.amount) || 0));
  }
  return paidMap;
};

// { reference_id -> { cart_number, cart_type_name } } for list screens.
export const getCartInfoMap = async (tenantDB, company_masters_id, rows) => {
  const ids = [
    ...new Set(
      rows
        .filter((r) => r.reference_table === CART_LINK_REFERENCE_TABLE && r.reference_id)
        .map((r) => Number(r.reference_id))
    ),
  ];
  const map = new Map();
  if (!ids.length) return map;
  const carts = await cartModel(tenantDB).findAll({
    where: { id: { [Op.in]: ids }, company_masters_id },
    attributes: ["id", "type", "cart_number"],
    raw: true,
  });
  for (const c of carts) {
    map.set(Number(c.id), { cart_number: c.cart_number, cart_type_name: CART_TYPE_LABEL[c.type] || "" });
  }
  return map;
};

// Sets or clears the cart link of an existing transaction (edit flow).
// The edit screen calls it twice: first with validate_only (plus the new
// type + amount) before the generic commonUpdate save, so a rejected link
// blocks the whole edit; then again after the save to write the link.
// body: { a_application_login_id, id, cart_id?, type?, amount?, validate_only? }
// - empty cart_id clears the link (rejected when bill-to-bill is on).
export const setAccountTransactionCartLink = async (req) => {
  try {
    const { a_application_login_id, id, cart_id, type, amount, validate_only } = req.body;
    if (!a_application_login_id || !id) {
      return resBadRequest({ ack_msg: "a_application_login_id and id are required" });
    }
    const { company_masters_id } = await getCompanyByLoginId(a_application_login_id);

    const AccountTransaction = accountTransactionsModel(req.tenantDB);
    const tx = await AccountTransaction.findOne({
      where: { id, company_masters_id, isDelete: 0 },
    });
    if (!tx) return resBadRequest({ ack_msg: "Transaction not found" });

    const ruleError = await checkCartLinkRules(req.tenantDB, {
      cart_id,
      contact_masters_id: tx.contact_masters_id,
      type: type || tx.type,
      amount: amount || tx.amount,
      company_masters_id,
      excludeTransactionId: tx.id,
    });
    if (ruleError) return resBadRequest({ ack_msg: ruleError });
    if (validate_only) return resSuccess({ ack_msg: "Cart link is valid" });

    if (cart_id) {
      await tx.update({ reference_table: CART_LINK_REFERENCE_TABLE, reference_id: cart_id });
    } else if (tx.reference_table === CART_LINK_REFERENCE_TABLE) {
      // only clear links we own; other reference_table values stay untouched
      await tx.update({ reference_table: null, reference_id: null });
    }
    return resSuccess({ ack_msg: "Cart link updated" });
  } catch (e) {
    return resBadRequest({ developer_msg: e.message });
  }
};

// Cart picker for the Create Account Transaction form.
// body: { a_application_login_id, contact_masters_id, type, exclude_transaction_id? }
export const getLinkableCarts = async (req) => {
  try {
    const { a_application_login_id, contact_masters_id, type, exclude_transaction_id } = req.body;
    if (!a_application_login_id || !contact_masters_id || !type) {
      return resBadRequest({ ack_msg: "a_application_login_id, contact_masters_id and type are required" });
    }
    const allowedTypes = CART_TYPES_BY_TRANSACTION_TYPE[Number(type)];
    if (!allowedTypes) return resBadRequest({ ack_msg: "Invalid payment type" });

    const { company_masters_id } = await getCompanyByLoginId(a_application_login_id);

    const carts = await cartModel(req.tenantDB).findAll({
      where: {
        company_masters_id,
        to_customer_id: contact_masters_id,
        type: { [Op.in]: allowedTypes },
        isDelete: 0,
      },
      attributes: ["id", "type", "cart_number", "cart_date", "grand_total"],
      order: [["cart_date", "DESC"], ["id", "DESC"]],
      raw: true,
    });

    // available = total minus every non-deleted linked transaction (same basis
    // as the over-payment guard); the edited transaction itself is excluded.
    const paidMap = await getPaidAmountByCartId(
      req.tenantDB,
      company_masters_id,
      carts.map((c) => c.id),
      true,
      exclude_transaction_id
    );
    const settings = await getCartLinkSettings(company_masters_id);

    return resSuccess({
      data: {
        ...settings,
        carts: carts.map((c) => {
          const paid = paidMap.get(Number(c.id)) || 0;
          const grand_total = Number(c.grand_total) || 0;
          return {
            id: c.id,
            type: c.type,
            cart_type_name: CART_TYPE_LABEL[c.type] || "",
            cart_number: c.cart_number,
            cart_date: c.cart_date,
            grand_total,
            paid_amount: paid,
            available_amount: grand_total - paid,
          };
        }),
      },
    });
  } catch (e) {
    return resBadRequest({ developer_msg: e.message });
  }
};

// Cart-wise payment report: one row per cart that has (or can have)
// transactions, with billed vs linked-paid vs pending.
// body: { a_application_login_id, ul, ll, contact_masters_id?, cart_types?[],
//         startDate?, endDate?, status? ("pending"|"paid"|"all"), linkedOnly? }
export const getCartPaymentReport = async (req) => {
  try {
    const {
      a_application_login_id,
      ul,
      ll,
      contact_masters_id,
      cart_types,
      startDate,
      endDate,
      status = "all",
      linkedOnly = 0,
    } = req.body;
    if (!a_application_login_id) return resBadRequest({ ack_msg: "a_application_login_id is required" });

    const { company_masters_id } = await getCompanyByLoginId(a_application_login_id);

    const rights = await getUserRights({
      company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.ACCOUNT_HISTORY,
      tenentId: req.tenantDB,
    });
    const personalOnly = rights.showPersonalData && !rights.showAllData;

    const billingTypes = [...new Set(Object.values(CART_TYPES_BY_TRANSACTION_TYPE).flat())];
    const requestedTypes = (Array.isArray(cart_types) ? cart_types : [])
      .map(Number)
      .filter((t) => billingTypes.includes(t));

    const where = {
      company_masters_id,
      isDelete: 0,
      type: { [Op.in]: requestedTypes.length ? requestedTypes : billingTypes },
    };
    if (contact_masters_id) where.to_customer_id = contact_masters_id;
    if (personalOnly) where.a_application_login_id = a_application_login_id;
    if (startDate && endDate) where.cart_date = { [Op.between]: [startDate, endDate] };

    const carts = await cartModel(req.tenantDB).findAll({
      where,
      attributes: ["id", "type", "cart_number", "cart_date", "to_customer_id", "to_customer_name", "grand_total"],
      order: [["cart_date", "DESC"], ["id", "DESC"]],
      raw: true,
    });

    const paidMap = await getPaidAmountByCartId(req.tenantDB, company_masters_id, carts.map((c) => c.id));

    let rows = carts.map((c) => {
      const grand_total = Number(c.grand_total) || 0;
      const paid_amount = paidMap.get(Number(c.id)) || 0;
      return {
        cart_id: c.id,
        cart_type: c.type,
        cart_type_name: CART_TYPE_LABEL[c.type] || "",
        cart_number: c.cart_number,
        cart_date: c.cart_date,
        contact_masters_id: c.to_customer_id,
        contact_name: c.to_customer_name,
        grand_total,
        paid_amount,
        pending_amount: grand_total - paid_amount,
      };
    });

    if (Number(linkedOnly) === 1) rows = rows.filter((r) => r.paid_amount > 0);
    if (status === "pending") rows = rows.filter((r) => r.pending_amount > 0);
    else if (status === "paid") rows = rows.filter((r) => r.pending_amount <= 0);

    const totals = rows.reduce(
      (t, r) => ({
        grand_total: t.grand_total + r.grand_total,
        paid_amount: t.paid_amount + r.paid_amount,
        pending_amount: t.pending_amount + r.pending_amount,
      }),
      { grand_total: 0, paid_amount: 0, pending_amount: 0 }
    );

    const total_count = rows.length;
    if (ul !== undefined && ll !== undefined) rows = rows.slice(Number(ul), Number(ul) + Number(ll));

    return resSuccess({ data: { item: rows, totals, total_count } });
  } catch (e) {
    return resBadRequest({ developer_msg: e.message });
  }
};
