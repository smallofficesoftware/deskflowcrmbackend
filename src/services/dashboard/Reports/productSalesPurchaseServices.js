import { col, fn, Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { cartItemModel } from "../../../models/activities/cartItemsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { productModel } from "../../../models/product_settings/productModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";
export const getProductSalesPurchase = async (req) => {
  const { a_application_login_id, selectedDates, selectedProduct, selectedCategory, ul, ll, selectedContactId, referenceWiseContact } = req.body;
  const globalSearch = req.body.globalSearch?.trim() || "";
  const offset = ul;
  const limit = ll;
  try {
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const start = new Date(selectedDates[0]);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selectedDates[1]);
    end.setHours(23, 59, 59, 999);

    const cartItem = cartItemModel(req.tenantDB);
    const productModelInstance = productModel(req.tenantDB); // 🔥 MUST exist

    // ---------------- Text Search ----------------
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

    // ---------------- Product / Category Filter ----------------
    // let whereForProduct = {};
    // if (selectedProduct || selectedCategory) {
    //   whereForProduct[Op.and] = [];

    //   if (selectedProduct) {
    //     whereForProduct[Op.and].push(
    //       Sequelize.literal(`FIND_IN_SET('${selectedProduct}', item_product_id)`)
    //     );
    //   }

    //   if (selectedCategory) {
    //     whereForProduct[Op.and].push(
    //       Sequelize.literal(`FIND_IN_SET('${selectedCategory}', item_category_id)`)
    //     );
    //   }
    // }
    const andConditions = [];

    if (selectedProduct?.value) {
      andConditions.push(
        Sequelize.literal(`FIND_IN_SET('${selectedProduct.value}', item_product_id)`)
      );
    }

    if (selectedCategory?.value) {
      andConditions.push(
        Sequelize.literal(`FIND_IN_SET('${selectedCategory.value}', item_category_id)`)
      );
    }
    let contactCondition = {};

    if (selectedContactId && referenceWiseContact == 1) {
      contactCondition = {
        contact_master_id: selectedContactId,
      };

    } else if (selectedContactId && referenceWiseContact == 2) {

      const Contact = contactModel(req.tenantDB);

      const findreffrancewiseContact = await Contact.findAll({
        where: {
          referance_contact: selectedContactId,
          isDelete: 0,
        },
        attributes: ["id"],
        raw: true,
      });

      const contactIds = findreffrancewiseContact.map(item => item.id);

      contactCondition = {
        contact_master_id: {
          [Op.in]: contactIds,
        },
      };
    }
    // ---------------- User Rights ----------------
    const a_application_login_id_rights = req.body.a_application_login_id;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: a_application_login_id_rights,
      page_id: PAGE_ID.PRODUCTMOVEMENT_REPORT,
      tenentId: req.tenantDB
    });

    let rightsCondition = {};
    if (showAllData) {
      rightsCondition = {
        company_masters_id: findCompanyId.company_masters_id,
      };
    } else if (showPersonalData) {
      rightsCondition = {
        a_application_login_id: req.body.a_application_login_id
      };
    }

    // ---------------- Currency ----------------
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

    // ---------------- Table Names ----------------
    let cartTableName = cartItem.tableName || "cart_item";
    let productTableName = productModelInstance.tableName || "product_master";

    // ---------------- KEY FIX: DO NOT SHOW DELETED PRODUCTS ----------------
    const excludeDeletedProducts = Sequelize.literal(`
      NOT EXISTS (
        SELECT 1 FROM ${productTableName} pm
        WHERE pm.isDelete = 1
          AND FIND_IN_SET(pm.id, ${cartTableName}.item_product_id)
      )
    `);
    const finalWhere = {
      isDelete: 0,
      cart_date: { [Op.between]: [start, end] },
      ...fullTextSearchCondition,
      ...contactCondition,
      ...rightsCondition,
      [Op.and]: [
        excludeDeletedProducts,
        ...andConditions   // ← Product & Category conditions added here
      ]
    };
    // ---------------- Final Query ----------------
    const productData = await cartItem.findAll({
      where: finalWhere,
      attributes: [
        "item_product_id",
        "item_product_name",
        "item_product_code",
        "item_category_name",
        "item_unit_name",
        "cart_type",
        [fn("COUNT", fn("DISTINCT", col("cart_number"))), "quotation_count"],
        [fn("SUM", col("item_qty")), "total_quantity"],
        [fn("SUM", col("item_total")), "total_amount"],
      ],
      group: ["item_product_id", "item_product_name", "cart_type"],
      raw: true,
      offset,
      limit
    });


    // ---------------- Format Output ----------------
    const formattedData = productData.map((item) => ({
      ...item,
      total_amount: item.total_amount ? `${currency?.symbol || ""}${Number(item.total_amount).toFixed(2)}` : `${currency?.symbol || ""}0.00`,
    }));

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
          ? "Product data retrieved successfully"
          : "No product data found",
    });

  } catch (e) {
    console.log("Error in product movement report:", e);
    return resError({ developer_msg: e });
  }
};

