import { randomUUID } from "crypto";
import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { priceListMastersModel } from "../../models/product_settings/priceListMastersModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import { isValid, resBadRequest, resError, resSuccess, sanitizeObjectOfNull } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
export const getAllPriceListItems = async (req) => {
  try {
    let { searchTerm, a_application_login_id, pricelist_masters_id } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    let whereClause = {
      // [Op.or]: [
      //   { a_application_login_id: a_application_login_id },
      //   { company_masters_id: findCompanyId.company_masters_id },
      // ],
      pricelist_masters_id: pricelist_masters_id,
      isDelete: "0",
    };

    if (searchTerm) {
      whereClause = {
        [Op.or]: [{ product_name: { [Op.like]: "%" + searchTerm + "%" } }],
        // [Op.or]: [
        //   { a_application_login_id: a_application_login_id },
        //   { company_masters_id: findCompanyId.company_masters_id },
        // ], // Assuming a_application_login_id is defined somewhere in your code
        isDelete: "0",
      };
    } else {
    }
    const productListCustom = priceListModel(req.tenantDB); // Initialize User model

    const resultPriceListItem = await productListCustom.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT products.product_name FROM products WHERE products.id = price_lists.product_id AND products.isDelete=0)"
            ),
            "product_name",
          ],
          [
            Sequelize.literal(
              "(SELECT products.GST FROM products WHERE products.id = price_lists.product_id AND products.isDelete=0)"
            ),
            "gst_number",
          ],
        ],
      },
    });

    if (resultPriceListItem) {
      const sanitizedContacts = await Promise.all(
        resultPriceListItem.map(async (price_list) => {
          const sanitized = sanitizeObjectOfNull(price_list.toJSON());
          if (isValid(sanitized.last_updated_by)) {
            const last_updated_by_name = await loginModel.findOne({
              where: {
                id: sanitized.last_updated_by,
                isDelete: 0,
              },
              attributes: ["username"],
              raw: true
            });
            sanitized.last_updated_by_name = last_updated_by_name.username;
          }
          return sanitized;
        })
      );
      return resSuccess({
        data: { item: sanitizedContacts },
      });
    }
    else {
      return resError({
        ack_msg: "No price List Item",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};



export const DeletePriceListAll = async (req) => {
  try {
    const { a_application_login_id, priceListId } = req.body;

    // Validate login ID and retrieve company
    await getCompanyByLoginId(a_application_login_id);

    const PriceListModel = priceListModel(req.tenantDB);
    const PriceMasterModel = priceListMastersModel(req.tenantDB);

    // Convert comma-separated IDs into an array of numbers
    const priceListIds = priceListId
      .split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));

    if (priceListIds.length === 0) {
      return resBadRequest({
        ack_msg: "Invalid priceListId provided",
      });
    }

    // Soft delete the price list master(s)
    const [updatedMasterCount] = await PriceMasterModel.update(
      { isDelete: 1 },
      {
        where: {
          id: { [Op.in]: priceListIds },
          isDelete: 0,
        },
      }
    );

    // If masters were updated, delete associated price list items
    if (updatedMasterCount > 0) {
      const [updatedItemsCount] = await PriceListModel.update(
        { isDelete: 1 },
        {
          where: {
            pricelist_masters_id: { [Op.in]: priceListIds },
            isDelete: 0,
          },
        }
      );

      return resSuccess({
        ack_msg: "Price List Deleted Successfully",
        data: { masterCount: updatedMasterCount, itemCount: updatedItemsCount },
      });
    } else {
      return resError({
        ack_msg: "No Price List found to delete",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error deleting Price List",
      developer_msg: error.message,
    });
  }
};

const calculateValues = (rate, discount, gst, type) => {
  console.log("rateraterate", rate);
  console.log("discountdiscountdiscount", discount);
  console.log("gstgstgstgstgst", gst);
  console.log("typetypetypetypetype", type);

  let discountAmount = 0;
  let discountPercent = 0;

  if (type === "percentage") {
    discountPercent = discount;
    discountAmount = (rate * discount) / 100;
  } else {
    discountAmount = discount;
    discountPercent = rate > 0 ? (discount / rate) * 100 : 0;
  }

  let discountedAmount = rate - discountAmount;
  if (discountedAmount < 0) discountedAmount = 0;

  const gstAmount = (gst * discountedAmount) / 100;
  const finalNetRate = discountedAmount + gstAmount;

  return {
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    discountPercent: parseFloat(discountPercent.toFixed(2)),
    netRate: parseFloat(finalNetRate.toFixed(2)) // 👈 यही store होगा
  };
};


export const insertPriceListCategoryWise = async (req) => {
  try {
    const { discount, category_id, pricelist_masters_id, a_application_login_id, discount_type } = req.body;

    const productModelIntance = productModel(req.tenantDB);
    const priceListModelIntance = priceListModel(req.tenantDB);

    let whereClause = { isDelete: "0" };

    if (isValid(category_id)) {
      whereClause['category_id'] = category_id;
    }

    // 👉 added 'name'
    const getProduct = await productModelIntance.findAll({
      where: whereClause,
      attributes: ['id', 'rate', 'GST', 'product_name']
    });

    if (!getProduct || getProduct.length === 0) {
      return resError({
        ack_msg: "No Product Found",
        developer_msg: "No category product found",
      });
    }

    const skippedProducts = [];

    const product_ids = getProduct.map(e => e.id);

    const getPriceListProduct = await priceListModelIntance.findAll({
      where: {
        isDelete: '0',
        pricelist_masters_id,
        product_id: product_ids
      },
      attributes: ['product_id']
    });

    const priceListProductMap = getPriceListProduct.map(e => e.product_id);

    const inserProduct = getProduct.filter(v => !priceListProductMap.includes(v.id));
    const updateProduct = getProduct.filter(v => priceListProductMap.includes(v.id));

    const created_date_time = moment().format("YYYY-MM-DD HH:mm:ss");
    const last_updated_date_time = created_date_time;

    // ✅ INSERT
    const insertProductFiltered = inserProduct.map(v => {

      // ❌ skip condition (ONLY for flat)
      if (discount_type == "flat" && discount > v.rate) {
        skippedProducts.push(
          `Product "${v.product_name}" (Rate: ₹${v.rate}) was skipped because discount (${discount}${discount_type === "percentage" ? "percentage" : "Flat Amount"}) is too high`
        );
        return null;
      }

      const calc = calculateValues(v.rate, discount, v.GST, discount_type);

      return {
        created_date_time,
        last_updated_date_time,
        pricelist_masters_id,
        product_id: v.id,

        rate: v.rate,

        discount: calc.discountPercent,
        discount_amount: calc.discountAmount,

        net_rate: calc.netRate, // 👈 GST included final value

        last_updated_by: a_application_login_id
      };
    }).filter(Boolean); // remove null

    if (insertProductFiltered.length > 0) {
      await priceListModelIntance.bulkCreate(insertProductFiltered);
    }

    // ✅ UPDATE
    const t = await req.tenantDB.transaction();

    try {
      await Promise.all(
        updateProduct.map(v => {

          // ❌ skip condition
          if (discount_type == "flat" && discount > v.rate) {
            skippedProducts.push(
              `Product "${v.product_name}" (Rate: ₹${v.rate}) was skipped because discount (${discount}${discount_type === "percentage" ? "percentage" : "Flat Amount"}) is too high`
            );
            return Promise.resolve(); // skip update
          }

          const calc = calculateValues(v.rate, discount, v.GST, discount_type);

          return priceListModelIntance.update(
            {
              rate: v.rate,

              discount: calc.discountPercent,
              discount_amount: calc.discountAmount,

              net_rate: calc.netRate, //GST included

              last_updated_date_time,
              last_updated_by: a_application_login_id
            },
            {
              where: {
                pricelist_masters_id,
                isDelete: '0',
                product_id: v.id
              },
              transaction: t
            }
          );
        })
      );

      await t.commit();

    } catch (error) {
      await t.rollback();
      return resBadRequest({ developer_msg: `error ${error.message}` });
    }


    // Final response with skipped products
    return resSuccess({
      ack_msg:
        skippedProducts.length > 0
          ? `Updated Successfully. Some products were skipped:\n${skippedProducts.join("\n")}`
          : `Updated Successfully`,

      developer_msg: skippedProducts.length > 0 ? skippedProducts : []
    });

  } catch (error) {
    console.log("category price list error", error);
    return resBadRequest({ developer_msg: `error ${error.message}` });
  }
};

export const getExportsPriceListForUpdateData = async (req) => {
  try {

    const {
      a_application_login_id,
      pricelistId
    } = req.body;

    const companyDetail =
      await getCompanyByLoginId(a_application_login_id);

    const fileName = randomUUID();

    const format = "xlsx";

    const cols = null;

    const headersObj = null;

    const outputDir =
      `media-folder/exports/pricelist/${companyDetail.company_masters_id}`;

    const uploadDir =
      path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // ================= EXPORT COLUMNS =================

    const excelColumnDefineArray = {
      id: "pricelist_id",
      product_name: "product_name",
      rate: "rate",
      discount: "discount(%)",
      discount_amount: "discount Flat",
    };

    // ================= MODELS =================

    const priceListModelIntance =
      priceListModel(req.tenantDB);

    const productModelIntance =
      productModel(req.tenantDB);

    // ================= GET PRICE LIST =================

    const priceListData =
      await priceListModelIntance.findAll({
        where: {
          company_masters_id:
            companyDetail.company_masters_id,
          pricelist_masters_id: pricelistId,
          isDelete: 0,
        },
        order: [["id", "ASC"]],
        raw: true,
      });
    if (!priceListData) {
      return resError({
        ack_msg: "No Price List found",
      });
    }
    // ================= GET PRODUCTS =================

    const productList =
      await productModelIntance.findAll({
        where: {
          company_masters_id:
            companyDetail.company_masters_id,
          isDelete: 0,
        },
        attributes: [
          "id",
          "product_name"
        ],
        raw: true,
      });

    // ================= PRODUCT MAP =================

    const productMap = new Map(
      productList.map((p) => [
        Number(p.id),
        p.product_name,
      ])
    );

    // ================= FINAL DATA =================

    const sanitizedContacts =
      priceListData.map((priceItem) => {

        const sanitized =
          sanitizeObjectOfNull(priceItem);

        const product_name =
          productMap.get(
            Number(sanitized.product_id)
          ) || "";

        let objectTemp = {};

        objectTemp["pricelist_id"] =
          sanitized.id || "";
        objectTemp["product_id"] =
          sanitized.product_id || "";

        objectTemp["product_name"] =
          product_name;

        objectTemp["rate"] =
          sanitized.rate || 0;

        objectTemp["discount(%)"] =
          sanitized.discount || 0;

        objectTemp["discount Flat"] =
          sanitized.discount_amount || 0;

        return objectTemp;
      });

    // ================= EXPORT =================

    const savedPath = await exportData(
      sanitizedContacts,
      {
        format,
        fileName,
        columns: cols,
        headers: headersObj,
        autoDownload: false,
        outputDir: uploadDir,
      }
    );

    const fileUrl =
      `${EXPORTS_LINK_EXTENDED}pricelist/${companyDetail.company_masters_id}/${savedPath.file_name}`;

    return resSuccess({
      data: {
        fileUrl,
        fileName: savedPath.file_name,
      },
    });

  } catch (err) {

    console.error(err);

    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${err.message}`,
    });
  }
};