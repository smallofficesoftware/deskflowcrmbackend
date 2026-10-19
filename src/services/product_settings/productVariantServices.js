import { Op } from "sequelize";
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
    const { a_application_login_id, parent_product_id, attribute_name } = req.body;
    if (!parent_product_id || !attribute_name) {
      return resBadRequest({ developer_msg: "parent_product_id and attribute_name are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const AttributeModel = productVariantAttributeModel(req.tenantDB);

    const duplicate = await AttributeModel.findOne({
      where: {
        parent_product_id,
        attribute_name,
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
      attribute_name,
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
    const { a_application_login_id, product_variant_attribute_id, value } = req.body;
    if (!product_variant_attribute_id || !value) {
      return resBadRequest({ developer_msg: "product_variant_attribute_id and value are required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const ValueModel = productVariantAttributeValueModel(req.tenantDB);

    const duplicate = await ValueModel.findOne({
      where: { product_variant_attribute_id, value, isDelete: 0 },
    });
    if (duplicate) {
      return resError({ ack_msg: "This value already exists for this attribute" });
    }

    const created = await ValueModel.create({
      company_masters_id: findCompanyId.company_masters_id,
      product_variant_attribute_id,
      value,
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
