import { QueryTypes } from "sequelize";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

// Logged-in customer's own history for the storefront Account page. Both reads are scoped to the
// session's contact_master_id (requireStorefrontSession) - never to an id the client sends - so a
// customer can only ever see their own rows. Raw reads keep the exposed fields explicit.

const LIMIT = 100;

// paymentTypesList / paymentModeList in the CRM's CreateAccountTransactionController.ts. Worded from the
// CUSTOMER's side: the CRM's "Credit (Receipt)" is money the customer paid in; "Debit (Payment)" is money paid out to them.
const TYPE_LABELS = { 1: "Payment made", 2: "Refund / payment to you" };

// CRM remarks are rich text (<p>..<br>..) - the storefront shows plain text.
const plainText = (html) =>
  String(html ?? "")
    .replace(/<br\s*\/?>|<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const MODE_LABELS = { 1: "Cash", 2: "Cheque", 3: "Online", 4: "UPI", 5: "Bank transfer (NEFT)", 6: "Bank transfer (RTGS)", 7: "Bank transfer (IMPS)", [-1]: "Other" };

/** GET /storefront/me/orders - the customer's sales orders (carts type 2), newest first, with their lines. */
export const getStorefrontMyOrders = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const db = req.tenantDB;

    const orders = await db.query(
      `SELECT c.id, c.cart_number, c.cart_date, c.cart_status, c.grand_total, c.total_qty, c.cart_remark,
              s.name AS stage_name, s.color AS stage_color
         FROM carts c
         LEFT JOIN stage_status_masters s ON s.id = c.cart_status AND s.isDelete = 0
        WHERE c.to_customer_id = :contact AND c.company_masters_id = :company AND c.type = 2 AND c.isDelete = 0
        ORDER BY c.id DESC
        LIMIT ${LIMIT}`,
      { replacements: { contact: contact_master_id, company: company_masters_id }, type: QueryTypes.SELECT }
    );

    const lines = orders.length
      ? await db.query(
          `SELECT cart_id, item_product_name, item_unit_name, item_qty, item_net_rate, item_total
             FROM cart_items
            WHERE cart_id IN (:ids) AND isDelete = 0
            ORDER BY id ASC`,
          { replacements: { ids: orders.map((o) => o.id) }, type: QueryTypes.SELECT }
        )
      : [];
    const byCart = new Map();
    for (const l of lines) {
      const list = byCart.get(l.cart_id) || [];
      list.push({ name: l.item_product_name, unit: l.item_unit_name || null, qty: l.item_qty, rate: l.item_net_rate, total: l.item_total });
      byCart.set(l.cart_id, list);
    }

    return resSuccess({
      data: {
        item: orders.map((o) => ({
          id: o.id,
          // An unpaid online checkout is a plain draft with no number yet - the storefront shows it as "Pending".
          order_number: o.cart_number || null,
          date: o.cart_date,
          status: o.stage_name || null,
          status_color: o.stage_color || null,
          total: o.grand_total,
          qty: o.total_qty,
          remark: plainText(o.cart_remark) || null,
          items: byCart.get(o.id) || [],
        })),
      },
    });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontMyOrders failed: ${error}` });
  }
};

/** GET /storefront/me/transactions - the customer's account transactions (payments), newest first. */
export const getStorefrontMyTransactions = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const db = req.tenantDB;

    const rows = await db.query(
      `SELECT t.id, t.type, t.mode, t.amount, t.payment_date_time, t.remark, t.reference_table, t.reference_id,
              t.gateway_payment_id, c.cart_number
         FROM account_transactions t
         LEFT JOIN carts c ON t.reference_table = 'carts' AND c.id = t.reference_id
        WHERE t.contact_masters_id = :contact AND t.company_masters_id = :company AND t.isDelete = 0
        ORDER BY t.payment_date_time DESC, t.id DESC
        LIMIT ${LIMIT}`,
      { replacements: { contact: contact_master_id, company: company_masters_id }, type: QueryTypes.SELECT }
    );

    const items = rows.map((r) => ({
      id: r.id,
      date: r.payment_date_time,
      type: TYPE_LABELS[r.type] || "Transaction",
      direction: Number(r.type) === 2 ? "debit" : "credit",
      mode: MODE_LABELS[r.mode] || "Other",
      amount: r.amount,
      remark: plainText(r.remark) || null,
      order_number: r.cart_number || null,
      reference: r.gateway_payment_id || null,
    }));
    const sum = (dir) => items.filter((i) => i.direction === dir).reduce((a, i) => a + Number(i.amount || 0), 0);

    return resSuccess({ data: { item: { transactions: items, total_received: sum("credit"), total_paid: sum("debit") } } });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontMyTransactions failed: ${error}` });
  }
};

