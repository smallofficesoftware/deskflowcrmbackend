import { priceListQtySlabModel } from "../../models/product_settings/priceListQtySlabModel.js";

// Quantity-based pricing. For each product the FIRST source that has any slabs
// wins, in this order: the contact's price list, the store's default price
// list, then the product's own base slabs (pricelist_masters_id 0). Inside the
// winning source the slab with the highest min_qty at or below the quantity is
// used; a quantity under the lowest slab keeps the normal single price.
export const loadQtySlabs = async (tenantDB, { contactPriceListId, defaultPriceListId, productIds }) => {
  const sources = [contactPriceListId, defaultPriceListId, 0].filter((v, i, a) => v !== null && v !== undefined && a.indexOf(v) === i);
  if (productIds.length === 0) return { sources, byProduct: new Map() };

  const rows = await priceListQtySlabModel(tenantDB).findAll({
    where: { pricelist_masters_id: sources.map(Number), product_id: productIds, isDelete: 0 },
    order: [["min_qty", "ASC"]],
    raw: true,
  });
  const byProduct = new Map();
  rows.forEach((r) => {
    const bySource = byProduct.get(r.product_id) || new Map();
    const list = bySource.get(r.pricelist_masters_id) || [];
    list.push(r);
    bySource.set(r.pricelist_masters_id, list);
    byProduct.set(r.product_id, bySource);
  });
  return { sources, byProduct };
};

/** The slabs that apply to one product (ascending by min_qty), or []. */
export const slabsForProduct = ({ sources, byProduct }, productId) => {
  const bySource = byProduct.get(productId);
  if (!bySource) return [];
  for (const source of sources) {
    const slabs = bySource.get(Number(source));
    if (slabs?.length) return slabs;
  }
  return [];
};

/** The slab to charge for `qty` units, or null (keep the normal price). */
export const pickSlab = (slabs, qty) => {
  let chosen = null;
  for (const s of slabs) if (s.min_qty <= qty) chosen = s;
  return chosen;
};
