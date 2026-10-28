import { Op } from "sequelize";
import { productVariantAttributeModel } from "../../models/product_settings/productVariantAttributeModel.js";
import { productVariantAttributeValueModel } from "../../models/product_settings/productVariantAttributeValueModel.js";
import { getVariants } from "../product_settings/productVariantServices.js";

// Thin wrapper reusing the EXACT same variant-LIST logic the CRM's own
// ProductVariantSection/SelectVariantModal already rely on
// (productVariantServices.js's getVariants, which only needs {body, tenantDB} -
// a minimal synthetic req works without duplicating that query).

/** Attributes + their values for a parent product, same shape getVariantAttributes
 * returns - but queried directly by the ALREADY-RESOLVED company_masters_id
 * (storefrontCompanyResolver.js) instead of reusing getVariantAttributes itself,
 * because that function re-derives company_masters_id from a_application_login_id
 * via getCompanyByLoginId() - in this data set that login id resolves to a
 * DIFFERENT company than the one actually owning this product/attribute rows
 * (two companies sharing one login), so re-deriving it here would silently
 * return zero attributes for a parent that genuinely has them. */
export const getVariantAttributesForParent = async (tenantDB, company_masters_id, parent_product_id) => {
  const AttributeModel = productVariantAttributeModel(tenantDB);
  const ValueModel = productVariantAttributeValueModel(tenantDB);

  const attributes = await AttributeModel.findAll({
    where: { parent_product_id, company_masters_id, isDelete: 0 },
    order: [["display_order", "ASC"], ["id", "ASC"]],
    raw: true,
  });

  const attributeIds = attributes.map((a) => a.id);
  const values = attributeIds.length
    ? await ValueModel.findAll({
        where: { product_variant_attribute_id: { [Op.in]: attributeIds }, isDelete: 0 },
        order: [["display_order", "ASC"], ["id", "ASC"]],
        raw: true,
      })
    : [];

  return attributes.map((attribute) => ({
    ...attribute,
    values: values.filter((v) => v.product_variant_attribute_id === attribute.id),
  }));
};

export const getVariantsForParent = async (tenantDB, parent_product_id) => {
  const result = await getVariants({ body: { parent_product_id }, tenantDB });
  return result?.data?.item || [];
};
