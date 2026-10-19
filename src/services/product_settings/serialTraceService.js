import { Op } from "sequelize";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartSerialNumberModel } from "../../models/activities/cartSerialNumberModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { visitsModel } from "../../models/activities/visitModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// cart_type: 1 Quotation, 2 Sales Order, 3 Sales Invoice, 4 Purchase Invoice,
// 5 Purchase Order, 6 Return Sales Invoice, 7 Return Purchase Invoice,
// 8 Inward, 9 Dispatch, 10 Stock Adjustment Inward, 11 Stock Adjustment Outward.
// Same in/out rules as SerialNumberWiseStockCheck: an invoice raised from a
// dispatch (reference_type 9) and a purchase raised from an inward
// (reference_type 8) do not move stock a second time.
const stockEffect = (item) => {
  if (Number(item.stock_type) === 0) return "none";
  const type = Number(item.cart_type);
  const refType = Number(item.reference_type);
  if ((type === 4 && refType !== 8) || type === 6 || type === 8 || type === 10) return "in";
  if ((type === 3 && refType !== 9) || type === 7 || type === 9 || type === 11) return "out";
  return "none";
};

const toTime = (value) => {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
};

const contactNameMap = async (tenantDB, ids) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const rows = await contactModel(tenantDB).findAll({
    where: { id: { [Op.in]: unique } },
    attributes: ["id", "person_name", "company_name"],
    raw: true,
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.person_name || r.company_name || ""]));
};

/**
 * Full life of one serial number: every document it was entered on (with the
 * documents converted from / to it), plus the tasks, support tickets and
 * visits filled in against it, oldest first.
 */
export const SerialNumberTrace = async (req) => {
  try {
    const serial = String(req.body.serial_number ?? "").trim();
    if (!serial) {
      return resError({
        ack_msg: "Serial Number is required",
        developer_msg: "serial_number is missing in request",
      });
    }

    const tenantDB = req.tenantDB;
    const cartItem = cartItemModel(tenantDB);

    const serialRows = await cartSerialNumberModel(tenantDB).findAll({
      where: { isDelete: 0, serial_numbers: serial },
      attributes: ["cart_item_id", "product_id"],
      raw: true,
    });

    const cartItemIds = [...new Set(serialRows.map((r) => r.cart_item_id).filter(Boolean))];
    const cartItems = cartItemIds.length
      ? await cartItem.findAll({
          where: { isDelete: 0, id: { [Op.in]: cartItemIds } },
          raw: true,
        })
      : [];

    // Documents this row was converted from (upstream) and into (downstream).
    const upstreamIds = [
      ...new Set(cartItems.map((i) => i.referance_cart_id).filter(Boolean)),
    ];
    const downstreamIds = [...new Set(cartItems.map((i) => String(i.cart_id)))];
    const [upstreamRows, downstreamRows] = await Promise.all([
      upstreamIds.length
        ? cartItem.findAll({
            where: { isDelete: 0, cart_id: { [Op.in]: upstreamIds } },
            attributes: ["cart_id", "cart_type", "cart_number", "item_product_id"],
            raw: true,
          })
        : [],
      cartItem.findAll({
        where: { isDelete: 0, referance_cart_id: { [Op.in]: downstreamIds } },
        attributes: [
          "referance_cart_id",
          "reference_type",
          "cart_type",
          "cart_number",
          "item_product_id",
        ],
        raw: true,
      }),
    ]);

    const [taskRows, visitRows] = await Promise.all([
      taskManagementModel(tenantDB).findAll({
        where: { isDelete: 0, serial_number: serial },
        attributes: [
          "id",
          "task_title",
          "is_support_ticket",
          "contact_masters_id",
          "task_fromdate",
          "completed_date",
        ],
        raw: true,
      }),
      visitsModel(tenantDB).findAll({
        where: { isDelete: 0, serial_number: serial },
        attributes: ["id", "remark", "contact_id", "start_date", "end_date"],
        raw: true,
      }),
    ]);

    if (!serialRows.length && !taskRows.length && !visitRows.length) {
      return resError({
        ack_msg: "Serial number not found",
        developer_msg: "No matching serial number found",
      });
    }

    const names = await contactNameMap(tenantDB, [
      ...cartItems.map((i) => i.contact_master_id),
      ...taskRows.map((t) => t.contact_masters_id),
      ...visitRows.map((v) => v.contact_id),
    ]);

    const events = [];

    cartItems.forEach((item) => {
      const effect = stockEffect(item);
      const linkedFrom = upstreamRows
        .filter(
          (u) =>
            String(u.cart_id) === String(item.referance_cart_id) &&
            Number(u.cart_type) === Number(item.reference_type) &&
            u.item_product_id === item.item_product_id
        )
        .map((u) => ({ cart_type: u.cart_type, cart_number: u.cart_number }));
      const linkedTo = downstreamRows
        .filter(
          (d) =>
            String(d.referance_cart_id) === String(item.cart_id) &&
            Number(d.reference_type) === Number(item.cart_type) &&
            d.item_product_id === item.item_product_id &&
            d.cart_number &&
            d.cart_number !== item.cart_number
        )
        .map((d) => ({ cart_type: d.cart_type, cart_number: d.cart_number }));

      const dedupe = (list) => [
        ...new Map(list.map((l) => [`${l.cart_type}:${l.cart_number}`, l])).values(),
      ];

      events.push({
        source: "document",
        id: item.id,
        date: item.cart_date,
        sort_time: toTime(item.cart_date || item.created_date_time),
        cart_type: item.cart_type,
        reference: item.cart_number || "",
        contact_name: names[item.contact_master_id] || "",
        qty: item.item_qty,
        amount: item.item_total,
        stock_effect: effect,
        linked_from: dedupe(linkedFrom),
        linked_to: dedupe(linkedTo),
      });
    });

    taskRows.forEach((task) => {
      events.push({
        source: task.is_support_ticket ? "support_ticket" : "task",
        id: task.id,
        date: task.task_fromdate,
        sort_time: toTime(task.task_fromdate),
        reference: `#${task.id}`,
        title: task.task_title,
        contact_name: names[task.contact_masters_id] || "",
        completed_date: task.completed_date,
      });
    });

    visitRows.forEach((visit) => {
      events.push({
        source: "visit",
        id: visit.id,
        date: visit.start_date,
        sort_time: toTime(visit.start_date),
        reference: `#${visit.id}`,
        title: visit.remark,
        contact_name: names[visit.contact_id] || "",
        completed_date: visit.end_date,
      });
    });

    events.sort((a, b) => a.sort_time - b.sort_time || a.id - b.id);

    const stockEvents = events.filter((e) => e.source === "document" && e.stock_effect !== "none");
    const balance = stockEvents.reduce(
      (total, e) => total + (e.stock_effect === "in" ? 1 : -1) * Number(e.qty || 0),
      0
    );
    const lastStock = stockEvents[stockEvents.length - 1];

    const productId = serialRows.find((r) => r.product_id)?.product_id;
    const product = productId
      ? await productModel(tenantDB).findOne({
          where: { id: productId },
          attributes: ["product_name"],
          raw: true,
        })
      : null;

    return resSuccess({
      data: {
        serial_number: serial,
        product_name: product?.product_name || "",
        stock_balance: balance,
        last_stock_effect: lastStock?.stock_effect || "none",
        last_party: lastStock?.contact_name || "",
        event_count: events.length,
        events: events.map(({ sort_time, ...rest }) => rest),
      },
    });
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};
