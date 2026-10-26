import { priceListQtySlabModel } from "../../models/product_settings/priceListQtySlabModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

/** POST /qty-slabs/get { pricelist_masters_id (0 = product base), product_id } */
export const getQtySlabs = async (req) => {
  try {
    const { pricelist_masters_id = 0, product_id } = req.body;
    if (!product_id) return resBadRequest({ developer_msg: "product_id is required" });

    const items = await priceListQtySlabModel(req.tenantDB).findAll({
      where: { pricelist_masters_id: Number(pricelist_masters_id) || 0, product_id, isDelete: 0 },
      order: [["min_qty", "ASC"]],
      raw: true,
    });
    return resSuccess({ data: { items } });
  } catch (error) {
    return resError({ developer_msg: `getQtySlabs failed: ${error}` });
  }
};

/** POST /qty-slabs/save { a_application_login_id, pricelist_masters_id, product_id, slabs: [{min_qty, rate}] }
 * Replaces the whole slab set for that (list, product). net_rate = rate + the
 * product's GST, the same shape products/price_lists already store. */
export const saveQtySlabs = async (req) => {
  try {
    const { a_application_login_id, pricelist_masters_id = 0, product_id, slabs } = req.body;
    if (!product_id || !Array.isArray(slabs)) {
      return resBadRequest({ developer_msg: "product_id and slabs[] are required" });
    }

    const seen = new Set();
    for (const s of slabs) {
      const minQty = Number(s.min_qty);
      const rate = Number(s.rate);
      if (!Number.isInteger(minQty) || minQty < 2) {
        return resError({ ack_msg: "Each slab quantity must be a whole number of 2 or more." });
      }
      if (!(rate > 0)) return resError({ ack_msg: "Each slab needs a rate greater than 0." });
      if (seen.has(minQty)) return resError({ ack_msg: `Quantity ${minQty} appears more than once.` });
      seen.add(minQty);
    }

    const company = await getCompanyByLoginId(a_application_login_id);
    const product = await productModel(req.tenantDB).findOne({
      where: { id: product_id, isDelete: 0 },
      attributes: ["id", "GST"],
      raw: true,
    });
    if (!product) return resError({ ack_msg: "Product not found." });
    const gst = Number(product.GST) || 0;

    const listId = Number(pricelist_masters_id) || 0;
    const Slab = priceListQtySlabModel(req.tenantDB);
    const t = await req.tenantDB.transaction();
    try {
      await Slab.update({ isDelete: 1 }, { where: { pricelist_masters_id: listId, product_id, isDelete: 0 }, transaction: t });
      if (slabs.length) {
        await Slab.bulkCreate(
          slabs.map((s) => {
            const rate = Number(s.rate);
            return {
              company_masters_id: company.company_masters_id,
              a_application_login_id,
              pricelist_masters_id: listId,
              product_id,
              min_qty: Number(s.min_qty),
              rate,
              net_rate: Number((rate + (rate * gst) / 100).toFixed(2)),
              isDelete: 0,
            };
          }),
          { transaction: t }
        );
      }
      await t.commit();
    } catch (txError) {
      await t.rollback();
      throw txError;
    }
    return resSuccess({ ack_msg: "Quantity pricing saved" });
  } catch (error) {
    return resError({ developer_msg: `saveQtySlabs failed: ${error}` });
  }
};
