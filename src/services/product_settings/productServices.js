import { randomUUID } from "crypto";
import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { Op } from "sequelize";
import { getTenantDB } from "../../config/dbManager.js";
import { buildSearchQuery } from "../../helpers/searchAlgoV1.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartSerialNumberModel } from "../../models/activities/cartSerialNumberModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { productTypesModel } from "../../models/product_settings/productTypesModel.js";
import { productUnitMasterModel } from "../../models/product_settings/productUnitMasterModel.js";
import { taxModel } from "../../models/product_settings/taxModel.js";
import { EXPORTS_LINK_EXTENDED, PRODUCT_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { exportData } from "../../utils/exporter.js";
import {
  isValid,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
export const getAllProduct = async (req) => {
  try {
    let { ul, ll, selectedDates, productId } = req.body;
    let {
      searchTerm,
      a_application_login_id,
      searchCategoryId,
      assinged_to_price_list,
      searchBarcodeNum,
      contact_id,
      cart_type
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    let whereClause = {
      isDelete: "0",
    };

    if (productId) {
      whereClause.id = {
        [Op.in]: productId.split(","),
      };
    }

    if (searchCategoryId) {
      whereClause.category_id = searchCategoryId;
    }
    let relevanceOrder;
    if (isValid(searchTerm) && searchTerm != 'undefined') {
      const searchableColumns = [
        'product_name',
        'product_alias',
        'product_code',
        'product_description',
        'product_barcode_number',
      ];
      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        searchTerm,
        searchableColumns
      );

      relevanceOrder = relevanceSearchOrder;

      whereClause = {
        ...whereClause,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          { searchClause },
        ],
      };
    }

    if (searchBarcodeNum && searchBarcodeNum !== 0) {
      whereClause = {
        product_barcode_number: searchBarcodeNum,
        isDelete: "0",
      };
    }

    let resultPriceListItem;
    const productListCustom = priceListModel(req.tenantDB);
    const cartItem = cartItemModel(req.tenantDB);

    if (assinged_to_price_list) {
      resultPriceListItem = await productListCustom.findAll({
        where: { pricelist_masters_id: assinged_to_price_list, isDelete: 0 },
      });
    }

    const productCustom = productModel(req.tenantDB);

    const order = [];
    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }
    order.push(['product_name', 'ASC']);

    const resultProduct = await productCustom.findAll({
      where: whereClause,
      limit: Number(ll) || 100000,
      offset: Number(ul) || 0,
      order,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT categories.category_name FROM categories WHERE categories.id = products.category_id AND products.isDelete=0)"
            ),
            "category_name",
          ],
          [
            Sequelize.literal(
              `(SELECT group_name FROM product_groups WHERE product_groups.id = products.product_group_id AND products.isDelete = '${0}')`
            ),
            "group_name",
          ],
        ],
      },
    });

    const ProUnitModel = productUnitMasterModel(req.tenantDB);
    const allUnitIds = new Set();

    resultProduct.forEach(product => {
      if (product.product_inner_unit) {
        allUnitIds.add(product.product_inner_unit);
      }
      if (product.product_outer_unit) {
        allUnitIds.add(product.product_outer_unit);
      }
    });

    const unitList = await ProUnitModel.findAll({
      where: {
        id: { [Op.in]: [...allUnitIds] },
        isDelete: 0
      },
      attributes: ['id', 'unit'],
      raw: true
    });

    const unitMap = new Map(
      unitList.map(unit => [unit.id, unit.unit])
    );

    //     const orderTypesList = [
    //   { id: "1", type: "quotation" },
    //   { id: "2", type: "order" },
    //   { id: "3", type: "invoice" },
    //   { id: "4", type: "purchase_order" },
    //   { id: "5", type: "order_purchase" },
    //   { id: "6", type: "return_sales_invoice" },
    //   { id: "7", type: "return_purchase_invoice" },
    //   { id: "8", type: "inward" },
    //   { id: "9", type: "dispatch" },
    // ];
    const net_rate_override_cart_type = [4, 5, 8, 7]
    const productsWithStock = await Promise.all(
      resultProduct.map(async (product) => {
        let calOpenQty = 0;
        let calClosingQty = 0;

        const whereClause = {
          isDelete: 0,
          item_product_id: product.dataValues.id,
          cart_type: { [Op.in]: [4, 3, 6, 7, 10, 11] },
          cart_number: { [Op.ne]: null, [Op.not]: "" },
          [Op.or]: [
            { a_application_login_id: a_application_login_id },
            { company_masters_id: findCompanyId.company_masters_id },
          ],
          [Op.and]: [
            {
              [Op.or]: [
                {
                  cart_type: 4,
                  reference_type: { [Op.ne]: 8 },
                },
                {
                  cart_type: 3,
                  reference_type: { [Op.ne]: 9 },
                },

                {
                  cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] },
                },
              ],
            },
          ],
        };

        const resultCartItem = await cartItem.findAll({ where: whereClause });

        const whereClauseOpen = {
          isDelete: 0,
          item_product_id: product.dataValues.id,
          cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
          cart_number: { [Op.ne]: null, [Op.not]: "" },
          stock_type: { [Op.ne]: 0 },
          [Op.and]: [
            {
              [Op.or]: [
                // cart_type = 4 AND reference_type != 8
                {
                  cart_type: 4,
                  reference_type: { [Op.ne]: 8 },
                },
                {
                  cart_type: 3,
                  reference_type: { [Op.ne]: 9 },
                },

                {
                  cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] },
                },
              ],
            },
          ],
        };

        const findOpeningQty = await cartItem.findAll({
          where: whereClauseOpen,
        });
        const OpenQty = findOpeningQty.reduce((total, item) => {
          if ((item.cart_type == 4 && item.reference_type != 8) || item.cart_type == 6 || item.cart_type == 8 || item.cart_type == 10) {
            return total + item.item_qty;
          } else if ((item.cart_type == 3 && item.reference_type != 9) || item.cart_type == 7 || item.cart_type == 9 || item.cart_type == 11) {
            return total - item.item_qty;
          }
        }, 0);
        // const closingQty = resultCartItem.reduce((total, item) => {
        //   if ((item.cart_type == 4 && item.reference_type != 8) || item.cart_type == 6 || item.cart_type == 8) {
        //     return total + item.item_qty;
        //   } else if ((item.cart_type == 3 && item.reference_type != 9) || item.cart_type == 7 || item.cart_type == 9) {
        //     return total - item.item_qty;
        //   }
        //   return total;
        // }, 0);
        // calClosingQty = closingQty + OpenQty;

        let lastItemNetRate = null;
        let lastItemDiscount = null;
        if (contact_id && cart_type) {
          const lastCartItem = await cartItem.findOne({
            where: {
              contact_master_id: contact_id,
              cart_type: cart_type,
              item_product_id: product.dataValues.id,
              isDelete: 0,
            },
            order: [['id', 'DESC']],
            attributes: ['item_rate', 'item_discount_pct'],
          });
          if (lastCartItem) {
            lastItemNetRate = lastCartItem.item_rate;
            lastItemDiscount = lastCartItem.item_discount_pct;
          }
        }

        let is_point_value_allow = null;

        if (product.dataValues.unit_id) {
          const unitData = await ProUnitModel.findOne({
            where: {
              id: product.dataValues.unit_id,
              isDelete: 0
            },
            attributes: ['is_point_value_allow']
          });

          if (unitData) {
            is_point_value_allow = unitData.is_point_value_allow;
          }
        }

        let net_rate = product.dataValues.net_rate;
        let GST = product.dataValues.GST;
        let rate = product.dataValues.rate;
        if (net_rate_override_cart_type.includes(cart_type)) {
          net_rate = product.dataValues.purchase_net_rate;
          GST = product.dataValues.purchase_gst_per;
          rate = product.dataValues.purchase_rate;
        }

        return {
          ...product.dataValues,
          product_img: product.dataValues.product_img
            ? PRODUCT_IMG_LINK_EXTENDED + product.dataValues.product_img
            : "",
          closing_qty: OpenQty,
          last_item_net_rate: lastItemNetRate,
          last_item_dis_pr: lastItemDiscount,
          is_point_value_allow: is_point_value_allow,
          net_rate: net_rate,
          GST: GST,
          rate: rate,
          inner_qty_unit: unitMap.get(product.dataValues.product_inner_unit) || "",
          outer_qty_unit: unitMap.get(product.dataValues.product_outer_unit) || "",
        };
      })
    );

    if (resultProduct.length > 0) { // ← Fixed: resultProduct instead of just resultProduct
      if (assinged_to_price_list) {
        productsWithStock.forEach((item1) => {
          const matchingItem = resultPriceListItem.find(
            (item2) => item2.dataValues?.product_id === item1?.id
          );
          if (matchingItem) {
            item1.net_rate = matchingItem.dataValues.net_rate;
            item1.rate = matchingItem.dataValues.rate;
            item1.price_list_discount = matchingItem.dataValues.discount;
            item1.price_list_dis_amt = matchingItem.dataValues.discount_amount;
          }
        });
        return resSuccess({
          data: { item: productsWithStock, resultPriceListItem },
        });
      } else {
        return resSuccess({
          data: { item: productsWithStock },
        });
      }
    } else {
      return resError({
        ack_msg: "No product",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

export const b2ballProductgetAllProduct = async (req, res) => {
  try {
    const { companyMasterId } = req.body;
    const tenantId = req.headers["x-tenant-id"];

    const tenantDB = await getTenantDB(tenantId, companyMasterId);
    const productCustom = productModel(tenantDB);

    const products = await productCustom.findAll({
      where: {
        company_masters_id: companyMasterId,
        isDelete: 0,
      },
      order: [["id", "DESC"]],
      attributes: [
        "id",
        "product_name",
        "product_img",
        [
          Sequelize.literal(
            `(SELECT category_name FROM categories WHERE categories.id = products.category_id AND products.isDelete = '${0}')`
          ),
          "category_name",
        ],

      ],
    });

    if (!products.length) {
      return resError({
        ack_msg: "No products found",
        developer_msg: "No matching records for the provided companyMasterId",
      });
    }

    const productsWithImg = products.map((item) => ({
      id: item.dataValues.id,
      product_name: item.dataValues.product_name,
      product_img: item.dataValues.product_img
        ? `${PRODUCT_IMG_LINK_EXTENDED}${item.dataValues.product_img}`
        : "",
      category_name: item.dataValues.category_name || "",
    }));

    return resSuccess({ data: { items: productsWithImg } });
  } catch (error) {
    console.error("API ERROR:", error);
    return resBadRequest({
      ack_msg: "Internal server error",
      developer_msg: "Failed to fetch products",
    });
  }
};

let lastTimestamp = 0;
let counter = 0;

function generateBarcode() {
  const now = Date.now();

  // Reset counter if timestamp changed
  if (now !== lastTimestamp) {
    lastTimestamp = now;
    counter = 0;
  }

  counter++;

  // Ensure counter doesn't exceed 9999
  if (counter > 9999) {
    throw new Error("Too many barcodes generated in the same millisecond!");
  }

  // Take last 9 digits of timestamp + 4-digit counter
  const timestampPart = now.toString().slice(-9);
  const counterPart = counter.toString().padStart(4, "0");

  return timestampPart + counterPart; // 13-digit unique code
}


export const productCreate = async (req) => {
  const {
    product_name,
    product_alias,
    product_code,
    product_description,
    unit,
    unit_id,
    category_id,
    rate,
    GST,
    gst_id,
    purchase_gst_id,
    net_rate,
    weight_or_size,
    min_stock_quantity,
    max_stock_quantity,
    a_application_login_id,
    product_types,
    hsn_code,
    purchase_rate,
    purchase_gst_per,
    purchase_net_rate,
    product_group_id,
    product_inner_qty,
    product_outer_qty,
    product_inner_unit,
    product_outer_unit,
    product_length,
    product_width,
    product_height,
    is_serial_number,
  } = req.body;
  const productImg = req.file;
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);

  let directoryPath;
  if (productImg) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "product-images",
      findCompanyId.company_masters_id.toString()
    );
  }
  try {
    let convertPath = "";
    let mediaName = "";
    const product = productModel(req.tenantDB);

    // Check for duplication by product_code
    if (req.body.product_code && req.body.product_code.trim() !== "") {
      const checkDuplication = await product.findOne({
        where: {
          isDelete: 0,
          product_code: req.body.product_code,
        },
      });

      if (checkDuplication) {
        return resError({
          ack_msg:
            "Product code already exists. Please use a unique product code.",
          developer_msg: "Duplicate product_code found",
        });
      }
    }

    // Check for existing product with same product_name and category_id
    const whereCondition = {
      product_name: req.body.product_name,
      category_id: req.body.category_id,
      company_masters_id: findCompanyId.company_masters_id,
      isDelete: 0,
    };

    const existingProduct = await product.findOne({
      where: whereCondition,
    });

    if (existingProduct) {
      return resError({
        ack_msg:
          "Product with the same name and category already exists in this company.",
        developer_msg:
          "Duplicate product_name + category_id + company_masters_id found",
      });
    }

    // File upload logic
    if (productImg) {
      await fs.mkdirp(directoryPath);
      const filePath = productImg.path;
      const fileName = path.basename(filePath);
      const destinationPath = path.join(directoryPath, fileName);

      await fs.move(filePath, destinationPath);

      convertPath =
        findCompanyId.company_masters_id.toString() + "/" + fileName;
      mediaName = productImg.originalname || fileName;
    }

    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    const currentTimestamp = Date.now();

    const userList = await product.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: ["company_masters_id", "a_application_login_id"],
    });
    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        page_id: PAGE_ID.PRODUCT,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    });
    const userCount = userList.length;
    for (const userRight of userRightsList) {
      try {
        const rightsJson = JSON.parse(
          userRight.dataValues.a_page_id_rights_jason || "{}"
        );

        if (
          typeof rightsJson.limit === "number" &&
          rightsJson.limit > 0 &&
          userCount >= rightsJson.limit
        ) {
          return resError({
            ack_msg: `Your Product Limit Exceeded`,
            developer_msg: `Limit ${rightsJson.limit} reached for Company`,
          });
        }
      } catch (err) {
        console.error(
          "Error parsing JSON for a_application_login_id:",
          userRight.a_application_login_id,
          err
        );
      }
    }

    let finalInnerUnit = product_inner_unit;
    let finalOuterUnit = product_outer_unit;

    if (!finalInnerUnit || finalInnerUnit == "" || finalInnerUnit == null || finalInnerUnit == undefined) {
      finalInnerUnit = unit_id;
    }

    if (!finalOuterUnit || finalOuterUnit == "" || finalOuterUnit == null || finalOuterUnit == undefined) {
      finalOuterUnit = unit_id;
    }

    const createProductResult = await product.create({
      a_application_login_id: a_application_login_id,
      product_name: product_name,
      product_alias: product_alias,
      product_code: product_code,
      product_description: product_description,
      category_id: category_id,
      unit: unit,
      unit_id: unit_id,
      product_group_id: product_group_id,
      product_inner_qty: product_inner_qty,
      product_outer_qty: product_outer_qty,
      product_inner_unit: finalInnerUnit,
      product_outer_unit: finalOuterUnit,
      product_length: product_length,
      product_width: product_width,
      is_serial_number: is_serial_number,
      product_height: product_height,
      rate: parseFloat(rate || 0).toFixed(2),
      GST: GST,
      gst_id: gst_id,
      purchase_gst_id: purchase_gst_id,
      purchase_rate: parseFloat(purchase_rate || 0).toFixed(2),
      purchase_gst_per: purchase_gst_per,
      created_date_time: formattedDate,
      net_rate: parseFloat(net_rate || 0).toFixed(2),
      purchase_net_rate: parseFloat(purchase_net_rate || 0).toFixed(2),
      product_img: convertPath,
      company_masters_id: findCompanyId.company_masters_id,
      product_barcode_number: generateBarcode(),
      weight_or_size: Number(weight_or_size),
      min_stock_quantity: Number(min_stock_quantity),
      max_stock_quantity: Number(max_stock_quantity),
      product_types: Number(product_types),
      hsn_code: hsn_code,
      miracle_uom_name: req.body.miracle_uom_name !== undefined ? req.body.miracle_uom_name : "",
      products_column_number_1: req.body.products_column_number_1 || "",
      products_column_number_2: req.body.products_column_number_2 || "",
      products_column_number_3: req.body.products_column_number_3 || "",
      products_column_number_4: req.body.products_column_number_4 || "",
      products_column_number_5: req.body.products_column_number_5 || "",
      products_column_text_1: req.body.products_column_text_1 || "",
      products_column_text_2: req.body.products_column_text_2 || "",
      products_column_text_3: req.body.products_column_text_3 || "",
      products_column_text_4: req.body.products_column_text_4 || "",
      products_column_text_5: req.body.products_column_text_5 || "",
      products_column_text_area_1: req.body.products_column_text_area_1 || "",
      products_column_text_area_2: req.body.products_column_text_area_2 || "",
      products_column_text_area_3: req.body.products_column_text_area_3 || "",
      products_column_text_area_4: req.body.products_column_text_area_4 || "",
      products_column_text_area_5: req.body.products_column_text_area_5 || "",
      products_column_date_1: req.body.products_column_date_1 || "",
      products_column_date_2: req.body.products_column_date_2 || "",
      products_column_date_3: req.body.products_column_date_3 || "",
      products_column_date_4: req.body.products_column_date_4 || "",
      products_column_date_5: req.body.products_column_date_5 || "",
      products_column_date_and_time_1:
        req.body.products_column_date_and_time_1 || "",
      products_column_date_and_time_2:
        req.body.products_column_date_and_time_2 || "",
      products_column_date_and_time_3:
        req.body.products_column_date_and_time_3 || "",
      products_column_date_and_time_4:
        req.body.products_column_date_and_time_4 || "",
      products_column_date_and_time_5:
        req.body.products_column_date_and_time_5 || "",
      products_column_time_1: req.body.products_column_time_1 || "",
      products_column_time_2: req.body.products_column_time_2 || "",
      products_column_time_3: req.body.products_column_time_3 || "",
      products_column_time_4: req.body.products_column_time_4 || "",
      products_column_time_5: req.body.products_column_time_5 || "",
      products_column_switch_1: req.body.products_column_switch_1 || false,
      products_column_switch_2: req.body.products_column_switch_2 || false,
      products_column_switch_3: req.body.products_column_switch_3 || false,
      products_column_switch_4: req.body.products_column_switch_4 || false,
      products_column_switch_5: req.body.products_column_switch_5 || false,
      products_column_decimal_1: req.body.products_column_decimal_1 || "",
      products_column_decimal_2: req.body.products_column_decimal_2 || "",
      products_column_decimal_3: req.body.products_column_decimal_3 || "",
      products_column_decimal_4: req.body.products_column_decimal_4 || "",
      products_column_decimal_5: req.body.products_column_decimal_5 || "",
      products_column_dropdown_1: req.body.products_column_dropdown_1 || "",
      products_column_dropdown_2: req.body.products_column_dropdown_2 || "",
      products_column_dropdown_3: req.body.products_column_dropdown_3 || "",
      products_column_dropdown_4: req.body.products_column_dropdown_4 || "",
      products_column_dropdown_5: req.body.products_column_dropdown_5 || "",
      products_column_radio_1: req.body.products_column_radio_1 || "",
      products_column_radio_2: req.body.products_column_radio_2 || "",
      products_column_radio_3: req.body.products_column_radio_3 || "",
      products_column_radio_4: req.body.products_column_radio_4 || "",
      products_column_radio_5: req.body.products_column_radio_5 || "",
    });

    if (createProductResult) {
      return resSuccess({
        ack_msg: "Product added successfully",
        data: { item: createProductResult },
      });
    } else {
      return resError();
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};
// "Product Page Designer" — sets/clears which document_print_templates row
// (template_purpose='product_page') this product's own extra page splices
// from at generate time, when the resolved main template's
// include_product_pages flag is on (see generateDocument.js). Deliberately
// its own small endpoint rather than folding into productUpdate's much
// larger required-field validation below — this is a single-column,
// independently-triggered save from ProductPageDesignerEditorView.tsx's
// "Use This Page" action, not a general product edit.
export const setProductDesignerPage = async (req) => {
  try {
    const { product_id, document_template_id } = req.body || {};
    if (!product_id) {
      return resError({ developer_msg: "product_id is required" });
    }

    const Product = productModel(req.tenantDB);
    // No company_masters_id filter — confirmed against getAllProduct above,
    // this table isn't scoped by that column (it sits at 0 on every row in
    // a single-company tenant DB); real scoping is tenant-DB isolation
    // alone, same convention every other product query in this file uses.
    //
    // Checked via a real existence lookup, not update()'s "affected rows"
    // count — MySQL/Sequelize report 0 affected rows when the new value
    // equals the existing one (e.g. re-saving the same page, or explicitly
    // clearing an already-null link), which is a legitimate no-op save,
    // not a "row not found" — using the update's own return value here
    // would wrongly error on exactly that case.
    const product = await Product.findOne({ where: { id: product_id, isDelete: 0 }, attributes: ["id"] });
    if (!product) {
      return resError({ developer_msg: "Product not found" });
    }
    await Product.update(
      { document_template_id: document_template_id || null },
      { where: { id: product_id, isDelete: 0 } },
    );

    return resSuccess({ ack_msg: "Product page saved" });
  } catch (e) {
    console.log(e);
    return resError({ developer_msg: `Failed to Catch ${e}` });
  }
};

