import { Op } from "sequelize";
import { productAttributeMasterModel } from "../../models/product_settings/productAttributeMasterModel.js";
import { productAttributeValueMasterModel } from "../../models/product_settings/productAttributeValueMasterModel.js";
import { inUseMessage, productsUsingAttribute, productsUsingAttributeValue } from "./productAttributeUsage.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

// Reusable attribute/value catalog (Settings > Attribute Master) -
// plans/2026-10-18-product-variants-and-qty-pricing-plan.txt. Defined once per company;
// picked from on any product's Variant Attributes section (productVariantServices.js)
// instead of being typed fresh per product.

/** Every attribute master + its value masters, for the Attribute Master list page and
 * for the "pick from catalog" dropdowns in a product's Variant Attributes section. */
export const getAttributeMasters = async (req) => {
  try {
    const AttributeMasterModel = productAttributeMasterModel(req.tenantDB);
    const ValueMasterModel = productAttributeValueMasterModel(req.tenantDB);

    const attributes = await AttributeMasterModel.findAll({
      where: { isDelete: 0 },
      order: [["display_order", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    const attributeIds = attributes.map((a) => a.id);
    const values = attributeIds.length
      ? await ValueMasterModel.findAll({
          where: {
            product_attribute_master_id: { [Op.in]: attributeIds },
            isDelete: 0,
          },
          order: [["display_order", "ASC"], ["id", "ASC"]],
          raw: true,
        })
      : [];

    const result = attributes.map((attribute) => ({
      ...attribute,
      values: values.filter((v) => v.product_attribute_master_id === attribute.id),
    }));

    return resSuccess({ data: { item: result } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const createAttributeMaster = async (req) => {
  try {
    const { a_application_login_id, attribute_name } = req.body;
    if (!attribute_name || !attribute_name.trim()) {
      return resBadRequest({ developer_msg: "attribute_name is required" });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const AttributeMasterModel = productAttributeMasterModel(req.tenantDB);

    const duplicate = await AttributeMasterModel.findOne({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        attribute_name: attribute_name.trim(),
        isDelete: 0,
      },
    });
    if (duplicate) {
      return resError({ ack_msg: "This attribute already exists" });
    }

    const created = await AttributeMasterModel.create({
      company_masters_id: findCompanyId.company_masters_id,
      attribute_name: attribute_name.trim(),
    });

    return resSuccess({ ack_msg: "Attribute created", data: { item: created } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const updateAttributeMaster = async (req) => {
  try {
    const { id, attribute_name } = req.body;
    if (!id || !attribute_name || !attribute_name.trim()) {
      return resBadRequest({ developer_msg: "id and attribute_name are required" });
    }

    const AttributeMasterModel = productAttributeMasterModel(req.tenantDB);
    await AttributeMasterModel.update(
      { attribute_name: attribute_name.trim() },
      { where: { id } }
    );

    return resSuccess({ ack_msg: "Attribute updated" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const deleteAttributeMaster = async (req) => {
  try {
    const { id } = req.body;
    if (!id) return resBadRequest({ developer_msg: "id is required" });

    const usedBy = await productsUsingAttribute(req.tenantDB, id);
    if (usedBy.length > 0) {
      return resError({ ack_msg: inUseMessage("attribute", usedBy) });
    }

    const ValueMasterModel = productAttributeValueMasterModel(req.tenantDB);
    const AttributeMasterModel = productAttributeMasterModel(req.tenantDB);

    await ValueMasterModel.update(
      { isDelete: 1 },
      { where: { product_attribute_master_id: id } }
    );
    await AttributeMasterModel.update({ isDelete: 1 }, { where: { id } });

    return resSuccess({ ack_msg: "Attribute deleted" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const createAttributeValueMaster = async (req) => {
  try {
    const { a_application_login_id, product_attribute_master_id, value } = req.body;
    if (!product_attribute_master_id || !value || !value.trim()) {
      return resBadRequest({
        developer_msg: "product_attribute_master_id and value are required",
      });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }

    const ValueMasterModel = productAttributeValueMasterModel(req.tenantDB);

    const duplicate = await ValueMasterModel.findOne({
      where: { product_attribute_master_id, value: value.trim(), isDelete: 0 },
    });
    if (duplicate) {
      return resError({ ack_msg: "This value already exists for this attribute" });
    }

    const created = await ValueMasterModel.create({
      company_masters_id: findCompanyId.company_masters_id,
      product_attribute_master_id,
      value: value.trim(),
    });

    return resSuccess({ ack_msg: "Value created", data: { item: created } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const updateAttributeValueMaster = async (req) => {
  try {
    const { id, value } = req.body;
    if (!id || !value || !value.trim()) {
      return resBadRequest({ developer_msg: "id and value are required" });
    }

    const ValueMasterModel = productAttributeValueMasterModel(req.tenantDB);
    await ValueMasterModel.update({ value: value.trim() }, { where: { id } });

    return resSuccess({ ack_msg: "Value updated" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const deleteAttributeValueMaster = async (req) => {
  try {
    const { id } = req.body;
    if (!id) return resBadRequest({ developer_msg: "id is required" });

    const usedBy = await productsUsingAttributeValue(req.tenantDB, id);
    if (usedBy.length > 0) {
      return resError({ ack_msg: inUseMessage("value", usedBy) });
    }

    const ValueMasterModel = productAttributeValueMasterModel(req.tenantDB);
    await ValueMasterModel.update({ isDelete: 1 }, { where: { id } });

    return resSuccess({ ack_msg: "Value deleted" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};
