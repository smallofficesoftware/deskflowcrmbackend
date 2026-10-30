import { QueryTypes } from "sequelize";

// Where an Attribute Master attribute / value is used (Settings > Attribute Master). Removing one that a product still
// uses is refused. "Used" means a live variant row of a product that is itself not deleted: deleting a product does not
// clear its variant attribute rows, so counting those alone would let a deleted product block a value forever.

const MAX_NAMES = 3;

/** Products (id, name) that use this attribute master, A to Z. */
export const productsUsingAttribute = (tenantDB, attributeMasterId) =>
  tenantDB.query(
    `SELECT DISTINCT p.id, p.product_name
       FROM product_variant_attributes a
       JOIN products p ON p.id = a.parent_product_id AND p.isDelete = 0
      WHERE a.isDelete = 0 AND a.product_attribute_master_id = :id
      ORDER BY p.product_name ASC`,
    { replacements: { id: attributeMasterId }, type: QueryTypes.SELECT }
  );

/** Products (id, name) that use this attribute value master, A to Z. */
export const productsUsingAttributeValue = (tenantDB, valueMasterId) =>
  tenantDB.query(
    `SELECT DISTINCT p.id, p.product_name
       FROM product_variant_attribute_values v
       JOIN product_variant_attributes a ON a.id = v.product_variant_attribute_id AND a.isDelete = 0
       JOIN products p ON p.id = a.parent_product_id AND p.isDelete = 0
      WHERE v.isDelete = 0 AND v.product_attribute_value_master_id = :id
      ORDER BY p.product_name ASC`,
    { replacements: { id: valueMasterId }, type: QueryTypes.SELECT }
  );

/** "Sofa Set, Wooden Bed, Hammer and 2 more" - a short list the customer can act on. */
const nameList = (products) => {
  const names = products.slice(0, MAX_NAMES).map((p) => p.product_name || `Product #${p.id}`);
  const more = products.length - names.length;
  return more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
};

/** The message shown when removing is refused. `what` is "attribute" or "value". */
export const inUseMessage = (what, products) =>
  `This ${what} is used in ${products.length} product${products.length === 1 ? "" : "s"} (${nameList(products)}), so it cannot be removed. ` +
  `Remove it from ${products.length === 1 ? "that product" : "those products"} first.`;