export const productUpdate = async (req) => {
  const {
    product_name,
    product_alias,
    product_code,
    product_description,
    unit,
    unit_id,
    category_id,
    rate,
    GST,
    gst_id,
    purchase_gst_id,
    net_rate,
    a_application_login_id,
    product_id,
    weight_or_size,
    min_stock_quantity,
    max_stock_quantity,
    product_types,
    hsn_code,
    purchase_rate,
    purchase_gst_per,
    purchase_net_rate,
    product_group_id,
    product_inner_qty,
    product_outer_qty,
    product_inner_unit,
    product_outer_unit,
    product_length,
    product_width,
    product_height,
    is_serial_number,
  } = req.body;
  const productImg = req.file;
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  let directoryPath;
  if (productImg) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "product-images",
      findCompanyId.company_masters_id.toString()
    );
  }
  const product = productModel(req.tenantDB); // Initialize User model

  try {
    // Check for duplicate product name and category ID
    const duplicateProduct = await product.findOne({
      where: {
        product_code,
        product_name,
        category_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        id: { [Op.ne]: product_id },
      },
    });

    if (duplicateProduct) {
      return resError({
        ack_msg: "Product with the same name and category already exists.",
        developer_msg: "Product with the same name and category already exists",
      });
    }

    const existingProduct = await product.findOne({
      where: { id: product_id },
    });
    let convertPath = existingProduct?.product_img || ""; // Use existing image if no new image is uploaded
    let mediaName = "";

    if (productImg) {
      await fs.mkdirp(directoryPath); // Create directory if it doesn't exist
      const filePath = productImg.path;
      const fileName = path.basename(filePath);
      const destinationPath = path.join(directoryPath, fileName);

      // Move the new image file to the correct directory
      await fs.move(filePath, destinationPath);

      // Delete the old image if it exists
      if (existingProduct && existingProduct.product_img) {
        const oldImagePath = path.join(
          process.cwd(),
          "media-folder",
          "product-images",
          existingProduct.product_img
        );
        await fs.remove(oldImagePath);
      }

      // Set new image path
      convertPath =
        findCompanyId.company_masters_id.toString() + "/" + fileName;
      mediaName = productImg.originalname || fileName;
    }

    let finalInnerUnit = product_inner_unit;
    let finalOuterUnit = product_outer_unit;

    if (!finalInnerUnit || finalInnerUnit == "" || finalInnerUnit == null || finalInnerUnit == undefined) {
      finalInnerUnit = unit_id;
    }

    if (!finalOuterUnit || finalOuterUnit == "" || finalOuterUnit == null || finalOuterUnit == undefined) {
      finalOuterUnit = unit_id;
    }

    const updateProductResult = await product.update(
      {
        product_name: product_name,
        product_alias: product_alias,
        product_code: product_code,
        product_description: product_description,
        category_id: category_id, // If no file, this will be null
        unit: unit, // If no file, this will be null
        unit_id: unit_id, // If no file, this will be null
        product_group_id: product_group_id,
        product_inner_qty: product_inner_qty,
        product_outer_qty: product_outer_qty,
        product_inner_unit: finalInnerUnit,
        product_outer_unit: finalOuterUnit,
        product_length: product_length,
        product_width: product_width,
        is_serial_number: is_serial_number,
        product_height: product_height,
        rate: parseFloat(rate || 0).toFixed(2),
        GST: GST,
        gst_id: gst_id,
        purchase_gst_id: purchase_gst_id,
        net_rate: parseFloat(net_rate || 0).toFixed(2),
        purchase_rate: parseFloat(purchase_rate || 0).toFixed(2),
        purchase_gst_per: purchase_gst_per,
        purchase_net_rate: parseFloat(purchase_net_rate || 0).toFixed(2),
        product_img: convertPath,
        weight_or_size: Number(weight_or_size),
        min_stock_quantity: Number(min_stock_quantity),
        max_stock_quantity: Number(max_stock_quantity),
        product_types: Number(product_types),
        hsn_code: hsn_code,
        miracle_uom_name: req.body.miracle_uom_name !== undefined ? req.body.miracle_uom_name : (existingProduct?.miracle_uom_name || ""),
        products_column_number_1: req.body.products_column_number_1 || "",
        products_column_number_2: req.body.products_column_number_2 || "",
        products_column_number_3: req.body.products_column_number_3 || "",
        products_column_number_4: req.body.products_column_number_4 || "",
        products_column_number_5: req.body.products_column_number_5 || "",
        products_column_text_1: req.body.products_column_text_1 || "",
        products_column_text_2: req.body.products_column_text_2 || "",
        products_column_text_3: req.body.products_column_text_3 || "",
        products_column_text_4: req.body.products_column_text_4 || "",
        products_column_text_5: req.body.products_column_text_5 || "",
        products_column_text_area_1: req.body.products_column_text_area_1 || "",
        products_column_text_area_2: req.body.products_column_text_area_2 || "",
        products_column_text_area_3: req.body.products_column_text_area_3 || "",
        products_column_text_area_4: req.body.products_column_text_area_4 || "",
        products_column_text_area_5: req.body.products_column_text_area_5 || "",
        products_column_date_1: req.body.products_column_date_1 || "",
        products_column_date_2: req.body.products_column_date_2 || "",
        products_column_date_3: req.body.products_column_date_3 || "",
        products_column_date_4: req.body.products_column_date_4 || "",
        products_column_date_5: req.body.products_column_date_5 || "",
        products_column_date_and_time_1:
          req.body.products_column_date_and_time_1 || "",
        products_column_date_and_time_2:
          req.body.products_column_date_and_time_2 || "",
        products_column_date_and_time_3:
          req.body.products_column_date_and_time_3 || "",
        products_column_date_and_time_4:
          req.body.products_column_date_and_time_4 || "",
        products_column_date_and_time_5:
          req.body.products_column_date_and_time_5 || "",
        products_column_time_1: req.body.products_column_time_1 || "",
        products_column_time_2: req.body.products_column_time_2 || "",
        products_column_time_3: req.body.products_column_time_3 || "",
        products_column_time_4: req.body.products_column_time_4 || "",
        products_column_time_5: req.body.products_column_time_5 || "",
        products_column_switch_1: req.body.products_column_switch_1 || false,
        products_column_switch_2: req.body.products_column_switch_2 || false,
        products_column_switch_3: req.body.products_column_switch_3 || false,
        products_column_switch_4: req.body.products_column_switch_4 || false,
        products_column_switch_5: req.body.products_column_switch_5 || false,
        products_column_decimal_1: req.body.products_column_decimal_1 || "",
        products_column_decimal_2: req.body.products_column_decimal_2 || "",
        products_column_decimal_3: req.body.products_column_decimal_3 || "",
        products_column_decimal_4: req.body.products_column_decimal_4 || "",
        products_column_decimal_5: req.body.products_column_decimal_5 || "",
        products_column_dropdown_1: req.body.products_column_dropdown_1 || "",
        products_column_dropdown_2: req.body.products_column_dropdown_2 || "",
        products_column_dropdown_3: req.body.products_column_dropdown_3 || "",
        products_column_dropdown_4: req.body.products_column_dropdown_4 || "",
        products_column_dropdown_5: req.body.products_column_dropdown_5 || "",
        products_column_radio_1: req.body.products_column_radio_1 || "",
        products_column_radio_2: req.body.products_column_radio_2 || "",
        products_column_radio_3: req.body.products_column_radio_3 || "",
        products_column_radio_4: req.body.products_column_radio_4 || "",
        products_column_radio_5: req.body.products_column_radio_5 || "",
      },
      {
        where: { id: product_id },
      }
    );
    if (updateProductResult) {
      return resSuccess({
        ack_msg: "Product updated successfully",
        data: { item: updateProductResult },
      });
    } else {
      return resError();
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const productStockMovement = async (req) => {
  try {
    const { a_application_login_id, productId, selectedDates, warehouse_id } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const findIndiaMartApiKey = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: "0",
      },
      attributes: ["order_qty_unit"],
    });

    const cartItem = cartItemModel(req.tenantDB);
    const start = moment(selectedDates[0]).format("YYYY-MM-DD"); // Only date
    const end = moment(selectedDates[1]).format("YYYY-MM-DD"); // Only date
    let warehouseIds = [];

    // Only try to parse if warehouse_id exists and is a non-empty string
    if (typeof warehouse_id === 'string' && warehouse_id.trim() !== '') {
      warehouseIds = warehouse_id
        .split(',')
        .map(id => parseInt(id.trim(), 10))
        .filter(id => !isNaN(id));
    }

    const whereClause = {
      isDelete: 0,
      item_product_id: productId,
      cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
      cart_date: { [Op.between]: [start, end] },
      cart_number: { [Op.ne]: null, [Op.not]: "" },
      stock_type: { [Op.ne]: 0 },
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { company_masters_id: findCompanyId.company_masters_id },
      ],

      [Op.and]: [
        {
          [Op.or]: [
            // cart_type = 4 AND reference_type != 8
            {
              cart_type: 4,
              reference_type: { [Op.ne]: 8 },
            },
            {
              cart_type: 3,
              reference_type: { [Op.ne]: 9 },
            },

            {
              cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
            },
          ],
        },
      ],
    };

    if (warehouseIds.length > 0) {
      whereClause.item_warehouse_id = { [Op.in]: warehouseIds };
    }

    console.log("---------fdfdfdfdfdfdf---------");
    const resultCartItem = await cartItem.findAll({
      where: whereClause,
    });
    const contactMasters = contactModel(req.tenantDB);


    const whereClauseOpen = {
      isDelete: 0,
      item_product_id: productId,
      cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
      cart_date: { [Op.lt]: start },
      cart_number: { [Op.ne]: null, [Op.not]: "" },
      stock_type: { [Op.ne]: 0 },
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { company_masters_id: findCompanyId.company_masters_id },
      ],
      [Op.and]: [
        {
          [Op.or]: [
            // cart_type = 4 AND reference_type != 8
            {
              cart_type: 4,
              reference_type: { [Op.ne]: 8 },
            },
            {
              cart_type: 3,
              reference_type: { [Op.ne]: 9 },
            },

            {
              cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
            },
          ],
        },
      ],
    };

    if (warehouseIds.length > 0) {
      whereClauseOpen.item_warehouse_id = { [Op.in]: warehouseIds };
    }

    const findOpeningQty = await cartItem.findAll({
      where: whereClauseOpen,
    });

    const calOpenQty = findOpeningQty.reduce((total, item) => {
      if ((item.cart_type == 4 && item.reference_type != 8) || item.cart_type == 6 || item.cart_type == 8 || item.cart_type == 10) {
        return total + item.item_qty;
      } else if ((item.cart_type === 3 && item.reference_type != 9) || item.cart_type === 7 || item.cart_type === 9 || item.cart_type == 11) {
        return total - item.item_qty;
      }
      return total;
    }, 0);

    const closingQty = resultCartItem.reduce((total, item) => {
      if ((item.cart_type == 4 && item.reference_type != 8) || item.cart_type == 6 || item.cart_type == 8 || item.cart_type == 10) {
        return total + item.item_qty;
      } else if ((item.cart_type === 3 && item.reference_type != 9) || item.cart_type === 7 || item.cart_type === 9 || item.cart_type == 11) {
        return total - item.item_qty;
      }
      return total;
    }, 0);

    const calClosingQty = closingQty + calOpenQty;
    const modifiedData = await Promise.all(
      resultCartItem.map(async (item) => {

        let contact_name = "";

        if (item.contact_master_id) {
          const findContact = await contactMasters.findOne({
            where: {
              id: item.contact_master_id,
            },
            attributes: ["person_name", "company_name"],
          });

          contact_name =
            findContact?.person_name ||
            findContact?.company_name ||
            "";
        }

        return {
          ...item.toJSON(),
          to_customer_name: contact_name,
        };
      })
    );

    if (resultCartItem) {
      return resSuccess({
        data: {
          item: modifiedData,
          closing_qty: calClosingQty,
          open_qty: calOpenQty,
          company_unit_classification: findIndiaMartApiKey.dataValues.order_qty_unit,
        },
      });
    } else {
      return resError({
        ack_msg: "",
        developer_msg: "cart data is not found!",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const DeleteProducts = async (req) => {
  const { a_application_login_id, product_id, checkAllProducts } = req.body;
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);
  const { tenantDB } = req;

  const cartItemModels = cartItemModel(tenantDB);
  const productModels = productModel(tenantDB);
  const productListCustom = priceListModel(tenantDB);

  try {
    // Start a transaction
    return await tenantDB.transaction(async (transaction) => {
      if (checkAllProducts === 1) {
        // Check for dependencies in cart or price list
        const cartItems = await cartItemModels.findAll({
          where: {
            isDelete: 0,
            company_masters_id: findCompanyId.company_masters_id,
          },
          transaction,
        });

        const priceListItems = await productListCustom.findAll({
          where: {
            isDelete: 0,
            company_masters_id: findCompanyId.company_masters_id,
          },
          transaction,
        });

        if (cartItems.length > 0 || priceListItems.length > 0) {
          return resError({
            ack_msg:
              "Cannot delete all products because some exist in cart or price list.",
          });
        }

        // Delete all products
        await productModels.update(
          { isDelete: 1 },
          {
            where: {
              isDelete: 0,
              company_masters_id: findCompanyId.company_masters_id,
            },
            transaction,
          }
        );

        return resSuccess({
          ack_msg: "All products deleted successfully",
        });
      }

      // Handle single or multiple product deletions
      let productIds;
      if (typeof product_id === "string" && product_id.includes(",")) {
        productIds = product_id
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else {
        const parsedId = parseInt(product_id);
        productIds = isNaN(parsedId) ? [] : [parsedId];
      }

      if (productIds.length === 0) {
        return resError({
          ack_msg: "Invalid product ID(s)",
        });
      }

      // Check for dependencies in cart or price list for each product ID
      const dependentProducts = [];
      for (const id of productIds) {
        const productInCart = await cartItemModels.findAll({
          where: {
            isDelete: 0,
            company_masters_id: findCompanyId.company_masters_id,
            item_product_id: id,
          },
          transaction,
        });

        const productInPriceList = await productListCustom.findAll({
          where: {
            isDelete: 0,
            company_masters_id: findCompanyId.company_masters_id,
            product_id: id,
          },
          transaction,
        });

        if (productInCart.length > 0 || productInPriceList.length > 0) {
          dependentProducts.push(id);
        }
      }

      if (dependentProducts.length > 0) {
        const errorMessage =
          dependentProducts.length === productIds.length
            ? "Cannot delete the product(s) because they exist in cart or price list."
            : `Cannot delete product(s) with ID(s) ${dependentProducts.join(
              ", "
            )} because they exist in cart or price list.`;
        return resError({
          ack_msg: errorMessage,
        });
      }

      // Delete products with no dependencies
      const [updatedCount] = await productModels.update(
        { isDelete: 1 },
        {
          where: {
            isDelete: 0,
            id: productIds,
            company_masters_id: findCompanyId.company_masters_id,
          },
          transaction,
        }
      );

      if (updatedCount === 0) {
        return resError({
          ack_msg: "No products found to delete",
        });
      }

      return resSuccess({
        ack_msg:
          productIds.length > 1
            ? "Products deleted successfully"
            : "Product deleted successfully",
      });
    });
  } catch (error) {
    console.error("Error in DeleteProducts:", error);
    return resError({
      ack_msg: "An error occurred while deleting products",
    });
  }
};

export const generateProductSampleSheet = async (req) => {
  try {
    const { a_application_login_id } = req.body;
    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    const fileName = `sample_product_sheet_${randomUUID()}`;
    const format = 'xlsx'
    const cols = null;
    const headersObj = null;
    const outputDir = `media-folder/exports/products/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);

    let getCustomFormFieldR = await customFormFieldModelIntance.findAll({
      where: { form_type: 4, isDelete: 0 },
      attributes: ["title", "reference_column_name", "applicable_modules"],
      raw: true,
    });

    getCustomFormFieldR = Array.isArray(getCustomFormFieldR)
      ? getCustomFormFieldR.filter(f => !f.applicable_modules || String(f.applicable_modules).split(",").map(m => m.trim()).includes("4"))
      : [];

    const getCustomFormFieldObj = Array.isArray(getCustomFormFieldR)
      ? getCustomFormFieldR.reduce((acc, { reference_column_name, title }) => {
        acc[title] = '';
        return acc;
      }, {})
      : {};

    /** Default fields **/


    const excelColumnDefineArray = {
      "product_group": "DEMO GROUP",
      "category_name": "DEMO CATEGORY",
      "product_types": "Finished Goods",
      "product_name": "DEMO PRODUCT",
      "product_alias": "DEMO_PRODUCTS",
      "product_code": "DEMO1",
      "product_description": "DEMO DESCRIPTION",
      "product_inner_qty": "1",
      "product_inner_unit": "NOS",
      "product_outer_qty": "1",
      "product_outer_unit": "NOS",
      "unit_name": "NOS",
      "weight(gram)": "100",
      "min_stock_quantity": "1",
      "max_stock_quantity": "1000",
      "rate": "100",
      "sales_gst_label": "GST 18%",
      "purchase_rate": "50",
      "purchase_gst_label": "GST 18%",
      "hsn_code": "",
    };

    /** Merge dynamic fields **/
    const excelColumnDefineArrayDy = {
      ...excelColumnDefineArray,
      ...getCustomFormFieldObj,
    };

    const data = [excelColumnDefineArrayDy]; // One row sample


    const colorColumns = {
      product_group: "FFFF0000",
      category_name: "FFFF0000",
      product_types: "FFFF0000",
      product_name: "FFFF0000",
      unit_name: "FFFF0000",
      // rate: "FFFF0000",
      // gst: "FFFF0000",
    };
    /** Export Excel File **/
    const savedPath = await exportData(data, { format, fileName, columns: cols, headers: headersObj, autoDownload: false, outputDir: uploadDir, colorColumns });


    const fileUrl = `${EXPORTS_LINK_EXTENDED}products/${companyDetail.company_masters_id}/${savedPath.file_name}`;

    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name },
    });
  } catch (error) {
    console.error("generateProductSampleSheet Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const getExportsProducts = async (req) => {
  try {
    let {
      searchTerm,
      a_application_login_id,
      searchCategoryId,
    } = req.body;

    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    let whereClause = {
      isDelete: "0",
    };

    if (searchCategoryId) {
      whereClause.category_id = searchCategoryId;
    }

    let relevanceOrder;
    if (isValid(searchTerm) && searchTerm != 'undefined') {
      const searchableColumns = [
        'product_name',
        'product_alias',
        'product_code',
        'product_description',
        'product_barcode_number',
      ];
      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        searchTerm,
        searchableColumns
      );

      relevanceOrder = relevanceSearchOrder;

      whereClause = {
        ...whereClause,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          { searchClause },
        ],
      };
    }


    const fileName = randomUUID();
    const format = 'xlsx'
    const cols = null;
    const headersObj = null;
    const outputDir = `media-folder/exports/products/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    /* get custome form field */
    let getCustomFormFieldR = await customFormFieldModelIntance.findAll({
      where: { form_type: 4, isDelete: 0 },
      attributes: ["title", "reference_column_name", "applicable_modules"],
      raw: true
    });

    getCustomFormFieldR = isValid(getCustomFormFieldR)
      ? getCustomFormFieldR.filter(f => !f.applicable_modules || String(f.applicable_modules).split(",").map(m => m.trim()).includes("4"))
      : [];

    const getCustomFormFieldObj = isValid(getCustomFormFieldR) ? getCustomFormFieldR.reduce((acc, { reference_column_name, title }) => {
      acc[reference_column_name] = title;
      return acc;
    }, {}) : {};

    /* get custome form field */

    const excelColumnDefineArray = {
      "product_types": "Product Types",
      "category_id": "Product Category",
      "product_name": "Product Name",
      "product_alias": "Product Alias",
      "product_code": "Product Code",
      "product_description": "Product Description",
      "unit": "Unit",
      "weight_or_size": "Weight(Gram)",
      "hsn_code": "HSN Code",
      "min_stock_quantity": "Min Stock Quantity",
      "max_stock_quantity": "Max Stock Quantity",
      "rate": "Sale Rate",
      "GST": "GST (%)",
      "net_rate": "Sale Net Rate",
      "purchase_rate": "Purchase Rate",
      "purchase_gst_per": "Purchase GST (%)",
      "purchase_net_rate": "Purchase Net Rate",
    };

    const excelColumnDefineArrayDy = { ...excelColumnDefineArray, ...getCustomFormFieldObj };

    const productCustom = productModel(req.tenantDB);
    const productTypesModelInstance = productTypesModel(req.tenantDB);
    const order = [];
    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }
    order.push(['product_name', 'ASC']);

    const productsList = await productCustom.findAll({
      where: whereClause,
      order,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT categories.category_name FROM categories WHERE categories.id = products.category_id AND products.isDelete=0)"
            ),
            "category_name",
          ],
        ],
      },
    });

    const sanitizedContacts = await Promise.all(
      productsList.map(async (productItem) => {
        const sanitized = sanitizeObjectOfNull(productItem.toJSON());

        if (isValid(sanitized.product_types)) {
          const productTypesName = await productTypesModelInstance.findOne({
            where: {
              id: sanitized.product_types,
              isDelete: 0,
            },
            attributes: ["name"],
            raw: true
          });

          sanitized.product_types = productTypesName?.name || "";
        }

        sanitized.category_id = sanitized?.category_name || "";

        let objectTemp = {};
        Object.keys(excelColumnDefineArrayDy).map((k) => {
          objectTemp[excelColumnDefineArrayDy[k]] = sanitized[k];
        })
        return objectTemp;
      })
    );

    const data = sanitizedContacts;
    /* Populating Data */

    const savedPath = await exportData(data, { format, fileName, columns: cols, headers: headersObj, autoDownload: false, outputDir: uploadDir });
    const fileUrl = `${EXPORTS_LINK_EXTENDED}products/${companyDetail.company_masters_id}/${savedPath.file_name}`
    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name }
    });
  } catch (err) {
    console.error(err);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${err.message}`,
    });
  }
};

export const getExportsProductsForUpdateData = async (req) => {
  try {
    let {
      searchTerm,
      a_application_login_id,
    } = req.body;

    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    // order_qty_unit: 1=Quantity only, 2=+Inner, 3=+Outer, 4=+Inner+Outer
    // (NewCreateCompanyController.ts's orderQtyList) -- inner/outer packaging
    // isn't a concept this company uses at all when left at the "1" default,
    // so those 2 columns would just be permanently-empty noise in the sheet.
    const companyOrderQtySetting = await companyModel.findOne({
      where: { id: companyDetail.company_masters_id, isDelete: 0 },
      attributes: ["order_qty_unit"],
    });
    const innerOuterQtyActive = Number(companyOrderQtySetting?.order_qty_unit) > 1;

    let whereClause = {
      isDelete: "0",
    };

    let relevanceOrder;

    if (isValid(searchTerm) && searchTerm != "undefined") {
      const searchableColumns = [
        "product_name",
        "product_alias",
        "product_code",
        "product_description",
        "product_barcode_number",
      ];

      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        searchTerm,
        searchableColumns
      );

      relevanceOrder = relevanceSearchOrder;

      whereClause = {
        ...whereClause,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          { searchClause },
        ],
      };
    }

    const fileName = randomUUID();
    const format = "xlsx";
    const cols = null;
    const headersObj = null;

    const outputDir = `media-folder/exports/products/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    /* get custom form field */
    const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);

    let getCustomFormFieldR = await customFormFieldModelIntance.findAll({
      where: { form_type: 4, isDelete: 0 },
      attributes: ["title", "reference_column_name", "applicable_modules"],
      raw: true,
    });

    getCustomFormFieldR = isValid(getCustomFormFieldR)
      ? getCustomFormFieldR.filter(f => !f.applicable_modules || String(f.applicable_modules).split(",").map(m => m.trim()).includes("4"))
      : [];

    const getCustomFormFieldObj = isValid(getCustomFormFieldR)
      ? getCustomFormFieldR.reduce(
        (acc, { reference_column_name, title }) => {
          acc[reference_column_name] = title;
          return acc;
        },
        {}
      )
      : {};

    /* get custom form field */

    const excelColumnDefineArray = {
      id: "product_id",
      product_group: "product_group",
      product_category: "product_category",
      product_name: "product_name",
      product_alias: "product_alias",
      product_code: "Product Code",
      product_description: "product_description",
      weight_or_size: "weight_or_size",
      hsn_code: "hsn_code",
      min_stock_quantity: "min_stock_quantity",
      max_stock_quantity: "max_stock_quantity",
      rate: "rate",
      gst_id: "sales_gst_label",
      purchase_rate: "purchase_rate",
      purchase_gst_id: "purchase_gst_label",
      ...(innerOuterQtyActive && {
        product_inner_qty: "product_inner_qty",
        product_outer_qty: "product_outer_qty",
      }),
    };

    const excelColumnDefineArrayDy = {
      ...excelColumnDefineArray,
      ...getCustomFormFieldObj,
    };

    const productCustom = productModel(req.tenantDB);
    const taxModelInstance = taxModel(req.tenantDB);

    const order = [];

    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }

    order.push(["id", "ASC"]);

    const productsList = await productCustom.findAll({
      where: whereClause,
      order,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT categories.category_name FROM categories WHERE categories.id = products.category_id AND products.isDelete=0)"
            ),
            "category_name",
          ],
          [
            Sequelize.literal(
              "(SELECT product_groups.group_name FROM product_groups WHERE product_groups.id = products.product_group_id AND product_groups.isDelete=0)"
            ),
            "group_name",
          ],
        ],
      },
    });

    const [taxMasterList] = await Promise.all([
      taxModelInstance.findAll({
        where: {
          isDelete: 0,
        },
        raw: true,
        attributes: ["name", "id", "value"]
      }),
    ]);

    const taxMasterIdGroupSet = new Map(
      taxMasterList.map(p => [
        Number(p.id),
        p.name
      ])
    );

    const sanitizedContacts = productsList.map((productItem) => {
      const sanitized = sanitizeObjectOfNull(productItem.toJSON());
      sanitized['gst_id'] = sanitized['gst_id'] ? taxMasterIdGroupSet.get(Number(sanitized['gst_id'])) : ''
      sanitized['purchase_gst_id'] = sanitized['purchase_gst_id'] ? taxMasterIdGroupSet.get(Number(sanitized['purchase_gst_id'])) : ''
      sanitized['product_group'] = sanitized['group_name'] || ''
      sanitized['product_category'] = sanitized['category_name'] || ''
      let objectTemp = {};

      Object.keys(excelColumnDefineArrayDy).map((k) => {
        objectTemp[excelColumnDefineArrayDy[k]] = sanitized[k];
      });

      return objectTemp;
    });

    const data = sanitizedContacts;

    /* Populating Data */

    const savedPath = await exportData(data, {
      format,
      fileName,
      columns: cols,
      headers: headersObj,
      autoDownload: false,
      outputDir: uploadDir,
    });

    const fileUrl = `${EXPORTS_LINK_EXTENDED}products/${companyDetail.company_masters_id}/${savedPath.file_name}`;

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


