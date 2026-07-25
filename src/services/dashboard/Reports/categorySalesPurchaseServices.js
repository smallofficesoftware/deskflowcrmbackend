import { col, fn, Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { cartItemModel } from "../../../models/activities/cartItemsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { categoryModel } from "../../../models/product_settings/categoryModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";
// If needed at top of file:
// const { Op, fn, col, Sequelize } = require('sequelize');

export const getCategorySalesPurchase = async (req) => {
  try {
    const { a_application_login_id, selectedDates, selectedCategory, ul, ll, selectedContactId, referenceWiseContact } = req.body;
    const globalSearch = req.body.globalSearch?.trim() || "";

    // Build full text search condition across text columns of cart_item
    let fullTextSearchCondition = {};
    if (globalSearch) {
      const cartColumns = Object.keys(cartItemModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = cartItemModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const like = `%${globalSearch}%`;
      const orConditions = cartColumns.map(col => ({
        [col]: { [Op.like]: like }
      }));

      fullTextSearchCondition = { [Op.or]: orConditions };
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const start = new Date(selectedDates[0]);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selectedDates[1]);
    end.setHours(23, 59, 59, 999);

    const offset = ul;
    const limit = ll;

    const cartItem = cartItemModel(req.tenantDB);

    // get currency for formatting
    const companyCurrency = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: {
        id: companyCurrency?.currency_id,
        isDelete: 0,
      },
      attributes: ["id", "symbol"],
      raw: true,
    });

    // Build whereForProduct based on selectedCategory or user rights

    const andConditions = [];

    // ====================== SELECTED CATEGORY FILTER ======================
    if (selectedCategory?.value) {
      andConditions.push(
        Sequelize.literal(`FIND_IN_SET('${selectedCategory.value}', item_category_id) > 0`)
      );
    }

    // ====================== USER RIGHTS ======================
    const a_application_login_type_rights = req.body.a_application_login_id;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: a_application_login_type_rights,
      page_id: PAGE_ID.CATEGORYMOVEMENT_REPORT,
      tenentId: req.tenantDB
    });

    let whereForProduct = {};
    if (showAllData) {
      whereForProduct = { company_masters_id: findCompanyId.company_masters_id };
    } else if (showPersonalData) {
      whereForProduct = { a_application_login_id: req.body.a_application_login_id };
    }

    // ====================== CONTACT FILTER ======================
    let contactCondition = {};
    if (selectedContactId && referenceWiseContact == 1) {
      contactCondition = { contact_master_id: selectedContactId };
    }
    else if (selectedContactId && referenceWiseContact == 2) {
      const Contact = contactModel(req.tenantDB);
      const findreffrancewiseContact = await Contact.findAll({
        where: { referance_contact: selectedContactId, isDelete: 0 },
        attributes: ["id"],
        raw: true,
      });

      const contactIds = findreffrancewiseContact.map(item => item.id);

      if (contactIds.length > 0) {
        contactCondition = { contact_master_id: { [Op.in]: contactIds } };
      } else {
        contactCondition = { contact_master_id: -1 }; // No results
      }
    }

    // ====================== EXCLUDE DELETED CATEGORIES ======================
    const cartTableName = cartItem.getTableName?.() || cartItem.tableName || 'cart_item';
    const categoryModelInstance = categoryModel(req.tenantDB);
    const categoryTableName = categoryModelInstance.getTableName?.() || categoryModelInstance.tableName || 'category_master';

    const excludeDeletedCategoryLiteral = Sequelize.literal(`
  NOT EXISTS (
    SELECT 1 
    FROM ${categoryTableName} cm 
    WHERE cm.isDelete = 1 
      AND FIND_IN_SET(cm.id, ${cartTableName}.item_category_id) > 0
  )
`);

    // ====================== BUILD FINAL WHERE CLAUSE ======================
    const where = {
      ...fullTextSearchCondition,
      ...whereForProduct,
      ...contactCondition,
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
      cart_date: { [Op.between]: [start, end] },
    };

    // Add all AND conditions
    if (andConditions.length > 0 || true) {  // always create Op.and for safety
      where[Op.and] = [
        ...(where[Op.and] || []),
        ...andConditions,
        excludeDeletedCategoryLiteral
      ];
    }

    const productData = await cartItem.findAll({
      attributes: [
        "item_category_id",
        "item_category_name",
        "cart_type",
        [fn("COUNT", fn("DISTINCT", col("cart_number"))), "quotation_count"],
        [fn("SUM", col("item_qty")), "total_quantity"],
        [fn("SUM", col("item_total")), "total_amount"],
      ],
      where,
      group: ["item_category_id", "item_category_name", "cart_type"],
      offset,
      limit,
      raw: true,
    });

    console.log("Category Movement Data:", productData);
    // Format amounts with currency symbol
    const formattedData = productData.map((item) => ({
      ...item,
      total_amount: item.total_amount
        ? `${currency.symbol}${Number(item.total_amount).toFixed(2)}`
        : `${currency.symbol}0.00`,
    }));

    // Split by cart types
    const quotation = formattedData.filter((item) => item.cart_type === 1);
    const salesOrder = formattedData.filter((item) => item.cart_type === 2);
    const salesInvoice = formattedData.filter((item) => item.cart_type === 3);
    const purchaseInvoice = formattedData.filter((item) => item.cart_type === 4);
    const purchaseOrder = formattedData.filter((item) => item.cart_type === 5);

    return resSuccess({
      data: {
        quotation,
        salesOrder,
        salesInvoice,
        purchaseInvoice,
        purchaseOrder,
      },
      ack_msg:
        productData.length > 0
          ? "Category data retrieved successfully"
          : "No Category data found",
    });

  } catch (error) {
    console.error("getCategorySalesPurchase error:", error);
    // adapt to your error response helper if you have one
    return resError({
      error,
      ack_msg: "Failed to retrieve category data"
    });
  }
};