/** GET /storefront/me/orders/:id - one of the customer's own orders in full (lines, tax split, addresses). */
export const getStorefrontMyOrder = async (req) => {
  try {
    const { contact_master_id, company_masters_id } = req.storefrontSession;
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId)) return resError({ ack_msg: "Order not found" });
    const db = req.tenantDB;

    // Scoped to the session's own contact in the WHERE - another customer's id simply finds nothing.
    const [order] = await db.query(
      `SELECT c.id, c.cart_number, c.cart_date, c.cart_status, c.total_amt, c.taxable_amt, c.gst_amt, c.round_off,
              c.grand_total, c.total_qty, c.cart_remark, c.shipping_address,
              c.to_customer_name, c.to_customer_phone, c.to_customer_email,
              s.name AS stage_name, s.color AS stage_color
         FROM carts c
         LEFT JOIN stage_status_masters s ON s.id = c.cart_status AND s.isDelete = 0
        WHERE c.id = :id AND c.to_customer_id = :contact AND c.company_masters_id = :company AND c.type = 2 AND c.isDelete = 0
        LIMIT 1`,
      { replacements: { id: orderId, contact: contact_master_id, company: company_masters_id }, type: QueryTypes.SELECT }
    );
    if (!order) return resError({ ack_msg: "Order not found" });

    const lines = await db.query(
      `SELECT item_product_name, item_unit_name, item_product_code, item_hsn_code, item_qty, item_rate, item_gst, item_net_rate, item_total
         FROM cart_items WHERE cart_id = :id AND isDelete = 0 ORDER BY id ASC`,
      { replacements: { id: orderId }, type: QueryTypes.SELECT }
    );

    // Storefront checkout saves the order total but not the tax split on the cart row (taxable_amt/gst_amt stay 0),
    // so derive it from the lines: taxable = rate x qty, GST = the rest of each line total.
    const linesTaxable = lines.reduce((a, l) => a + Number(l.item_rate || 0) * Number(l.item_qty || 0), 0);
    const linesGst = lines.reduce((a, l) => a + (Number(l.item_total || 0) - Number(l.item_rate || 0) * Number(l.item_qty || 0)), 0);
    const hasSplit = Number(order.taxable_amt) > 0 || Number(order.gst_amt) > 0;
    const taxable = hasSplit ? order.taxable_amt : Math.round(linesTaxable * 100) / 100;
    const gst = hasSplit ? order.gst_amt : Math.round(linesGst * 100) / 100;

    return resSuccess({
      data: {
        item: {
          id: order.id,
          order_number: order.cart_number || null,
          date: order.cart_date,
          status: order.stage_name || null,
          status_color: order.stage_color || null,
          subtotal: order.total_amt,
          taxable: taxable,
          gst: gst,
          round_off: order.round_off,
          total: order.grand_total,
          qty: order.total_qty,
          remark: plainText(order.cart_remark) || null,
          shipping_address: plainText(order.shipping_address) || null,
          customer: { name: order.to_customer_name || null, phone: order.to_customer_phone || null, email: order.to_customer_email || null },
          items: lines.map((l) => ({
            name: l.item_product_name,
            unit: l.item_unit_name || null,
            code: l.item_product_code || null,
            hsn: l.item_hsn_code || null,
            qty: l.item_qty,
            rate: l.item_rate,
            gst_percent: l.item_gst,
            net_rate: l.item_net_rate,
            total: l.item_total,
          })),
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `getStorefrontMyOrder failed: ${error}` });
  }
};