export const SerialNumberWiseStockCheck = async (req) => {
  try {

    const {
      a_application_login_id,
      serial_number,
      selectedDates,
      warehouse_id,
    } = req.body;

    // =========================
    // VALIDATION
    // =========================

    if (
      !serial_number ||
      serial_number.trim() === ""
    ) {
      return resError({
        ack_msg:
          "Serial Number is required",

        developer_msg:
          "serial_number is missing in request",
      });
    }

    // =========================
    // COMPANY
    // =========================

    const findCompanyId =
      await getCompanyByLoginId(
        a_application_login_id
      );

    const findIndiaMartApiKey =
      await companyModel.findOne({
        where: {
          id:
            findCompanyId.company_masters_id,

          isDelete: "0",
        },

        attributes: [
          "order_qty_unit",
        ],
      });

    // =========================
    // MODELS
    // =========================

    const cartItem =
      cartItemModel(req.tenantDB);

    const serialNumberModel =
      cartSerialNumberModel(
        req.tenantDB
      );

    const contactMasters =
      contactModel(req.tenantDB);

    // =========================
    // DATE
    // =========================

    const start = moment(
      selectedDates[0]
    ).format("YYYY-MM-DD");

    const end = moment(
      selectedDates[1]
    ).format("YYYY-MM-DD");

    // =========================
    // WAREHOUSE IDS
    // =========================

    let warehouseIds = [];

    if (
      typeof warehouse_id === "string" &&
      warehouse_id.trim() !== ""
    ) {

      warehouseIds = warehouse_id
        .split(",")
        .map((id) =>
          parseInt(id.trim(), 10)
        )
        .filter(
          (id) => !isNaN(id)
        );
    }

    // =========================
    // STEP 1
    // CHECK SERIAL NUMBER
    // =========================

    const serialData =
      await serialNumberModel.findAll({
        where: {
          isDelete: 0,

          serial_numbers:
            serial_number.trim(),
        },

        attributes: [
          "cart_item_id",
        ],

        raw: true,
      });

    // =========================
    // SERIAL NOT FOUND
    // =========================

    if (!serialData.length) {

      return resError({
        ack_msg:
          "Serial number not found",

        developer_msg:
          "No matching serial number found",
      });
    }

    // =========================
    // CART ITEM IDS
    // =========================

    const cartItemIds = [
      ...new Set(
        serialData
          .map(
            (item) =>
              item.cart_item_id
          )
          .filter(Boolean)
      ),
    ];

    // =========================
    // MAIN WHERE
    // =========================

    const whereClause = {

      isDelete: 0,

      id: {
        [Op.in]:
          cartItemIds,
      },

      cart_type: {
        [Op.in]: [
          4, 3, 6, 7,
          8, 9, 10, 11,
        ],
      },

      cart_date: {
        [Op.between]: [
          start,
          end,
        ],
      },

      cart_number: {
        [Op.ne]: null,
        [Op.not]: "",
      },

      stock_type: {
        [Op.ne]: 0,
      },

      [Op.or]: [
        {
          a_application_login_id:
            a_application_login_id,
        },

        {
          company_masters_id:
            findCompanyId.company_masters_id,
        },
      ],

      [Op.and]: [
        {
          [Op.or]: [

            {
              cart_type: 4,

              reference_type: {
                [Op.ne]: 8,
              },
            },

            {
              cart_type: 3,

              reference_type: {
                [Op.ne]: 9,
              },
            },

            {
              cart_type: {
                [Op.in]: [
                  4, 3, 6, 7,
                  8, 9, 10, 11,
                ],
              },
            },
          ],
        },
      ],
    };

    // =========================
    // WAREHOUSE FILTER
    // =========================

    if (warehouseIds.length > 0) {

      whereClause.item_warehouse_id = {
        [Op.in]:
          warehouseIds,
      };
    }

    // =========================
    // MAIN DATA
    // =========================

    const resultCartItem =
      await cartItem.findAll({
        where: whereClause,
      });

    // =========================
    // OPENING WHERE
    // =========================

    const whereClauseOpen = {

      isDelete: 0,

      id: {
        [Op.in]:
          cartItemIds,
      },

      cart_type: {
        [Op.in]: [
          4, 3, 6, 7,
          8, 9, 10, 11,
        ],
      },

      cart_date: {
        [Op.lt]: start,
      },

      cart_number: {
        [Op.ne]: null,
        [Op.not]: "",
      },

      stock_type: {
        [Op.ne]: 0,
      },

      [Op.or]: [
        {
          a_application_login_id:
            a_application_login_id,
        },

        {
          company_masters_id:
            findCompanyId.company_masters_id,
        },
      ],

      [Op.and]: [
        {
          [Op.or]: [

            {
              cart_type: 4,

              reference_type: {
                [Op.ne]: 8,
              },
            },

            {
              cart_type: 3,

              reference_type: {
                [Op.ne]: 9,
              },
            },

            {
              cart_type: {
                [Op.in]: [
                  4, 3, 6, 7,
                  8, 9, 10, 11,
                ],
              },
            },
          ],
        },
      ],
    };

    // =========================
    // WAREHOUSE FILTER
    // =========================

    if (warehouseIds.length > 0) {

      whereClauseOpen.item_warehouse_id = {
        [Op.in]:
          warehouseIds,
      };
    }

    // =========================
    // OPENING DATA
    // =========================

    const findOpeningQty =
      await cartItem.findAll({
        where:
          whereClauseOpen,
      });

    // =========================
    // OPENING QTY
    // =========================

    const calOpenQty =
      findOpeningQty.reduce(
        (total, item) => {

          if (
            (
              item.cart_type == 4 &&
              item.reference_type != 8
            ) ||

            item.cart_type == 6 ||
            item.cart_type == 8 ||
            item.cart_type == 10
          ) {

            return (
              total +
              item.item_qty
            );
          }

          else if (
            (
              item.cart_type === 3 &&
              item.reference_type != 9
            ) ||

            item.cart_type === 7 ||
            item.cart_type === 9 ||
            item.cart_type == 11
          ) {

            return (
              total -
              item.item_qty
            );
          }

          return total;
        },
        0
      );

    // =========================
    // CLOSING QTY
    // =========================

    const closingQty =
      resultCartItem.reduce(
        (total, item) => {

          if (
            (
              item.cart_type == 4 &&
              item.reference_type != 8
            ) ||

            item.cart_type == 6 ||
            item.cart_type == 8 ||
            item.cart_type == 10
          ) {

            return (
              total +
              item.item_qty
            );
          }

          else if (
            (
              item.cart_type === 3 &&
              item.reference_type != 9
            ) ||

            item.cart_type === 7 ||
            item.cart_type === 9 ||
            item.cart_type == 11
          ) {

            return (
              total -
              item.item_qty
            );
          }

          return total;
        },
        0
      );

    const calClosingQty =
      closingQty +
      calOpenQty;

    // =========================
    // CONTACT NAME
    // =========================

    const modifiedData =
      await Promise.all(

        resultCartItem.map(
          async (item) => {

            let contact_name =
              "";

            if (
              item.contact_master_id
            ) {

              const findContact =
                await contactMasters.findOne({
                  where: {
                    id:
                      item.contact_master_id,
                  },

                  attributes: [
                    "person_name",
                    "company_name",
                  ],
                });

              contact_name =
                findContact?.person_name ||

                findContact?.company_name ||

                "";
            }

            return {

              ...item.toJSON(),

              to_customer_name:
                contact_name,
            };
          }
        )
      );

    // =========================
    // RESPONSE
    // =========================

    return resSuccess({
      data: {

        item:
          modifiedData,

        closing_qty:
          calClosingQty,

        open_qty:
          calOpenQty,

        company_unit_classification:
          findIndiaMartApiKey
            ?.dataValues
            ?.order_qty_unit,
      },
    });

  } catch (error) {

    return resBadRequest({
      ack_msg: " ",

      developer_msg:
        `${error.message}`,
    });
  }
};