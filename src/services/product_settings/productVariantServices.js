import { Op } from "sequelize";
import { productAttributeMasterModel } from "../../models/product_settings/productAttributeMasterModel.js";
import { productAttributeValueMasterModel } from "../../models/product_settings/productAttributeValueMasterModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { productVariantAttributeModel } from "../../models/product_settings/productVariantAttributeModel.js";
import { productVariantAttributeValueModel } from "../../models/product_settings/productVariantAttributeValueModel.js";
import { productVariantOptionValueModel } from "../../models/product_settings/productVariantOptionValueModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

// Multi-variant products - plans/2026-10-18-product-variants-and-qty-pricing-plan.txt, 4.1.
// CRM-wide, not ecommerce-specific. A variant is a full products row (created via the
// existing /create-product with parent_product_id set) - this module only manages the
// attribute/value catalog and the links from a variant to its chosen values.

/** Attributes (e.g. "Color", "Size") + their values for one parent product, for the
 * variant-management section in CreateProductView.tsx. */
export const getVariantAttributes = async (req) => {
  try {
    const { a_application_login_id, parent_product_id } = req.body;
    if (!parent_product_id) {
      return resBadRequest({ developer_msg: "parent_product_id is required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const AttributeModel = productVariantAttributeModel(req.tenantDB);
    const ValueModel = productVariantAttributeValueModel(req.tenantDB);

    const attributes = await AttributeModel.findAll({
      where: {
        parent_product_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      order: [["display_order", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    const attributeIds = attributes.map((a) => a.id);
    const values = attributeIds.length
      ? await ValueModel.findAll({
          where: {
            product_variant_attribute_id: { [Op.in]: attributeIds },
            isDelete: 0,
          },
          order: [["display_order", "ASC"], ["id", "ASC"]],
          raw: true,
        })
      : [];

    const result = attributes.map((attribute) => ({
      ...attribute,
      values: values.filter((v) => v.product_variant_attribute_id === attribute.id),
    }));

    return resSuccess({ data: { item: result } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const createVariantAttribute = async (req) => {
  try {
    const { a_application_login_id, parent_product_id, product_attribute_master_id } = req.body;
    if (!parent_product_id || !product_attribute_master_id) {
      return resBadRequest({
        developer_msg: "parent_product_id and product_attribute_master_id are required",
      });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const AttributeMasterModel = productAttributeMasterModel(req.tenantDB);
    const master = await AttributeMasterModel.findOne({
      where: { id: product_attribute_master_id, isDelete: 0 },
    });
    if (!master) {
      return resError({ ack_msg: "Attribute not found in the catalog" });
    }

    const AttributeModel = productVariantAttributeModel(req.tenantDB);

    const duplicate = await AttributeModel.findOne({
      where: {
        parent_product_id,
        product_attribute_master_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
    });
    if (duplicate) {
      return resError({ ack_msg: "This attribute already exists for this product" });
    }

    const created = await AttributeModel.create({
      company_masters_id: findCompanyId.company_masters_id,
      parent_product_id,
      product_attribute_master_id,
      attribute_name: master.attribute_name,
    });

    return resSuccess({ ack_msg: "Attribute added", data: { item: created } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const deleteVariantAttribute = async (req) => {
  try {
    const { id } = req.body;
    if (!id) return resBadRequest({ developer_msg: "id is required" });

    const AttributeModel = productVariantAttributeModel(req.tenantDB);
    const ValueModel = productVariantAttributeValueModel(req.tenantDB);

    // Soft-delete the attribute's own values too, so stale rows don't linger
    // orphaned once the attribute they belonged to is gone.
    await ValueModel.update(
      { isDelete: 1 },
      { where: { product_variant_attribute_id: id } }
    );
    await AttributeModel.update({ isDelete: 1 }, { where: { id } });

    return resSuccess({ ack_msg: "Attribute removed" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const createVariantAttributeValue = async (req) => {
  try {
    const { a_application_login_id, product_variant_attribute_id, product_attribute_value_master_id } =
      req.body;
    if (!product_variant_attribute_id || !product_attribute_value_master_id) {
      return resBadRequest({
        developer_msg: "product_variant_attribute_id and product_attribute_value_master_id are required",
      });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const AttributeModel = productVariantAttributeModel(req.tenantDB);
    const attribute = await AttributeModel.findOne({
      where: { id: product_variant_attribute_id, isDelete: 0 },
    });
    if (!attribute) {
      return resBadRequest({ ack_msg: "Attribute not found" });
    }

    const ValueMasterModel = productAttributeValueMasterModel(req.tenantDB);
    const valueMaster = await ValueMasterModel.findOne({
      where: {
        id: product_attribute_value_master_id,
        product_attribute_master_id: attribute.product_attribute_master_id,
        isDelete: 0,
      },
    });
    if (!valueMaster) {
      return resError({ ack_msg: "This value does not belong to this attribute's catalog" });
    }

    const ValueModel = productVariantAttributeValueModel(req.tenantDB);

    const duplicate = await ValueModel.findOne({
      where: { product_variant_attribute_id, product_attribute_value_master_id, isDelete: 0 },
    });
    if (duplicate) {
      return resError({ ack_msg: "This value already exists for this attribute" });
    }

    const created = await ValueModel.create({
      company_masters_id: findCompanyId.company_masters_id,
      product_variant_attribute_id,
      product_attribute_value_master_id,
      value: valueMaster.value,
    });

    return resSuccess({ ack_msg: "Value added", data: { item: created } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const deleteVariantAttributeValue = async (req) => {
  try {
    const { id } = req.body;
    if (!id) return resBadRequest({ developer_msg: "id is required" });

    const ValueModel = productVariantAttributeValueModel(req.tenantDB);
    await ValueModel.update({ isDelete: 1 }, { where: { id } });

    return resSuccess({ ack_msg: "Value removed" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

/** Every variant (products row) under a parent, with its chosen attribute-value
 * labels attached (e.g. "Red / Small"), for the variant list under a parent. */
export const getVariants = async (req) => {
  try {
    const { parent_product_id } = req.body;
    if (!parent_product_id) {
      return resBadRequest({ developer_msg: "parent_product_id is required" });
    }

    const ProductModel = productModel(req.tenantDB);
    const OptionValueModel = productVariantOptionValueModel(req.tenantDB);
    const ValueModel = productVariantAttributeValueModel(req.tenantDB);
    const AttributeModel = productVariantAttributeModel(req.tenantDB);

    const variants = await ProductModel.findAll({
      where: { parent_product_id, isDelete: 0 },
      order: [["id", "ASC"]],
      raw: true,
    });
    if (!variants.length) {
      return resSuccess({ data: { item: [] } });
    }

    const variantIds = variants.map((v) => v.id);
    const optionValues = await OptionValueModel.findAll({
      where: { product_id: { [Op.in]: variantIds }, isDelete: 0 },
      raw: true,
    });
    const valueIds = [...new Set(optionValues.map((ov) => ov.product_variant_attribute_value_id))];
    const values = valueIds.length
      ? await ValueModel.findAll({ where: { id: { [Op.in]: valueIds } }, raw: true })
      : [];
    const attributeIds = [...new Set(values.map((v) => v.product_variant_attribute_id))];
    const attributes = attributeIds.length
      ? await AttributeModel.findAll({ where: { id: { [Op.in]: attributeIds } }, raw: true })
      : [];

    const valueById = new Map(values.map((v) => [v.id, v]));
    const attributeById = new Map(attributes.map((a) => [a.id, a]));

    const result = variants.map((variant) => {
      const labels = optionValues
        .filter((ov) => ov.product_id === variant.id)
        .map((ov) => {
          const value = valueById.get(ov.product_variant_attribute_value_id);
          const attribute = value ? attributeById.get(value.product_variant_attribute_id) : null;
          return attribute && value ? { attribute_name: attribute.attribute_name, value: value.value } : null;
        })
        .filter(Boolean);
      return { ...variant, variant_options: labels };
    });

    return resSuccess({ data: { item: result } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

/** Bulk Excel import/export (plans/2026-10-18-product-variants-and-qty-pricing-plan.txt) -
 * resolves {name, value} pairs straight from a spreadsheet row to attribute/value rows
 * under a parent (find-or-create both, since a bulk sheet names attributes/values by
 * label, not by id) and links the given variant product to them. Idempotent: replaces
 * any existing links for this product_id, so re-importing the same sheet (or an edited
 * update sheet) never leaves stale option-value rows behind. No-ops cleanly if every
 * pair is empty (a plain "Simple" product row has none). */
export const linkVariantAttributesByName = async (
  tenantDB,
  company_masters_id,
  productId,
  parentProductId,
  attributePairs
) => {
  const validPairs = (attributePairs || []).filter((p) => p?.name && p?.value);
  if (!validPairs.length) return;

  const AttributeMasterModel = productAttributeMasterModel(tenantDB);
  const ValueMasterModel = productAttributeValueMasterModel(tenantDB);
  const AttributeModel = productVariantAttributeModel(tenantDB);
  const ValueModel = productVariantAttributeValueModel(tenantDB);
  const OptionValueModel = productVariantOptionValueModel(tenantDB);

  const valueIds = [];
  for (const { name, value } of validPairs) {
    // A sheet names attributes/values by label, not id - find-or-create in the
    // reusable catalog first (so imported names end up pickable on other products
    // too), then find-or-create the per-product link to that catalog row.
    let attributeMaster = await AttributeMasterModel.findOne({
      where: { company_masters_id, attribute_name: name, isDelete: 0 },
    });
    if (!attributeMaster) {
      attributeMaster = await AttributeMasterModel.create({
        company_masters_id,
        attribute_name: name,
      });
    }

    let attribute = await AttributeModel.findOne({
      where: {
        parent_product_id: parentProductId,
        product_attribute_master_id: attributeMaster.id,
        isDelete: 0,
      },
    });
    if (!attribute) {
      attribute = await AttributeModel.create({
        company_masters_id,
        parent_product_id: parentProductId,
        product_attribute_master_id: attributeMaster.id,
        attribute_name: attributeMaster.attribute_name,
      });
    }

    let valueMaster = await ValueMasterModel.findOne({
      where: { product_attribute_master_id: attributeMaster.id, value, isDelete: 0 },
    });
    if (!valueMaster) {
      valueMaster = await ValueMasterModel.create({
        company_masters_id,
        product_attribute_master_id: attributeMaster.id,
        value,
      });
    }

    let attrValue = await ValueModel.findOne({
      where: {
        product_variant_attribute_id: attribute.id,
        product_attribute_value_master_id: valueMaster.id,
        isDelete: 0,
      },
    });
    if (!attrValue) {
      attrValue = await ValueModel.create({
        company_masters_id,
        product_variant_attribute_id: attribute.id,
        product_attribute_value_master_id: valueMaster.id,
        value: valueMaster.value,
      });
    }
    valueIds.push(attrValue.id);
  }

  await OptionValueModel.update({ isDelete: 1 }, { where: { product_id: productId } });
  await OptionValueModel.bulkCreate(
    valueIds.map((id) => ({
      company_masters_id,
      product_id: productId,
      product_variant_attribute_value_id: id,
    }))
  );
};

/** Attribute-value labels for a set of variant product ids, for bulk export (plan,
 * same doc) - returns { [productId]: [{attribute_name, value}] } so the caller can
 * flatten into "attribute_1_name"/"attribute_1_value" style spreadsheet columns. */
export const getVariantOptionLabelsForProducts = async (tenantDB, productIds) => {
  if (!productIds?.length) return {};

  const OptionValueModel = productVariantOptionValueModel(tenantDB);
  const ValueModel = productVariantAttributeValueModel(tenantDB);
  const AttributeModel = productVariantAttributeModel(tenantDB);

  const optionValues = await OptionValueModel.findAll({
    where: { product_id: { [Op.in]: productIds }, isDelete: 0 },
    raw: true,
  });
  if (!optionValues.length) return {};

  const valueIds = [...new Set(optionValues.map((ov) => ov.product_variant_attribute_value_id))];
  const values = await ValueModel.findAll({ where: { id: { [Op.in]: valueIds } }, raw: true });
  const attributeIds = [...new Set(values.map((v) => v.product_variant_attribute_id))];
  const attributes = await AttributeModel.findAll({ where: { id: { [Op.in]: attributeIds } }, raw: true });

  const valueById = new Map(values.map((v) => [v.id, v]));
  const attributeById = new Map(attributes.map((a) => [a.id, a]));

  const result = {};
  for (const ov of optionValues) {
    const value = valueById.get(ov.product_variant_attribute_value_id);
    const attribute = value ? attributeById.get(value.product_variant_attribute_id) : null;
    if (!attribute || !value) continue;
    (result[ov.product_id] ||= []).push({ attribute_name: attribute.attribute_name, value: value.value });
  }
  return result;
};

/** Links an already-created variant (products row, parent_product_id already set via
 * /create-product) to its chosen attribute values - one row per attribute. Called right
 * after /create-product succeeds for a new variant, not a replacement for it. */
export const setVariantOptionValues = async (req) => {
  try {
    const { a_application_login_id, product_id, product_variant_attribute_value_ids } = req.body;
    if (!product_id || !Array.isArray(product_variant_attribute_value_ids) || !product_variant_attribute_value_ids.length) {
      return resBadRequest({ developer_msg: "product_id and product_variant_attribute_value_ids[] are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const OptionValueModel = productVariantOptionValueModel(req.tenantDB);

    // Idempotent: clear any existing links for this variant first (covers "edit an
    // existing variant's attribute selection", not just first-time creation).
    await OptionValueModel.update({ isDelete: 1 }, { where: { product_id } });

    const rows = await OptionValueModel.bulkCreate(
      product_variant_attribute_value_ids.map((id) => ({
        company_masters_id: findCompanyId.company_masters_id,
        product_id,
        product_variant_attribute_value_id: id,
      }))
    );

    return resSuccess({ ack_msg: "Variant options saved", data: { item: rows } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};
