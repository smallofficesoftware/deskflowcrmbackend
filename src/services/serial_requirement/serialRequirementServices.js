import { Op } from "sequelize";
import { productSellerFilter } from "../product_settings/productSellerGuard.js";
import { cartSerialNumberModel } from "../../models/activities/cartSerialNumberModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { resBadRequest, resSuccess } from "../../utils/sharedFunctions.js";

// products.is_serial_number: 1 => Off, 2 => On (see alter.txt)
const SERIAL_NUMBER_ON = 2;

/** True when the company has at least one serial-tracked product. */
export const isSerialSystemOn = async (tenantDB) => {
  const count = await productModel(tenantDB).count({
    where: { is_serial_number: SERIAL_NUMBER_ON, isDelete: 0 },
  });
  return count > 0;
};

/**
 * Finds the serial-tracked product a serial number belongs to.
 * Returns { product_id, product_name } or null when the serial is unknown.
 */
export const findProductBySerial = async (tenantDB, serialNumber) => {
  const serial = String(serialNumber ?? "").trim();
  if (!serial) return null;

  const rows = await cartSerialNumberModel(tenantDB).findAll({
    where: { serial_numbers: serial, isDelete: 0 },
    attributes: ["product_id"],
    group: ["product_id"],
    raw: true,
  });
  const productIds = rows.map((r) => r.product_id).filter(Boolean);
  if (productIds.length === 0) return null;

  const product = await productModel(tenantDB).findOne({
    where: { id: productIds, is_serial_number: SERIAL_NUMBER_ON, isDelete: 0 },
    attributes: ["id", "product_name"],
    raw: true,
  });
  return product ? { product_id: product.id, product_name: product.product_name } : null;
};

/**
 * Pulls serial_number out of a (possibly multipart) body as a DB-ready value:
 * "", "null" and "undefined" become null.
 */
export const pickSerial = (body = {}) => {
  const s = String(body.serial_number ?? "").trim();
  return s === "" || s === "null" || s === "undefined" ? null : s;
};

/** Pulls product_id out of a (possibly multipart) body as a positive integer or null. */
export const pickProductId = (body = {}) => {
  const id = Number.parseInt(body.product_id, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * Shared guard for Task, Support Ticket and Visit.
 * - product_id sent (the forms' Product dropdown): the product must exist. A
 *   serial-tracked product also needs a serial that belongs to it; any other
 *   product stores no serial.
 * - No product_id (older clients, serial-only): falls through to the rules below.
 * - Serial system off (no serial-tracked product): never blocks, nothing stored.
 * - required: a missing serial is an error. Used on create; edits of older
 *   records without a serial are not forced to add one.
 * - A serial that is entered must belong to a serial-tracked product.
 * Returns { error } or { product_id, serial_number } to persist.
 */
export const resolveSerial = async (tenantDB, { serial_number, required, product_id }) => {
  const pickedProductId = pickProductId({ product_id });
  if (pickedProductId) {
    const picked = await productModel(tenantDB).findOne({
      where: { id: pickedProductId, isDelete: 0 },
      attributes: ["id", "is_serial_number"],
      raw: true,
    });
    if (!picked) return { error: "Product not found." };
    if (Number(picked.is_serial_number) !== SERIAL_NUMBER_ON) {
      return { product_id: picked.id, serial_number: null };
    }
    if (!serial_number) return { error: "Serial number is required for this product." };
    const owned = await cartSerialNumberModel(tenantDB).count({
      where: { serial_numbers: serial_number, product_id: picked.id, isDelete: 0 },
    });
    return owned
      ? { product_id: picked.id, serial_number }
      : { error: "Serial number not found for this product." };
  }
  if (!(await isSerialSystemOn(tenantDB))) {
    return { product_id: null, serial_number: null };
  }
  if (!serial_number) {
    return required
      ? { error: "Serial number is required." }
      : { product_id: null, serial_number: null };
  }
  const product = await findProductBySerial(tenantDB, serial_number);
  if (!product) return { error: "Serial number not found." };
  return { product_id: product.product_id, serial_number };
};

export const getSerialRequirement = async (req) => {
  try {
    return resSuccess({
      data: { is_serial_required: await isSerialSystemOn(req.tenantDB) },
      ack_msg: "Serial requirement fetched successfully.",
    });
  } catch (error) {
    return resBadRequest({
      ack_msg: error.message,
      developer_msg: "getSerialRequirement failed",
    });
  }
};

/** Product dropdown options for the Task / Support Ticket / Visit forms. */
export const getProductOptions = async (req) => {
  try {
    // Task / Visit product dropdown: team members only see products they are assigned to sell.
    const sellerFilter = await productSellerFilter(req);
    const products = await productModel(req.tenantDB).findAll({
      where: sellerFilter ? { isDelete: 0, [Op.and]: [sellerFilter] } : { isDelete: 0 },
      attributes: ["id", "product_name", "is_serial_number"],
      order: [["product_name", "ASC"]],
      raw: true,
    });
    return resSuccess({
      data: { item: products },
      ack_msg: "Products fetched successfully.",
    });
  } catch (error) {
    return resBadRequest({
      ack_msg: error.message,
      developer_msg: "getProductOptions failed",
    });
  }
};

export const lookupSerialNumber = async (req) => {
  try {
    const product = await findProductBySerial(req.tenantDB, req.body.serial_number);
    return resSuccess({
      data: { found: !!product, product_id: product?.product_id ?? null, product_name: product?.product_name ?? "" },
      ack_msg: product ? "Serial number found." : "Serial number not found.",
    });
  } catch (error) {
    return resBadRequest({
      ack_msg: error.message,
      developer_msg: "lookupSerialNumber failed",
    });
  }
};
