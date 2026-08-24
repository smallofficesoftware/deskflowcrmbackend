import ejs from "ejs";
import fs from "fs-extra";
import moment from "moment";
import path from "path";
import pdf from "pdf-creator-node";
import PDFMerger from "pdf-merger-js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import {
  calculatePackQty,
  formatDateWithoutDash,
  formatNumber,
  isValid,
  sanitizeFileName
} from "../../utils/sharedFunctions.js";
// import sequelize from "../config/sequelize.js";
import { GoogleGenerativeAI } from '@google/generative-ai';
import QRCode from "qrcode";
import Sequelize, { Op } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { isFeatureEnabled } from "../company_setup/featureFlagServices.js";
import { generateQuotationPdf } from "../pdfmeEngine/generateDocument.js";
import { generateShippingLabelPdf } from "../pdfmeEngine/shippingLabelGenerate.js";
import { sniffImageMime } from "../pdfmeEngine/imageOverlay.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartSerialNumberModel } from "../../models/activities/cartSerialNumberModel.js";
import { cartvsattachmentmodel } from "../../models/activities/cartVSattachmentModel.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { printSettingModel } from "../../models/company_setup/printSettingModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { wareHouseModel } from "../../models/other_settings/wareHouseModel.js";
import { priceListModel } from "../../models/product_settings/priceListModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { sendMultipleNotification } from "../../services/company_setup/thirdPartyIntegrationService.js";
import {
  __dirnameConstant,
  APP_URL_SMALL_OFFICE_CRM,
  BACKEND_OF_SMALL_OFFICE_CRM_END_POINT,
  COMPANY_IMG_LINK_EXTENDED,
  ORDER_ATTACHMENT_LINK_EXTENDED,
  PACKING_FORWARDING_CHARGE_GST,
  PACKING_FORWARDING_CHARGE_HSN_CODE,
  PDF_LINK_EXTENDED,
  PDF_LINK_SHIPPING_LABEL,
  PRODUCT_IMG_LINK_EXTENDED,
  TRANSPORT_CHARGE__GST,
  TRANSPORT_CHARGE_HSN_CODE,
} from "../../utils/appConstants.js";
import { PAGE_ID, SALES_DEFINED_IDS_FOR_STATUS, STOCK_IN_OUT_ACCESSIBILITY } from "../../utils/AppEnumeration.js";
import { numberToWordsCurrency } from "../../utils/numberToWordsCurrency.js";
import {
  formatDateAndTimeCreateDateTime,
  formatDateCustom,
  getNumberSeries,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import {
  createAccountTransaction,
  getCompanyByLoginId,
  getCompanyDetailByLoginId,
  getLoginDetailById,
  insertStagesAndStatusLogs
} from "../commonServices.js";


const orderTypesList = [
  { id: "1", type: "quotation" },
  { id: "2", type: "order" },
  { id: "3", type: "invoice" },
  { id: "4", type: "purchase_order" },
  { id: "5", type: "order_purchase" },
  { id: "6", type: "return_sales_invoice" },
  { id: "7", type: "return_purchase_invoice" },
  { id: "8", type: "inward" },
  { id: "9", type: "dispatch" },
  { id: "12", type: "proforma_invoice" },
];
const orderTypesShowList = [
  { id: "1", type: "Quotation" },
  { id: "2", type: "Sales Order" },
  { id: "3", type: "Sales Invoice" },
  { id: "4", type: "Purchase Invoice" },
  { id: "5", type: "Purchase Order" },
  { id: "6", type: "Return Sales Invoice" },
  { id: "7", type: "Return Purchase Invoice" },
  { id: "8", type: "Inward" },
  { id: "9", type: "Dispatch" },
  { id: "12", type: "Proforma Invoice" },
];
const paymentModeList = [
  { id: "2", type: "Debit" },
  { id: "3", type: "Debit" },
  { id: "4", type: "Credit" },
  { id: "5", type: "Credit" },
  { id: "6", type: "Credit" },
  { id: "7", type: "Debit" },
];
const symbolCurrency = "INR";

export const updateCartStatus = async (req, detail = {}) => {
  try {
    const { target_id, type, a_application_login_id } = detail || {};
    if (!isValid(target_id) || !isValid(type)) {
      return { ack: 0, ack_msg: 'Required detail not found' }
    }

    if (type != 2 && type != 5) {
      return { ack: 0, ack_msg: 'status not aplied' }
    }

    const cartItemModelInstance = cartItemModel(req.tenantDB);
    const cartModelInstance = cartModel(req.tenantDB);
    const cartItemTotalQtyDb = await cartItemModelInstance.sum("item_qty", { where: { isDelete: 0, cart_id: target_id, cart_type: type } });
    const cartItemIdDb = await cartItemModelInstance.findAll({ where: { isDelete: 0, cart_id: target_id, cart_type: type }, attributes: ["item_product_id"] });
    const cartItemIds = cartItemIdDb?.map(v => v.item_product_id);
    const cartItemTotalQtyConversationDb = await cartItemModelInstance.sum("item_qty", { where: { isDelete: 0, referance_cart_id: target_id, reference_type: type, item_product_id: cartItemIds } });
    let status = 0;
    if (!isValid(cartItemTotalQtyConversationDb)) {
      status = SALES_DEFINED_IDS_FOR_STATUS?.[type]?.[1] || 0;
    } else if (cartItemTotalQtyConversationDb >= cartItemTotalQtyDb) {
      status = SALES_DEFINED_IDS_FOR_STATUS?.[type]?.[3] || 0;
    } else {
      status = SALES_DEFINED_IDS_FOR_STATUS?.[type]?.[2] || 0;
    }
    await cartModelInstance.update({ cart_status: status, temp: 2 }, { where: { id: target_id, type: type } });
    /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    await insertStagesAndStatusLogs(req, {
      reference_table: "carts",
      reference_id: target_id,
      status_id: status,
      a_application_login_id: a_application_login_id,
      inside_table_type: type
    })
    /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
  } catch (error) {
    console.log("updateCartStatus Error", error)
    return { ack: 0, ack_msg: 'status not aplied' }
  }

}

export const getSrNumberGenerateAutoOrManuly = async (type, company_data) => {
  let flag;
  if (type == 1) { // Order
    flag = company_data[0]?.quotation_sr_number_generate_flag
  } else if (type == 2) { // Quotation
    flag = company_data[0]?.order_sr_number_generate_flag
  } else if (type == 3) { // Invoice
    flag = company_data[0]?.sales_invoice_sr_number_generate_flag
  } else if (type == 4) { // purchase invoice
    flag = company_data[0]?.purchase_invoice_sr_number_generate_flag
  } else if (type == 5) { // order purchase
    flag = company_data[0]?.purchase_order_sr_number_generate_flag
  } else if (type == 6) { // return_sales_invoice
    flag = company_data[0]?.return_sales_invoice_sr_number_generate_flag
  } else if (type == 7) { // return_purchase_invoice
    flag = company_data[0]?.return_purchase_invoice_sr_number_generate_flag
  } else if (type == 8) { // inward
    flag = company_data[0]?.inward_sr_number_generate_flag
  } else if (type == 9) { // dispatch
    flag = company_data[0]?.dispatch_sr_number_generate_flag
  }

  return flag
};

export const getAutoPopulateLastDataFetchFlag = async (type, company_data) => {
  let flag;
  if (type == 1) { // Quotation
    flag = company_data[0]?.quotation_effect_last_data_on_new
  } else if (type == 2) { // Order
    flag = company_data[0]?.order_effect_last_data_on_new
  } else if (type == 3) { // Invoice
    flag = company_data[0]?.sales_invoice_effect_last_data_on_new
  } else if (type == 4) { // purchase invoice
    flag = company_data[0]?.purchase_invoice_effect_last_data_on_new
  } else if (type == 5) { // order purchase
    flag = company_data[0]?.purchase_order_effect_last_data_on_new
  } else if (type == 6) { // return_sales_invoice
    flag = company_data[0]?.return_sales_invoice_effect_last_data_on_new
  } else if (type == 7) { // return_purchase_invoice
    flag = company_data[0]?.return_purchase_invoice_effect_last_data_on_new
  }
  return flag
};

export const orderCreate = async (req, res) => {

  try {

    const { cart, items, a_application_login_id, is_approve, Approve_application_login_id } = req.body;

    // Validate input
    if (!items || !items.length) {
      return resError({
        ack_msg: "Please select Product",
        developer_msg: "No items in cart",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({ developer_msg: "Company not found" });
    }

    const byPassCompany = [];
    const current_date = new Date();
    let formattedDateTime = moment(current_date).format("YYYY-MM-DD HH:mm:ss");
    if (byPassCompany.includes(findCompanyId.company_masters_id)) {
      formattedDateTime = moment('2026-03-31 15:31:00', "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD HH:mm:ss");
      cart.cart_date = '2026-03-31';
    }


    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const CATSerialNumberModal = cartSerialNumberModel(req.tenantDB);

    const fatchStrickProductCheckOrNot = await companyModel.findAll({
      where: {
        isDelete: 0,
        id: findCompanyId.company_masters_id,
      },
      attributes: ["is_strict_check_product_stock", "quotation_sr_number_generate_flag", "order_sr_number_generate_flag", "sales_invoice_sr_number_generate_flag",
        "return_sales_invoice_sr_number_generate_flag", "purchase_order_sr_number_generate_flag", "purchase_invoice_sr_number_generate_flag",
        "return_purchase_invoice_sr_number_generate_flag", "inward_sr_number_generate_flag", "dispatch_sr_number_generate_flag", "is_strict_wharehouse_wise_product_stock_check"]
    });

    const sr_number_generatetion_flag = await getSrNumberGenerateAutoOrManuly(cart.type, fatchStrickProductCheckOrNot);

    if (sr_number_generatetion_flag == 1 && is_approve == 1) {
      if (!isValid(cart?.entered_series_number)) {
        return resError({
          ack_msg: "Please enter sr number",
          developer_msg: "series not entered",
        });
      }
      if (!isValid(cart?.entered_series_date)) {
        return resError({
          ack_msg: "Please select sr number date",
          developer_msg: "series date not entered",
        });
      }
    }

    if (
      is_approve == 1 &&
      [3, 9].includes(cart.type) &&
      fatchStrickProductCheckOrNot[0]?.is_strict_check_product_stock == 2
    ) {
      const CartItem = cartItemModel(req.tenantDB);

      for (const item of items) {
        const whereClauseStock = {
          isDelete: 0,
          item_product_id: item.item_product_id,
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

        let warehouseName = "total stock";

        if (
          fatchStrickProductCheckOrNot[0]?.is_strict_wharehouse_wise_product_stock_check == 2 && item.item_warehouse_id
        ) {
          whereClauseStock.item_warehouse_id = item.item_warehouse_id;

          // ✅ Fetch warehouse name
          const WarehouseModel = wareHouseModel(req.tenantDB);

          const warehouseData = await WarehouseModel.findOne({
            where: {
              id: item.item_warehouse_id,
              isDelete: 0,
            },
            attributes: ["warehouse_name"],
          });

          if (warehouseData) {
            warehouseName = warehouseData.warehouse_name;
          }
        }
        console.log("whereClauseStockwhereClauseStock", whereClauseStock);

        const stockItems = await CartItem.findAll({
          where: whereClauseStock,
          attributes: ["item_product_id", "cart_type", "item_qty", "reference_type"]
        });

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
        // cart_item na tyable ma salaes invoice jetli padeli hoy aenp total aape
        // Calculate current stock
        const currentStock = stockItems.reduce((total, row) => {
          if ((row.cart_type == 4 && row.reference_type != 8) || row.cart_type == 6 || row.cart_type == 8 || row.cart_type == 10) {
            return total + Number(row.item_qty);
          } else if ((row.cart_type == 3 && row.reference_type != 9) || row.cart_type == 7 || row.cart_type == 9 || row.cart_type == 11) {
            return total - Number(row.item_qty);
          }
          return total;
        }, 0);
        //STOCK VALIDATION
        if (Number(item.item_qty) > currentStock) {
          return resError({
            ack_msg: `Product "${item.item_product_name}" has only ${currentStock} stock in ${warehouseName}, you are trying to use ${item.item_qty}`,
            developer_msg: "Stock validation failed",
            data: {
              product_id: item.item_product_id,
              available_stock: currentStock,
              requested_qty: item.item_qty,
            },
          });
        }
      }
    }
    // Get financial year details if approved
    let financialYearDetail;
    let getStockType = "";
    if (is_approve === 1) {
      financialYearDetail = await getNumberSeries(
        findCompanyId.company_masters_id,
        cart.type,
        cart.cart_date,
        cart.sr_by_prifix,
        req
      );

      if (sr_number_generatetion_flag == 1) {

        const isExist = await CATModel.findOne({ where: { isDelete: 0, cart_number: cart?.entered_series_number, type: cart.type } });
        if (isExist) {
          return resError({
            ack_msg: "Entered sr number are already exist",
            developer_msg: "Series is duplicate",
          });
        }
        financialYearDetail.order_no = cart?.entered_series_number;
        financialYearDetail.sr_by_no = 0;
        financialYearDetail.sr_by_prifix = "";
        formattedDateTime = moment(cart?.entered_series_date).format("YYYY-MM-DD") + " " + moment().format("HH:mm:ss");
        cart.cart_date = moment(cart?.entered_series_date).format("YYYY-MM-DD");
      }

      // cart Type wise add  stock_type
      getStockType = STOCK_IN_OUT_ACCESSIBILITY[cart.type] ?? "";
    }

    // Prepare cart custom fields from the first item (as per payload structure)
    const cartItemCustom = {
      carts_column_number_1: cart.carts_column_number_1 || "",
      carts_column_number_2: cart.carts_column_number_2 || "",
      carts_column_number_3: cart.carts_column_number_3 || "",
      carts_column_number_4: cart.carts_column_number_4 || "",
      carts_column_number_5: cart.carts_column_number_5 || "",
      carts_column_text_1: cart.carts_column_text_1 || "",
      carts_column_text_2: cart.carts_column_text_2 || "",
      carts_column_text_3: cart.carts_column_text_3 || "",
      carts_column_text_4: cart.carts_column_text_4 || "",
      carts_column_text_5: cart.carts_column_text_5 || "",
      carts_column_text_area_1: cart.carts_column_text_area_1 || "",
      carts_column_text_area_2: cart.carts_column_text_area_2 || "",
      carts_column_text_area_3: cart.carts_column_text_area_3 || "",
      carts_column_text_area_4: cart.carts_column_text_area_4 || "",
      carts_column_text_area_5: cart.carts_column_text_area_5 || "",
      carts_column_date_1: cart.carts_column_date_1 || "",
      carts_column_date_2: cart.carts_column_date_2 || "",
      carts_column_date_3: cart.carts_column_date_3 || "",
      carts_column_date_4: cart.carts_column_date_4 || "",
      carts_column_date_5: cart.carts_column_date_5 || "",
      carts_column_date_and_time_1: cart.carts_column_date_and_time_1 || "",
      carts_column_date_and_time_2: cart.carts_column_date_and_time_2 || "",
      carts_column_date_and_time_3: cart.carts_column_date_and_time_3 || "",
      carts_column_date_and_time_4: cart.carts_column_date_and_time_4 || "",
      carts_column_date_and_time_5: cart.carts_column_date_and_time_5 || "",
      carts_column_time_1: cart.carts_column_time_1 || "",
      carts_column_time_2: cart.carts_column_time_2 || "",
      carts_column_time_3: cart.carts_column_time_3 || "",
      carts_column_time_4: cart.carts_column_time_4 || "",
      carts_column_time_5: cart.carts_column_time_5 || "",
      carts_column_switch_1: cart.carts_column_switch_1 ? 1 : 0,
      carts_column_switch_2: cart.carts_column_switch_2 ? 1 : 0,
      carts_column_switch_3: cart.carts_column_switch_3 ? 1 : 0,
      carts_column_switch_4: cart.carts_column_switch_4 ? 1 : 0,
      carts_column_switch_5: cart.carts_column_switch_5 ? 1 : 0,
      carts_column_decimal_1: cart.carts_column_decimal_1 || "",
      carts_column_decimal_2: cart.carts_column_decimal_2 || "",
      carts_column_decimal_3: cart.carts_column_decimal_3 || "",
      carts_column_decimal_4: cart.carts_column_decimal_4 || "",
      carts_column_decimal_5: cart.carts_column_decimal_5 || "",
      carts_column_dropdown_1: cart.carts_column_dropdown_1 || "",
      carts_column_dropdown_2: cart.carts_column_dropdown_2 || "",
      carts_column_dropdown_3: cart.carts_column_dropdown_3 || "",
      carts_column_dropdown_4: cart.carts_column_dropdown_4 || "",
      carts_column_dropdown_5: cart.carts_column_dropdown_5 || "",
      carts_column_radio_1: cart.carts_column_radio_1 || "",
      carts_column_radio_2: cart.carts_column_radio_2 || "",
      carts_column_radio_3: cart.carts_column_radio_3 || "",
      carts_column_radio_4: cart.carts_column_radio_4 || "",
      carts_column_radio_5: cart.carts_column_radio_5 || "",
      carts_column_page_text_1: cart.carts_column_page_text_1 || "",
      carts_column_page_text_2: cart.carts_column_page_text_2 || "",
      carts_column_page_text_3: cart.carts_column_page_text_3 || "",
      carts_column_page_text_4: cart.carts_column_page_text_4 || "",
      carts_column_page_text_5: cart.carts_column_page_text_5 || "",
      carts_column_page_url_1: cart.carts_column_page_url_1 || "",
      carts_column_page_url_2: cart.carts_column_page_url_2 || "",
      carts_column_page_url_3: cart.carts_column_page_url_3 || "",
      carts_column_page_url_4: cart.carts_column_page_url_4 || "",
      carts_column_page_url_5: cart.carts_column_page_url_5 || "",
    };

    // Prepare cart body
    let cartBody;
    switch (is_approve) {
      case 1:
        cartBody = {
          ...cart,
          grand_total: cart.grand_total,
          cart_number: financialYearDetail?.order_no || "",
          sr_by_number: financialYearDetail?.sr_by_no || 0,
          sr_by_prifix: financialYearDetail?.sr_by_prifix || "cart",
          cart_status: 0,
          created_date_time: formattedDateTime,
          a_application_login_id: a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          approve_a_application_login_id: Approve_application_login_id,
          update_Date_time: formattedDateTime,
          stock_type: getStockType,
          ...cartItemCustom,
        };
        break;
      case 2:
        cartBody = {
          ...cart,
          grand_total: cart.grand_total,
          cart_status: 0,
          created_date_time: formattedDateTime,
          a_application_login_id: a_application_login_id,
          approve_a_application_login_id: Approve_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          stock_type: getStockType,
          ...cartItemCustom,
        };
        break;
      default:
        cartBody = {
          ...cart,
          grand_total: cart.grand_total,
          cart_status: 0,
          created_date_time: formattedDateTime,
          a_application_login_id: a_application_login_id,
          approve_a_application_login_id: Approve_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          stock_type: getStockType,
          ...cartItemCustom,
        };
        break;
    }

    // Create cart
    const resultCart = await CATModel.create(cartBody);
    if (!resultCart) {
      return resError({ ack_msg: "Failed to create cart", developer_msg: "Failed to create cart" });
    }
    const cartId = resultCart.dataValues.id;
    const cart_type = resultCart.dataValues.type;
    // Prepare cart items

    const cartItems = items.map((item) => ({
      ...item,
      is_serial_num_product_item:
        Array.isArray(item.serial_numbers) &&
          item.serial_numbers.length > 0
          ? 1
          : 0,
      cart_id: cartId,
      a_application_login_id: a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      created_date_time: formattedDateTime,
      cart_date: cart.cart_date,
      cart_number: is_approve === 1 ? financialYearDetail?.order_no || "" : "",
      cart_type: Number(cart.type),
      approve_a_application_login_id:
        is_approve === 1 ? a_application_login_id : null,
      update_Date_time: formattedDateTime,
      contact_master_id: cart.to_customer_id || null,
      stock_type: getStockType,
    }));

    // Bulk create cart items
    const resultCartItem = await CATItemModel.bulkCreate(cartItems);
    if (!resultCartItem) {
      return resError({
        ack_msg: "Failed to create Order",
        developer_msg: "Failed to create cart items",
      });
    }



    // ==========================================
    // SERIAL NUMBER STORE LOGIC
    // ==========================================

    const serialNumberPayload = [];

    // resultCartItem is an array, so we need to map it with original items
    resultCartItem.forEach((createdItem, index) => {
      const originalItem = items[index];   // ← Important: Match with original data

      if (originalItem &&
        Array.isArray(originalItem.serial_numbers) &&
        originalItem.serial_numbers.length > 0) {

        originalItem.serial_numbers.forEach((serial_no) => {
          serialNumberPayload.push({
            serial_numbers: serial_no,
            cart_type: Number(cart.type),
            cart_id: cartId,
            cart_item_id: createdItem.id,           // ← Correct way
            product_id: originalItem.item_product_id,
            a_application_login_id: a_application_login_id,
            company_masters_id: findCompanyId.company_masters_id,
            created_date_time: formattedDateTime,
          });
        });
      }
    });
    // ==========================================
    // BULK INSERT SERIAL NUMBERS
    // ==========================================

    if (serialNumberPayload.length > 0) {

      await CATSerialNumberModal.bulkCreate(serialNumberPayload);

    }

    await updateCartStatus(req, { type: cart_type, target_id: cartId, a_application_login_id });
    if (is_approve === 1 && [3, 4, 6, 7].includes(Number(cart.type)) && cart.grand_total != 0 && cart.grand_total != null && cart.grand_total != undefined) {

      const invoiceNum = resultCart.dataValues.cart_number;
      const invoiceDate = resultCart.dataValues.cart_date;
      const customerName = resultCart.dataValues.to_customer_name;
      const createDateTime =
        resultCart.dataValues.created_date_time.toISOString();

      await createAccountTransaction({
        mode: cart.payment_type ? cart.payment_type : -1,
        type: Number(cart.type) == 3 || Number(cart.type) == 7 ? 2 : 1,
        amount: cart.grand_total,
        referenceId: cartId,
        referenceTable: cart.account_transactions_ref_table,
        remarkDetails: { invoiceNum, invoiceDate, customerName },
        paymentDateTime: createDateTime,
        approvedBy: a_application_login_id,
        contactMasterId: resultCart.dataValues.to_customer_id,
        applicationLoginId: a_application_login_id,
        companyMasterId: findCompanyId.company_masters_id,
        miracle_account_legder: cart.miracle_account_legder ? cart.miracle_account_legder : "",
        req,
      });
    }
    if (
      is_approve === 1 &&
      [2, 3, 4, 5, 6, 7].includes(Number(cart.type)) &&
      cart.advance_payment != "" && cart.advance_payment != 0 && cart.advance_payment >= 0 && cart.advance_payment != null && cart.advance_payment != undefined
    ) {
      const invoiceNum = resultCart.dataValues.cart_number;
      const invoiceDate = resultCart.dataValues.cart_date;
      const customerName = resultCart.dataValues.to_customer_name;
      const createDateTime =
        resultCart.dataValues.created_date_time.toISOString();

      await createAccountTransaction({
        mode: cart.payment_type ? cart.payment_type : -1,
        type: Number(cart.type) == 2 || Number(cart.type) == 3 || Number(cart.type) == 7 ? 1 : 2,
        amount: cart.advance_payment,
        referenceId: cartId,
        referenceTable: cart.account_transactions_ref_table,
        remarkDetails: {
          type_name: "Advance Payment",
          invoiceNum: invoiceNum,
          invoiceDate: invoiceDate,
          customerName: customerName,
        },
        paymentDateTime: createDateTime,
        approvedBy: 0,
        contactMasterId: resultCart.dataValues.to_customer_id,
        applicationLoginId: a_application_login_id,
        companyMasterId: findCompanyId.company_masters_id,
        miracle_account_legder: cart.miracle_account_ledger_adv ? cart.miracle_account_ledger_adv : "",
        amount_type: 1,
        req,
      });
    }

    if (is_approve === 1 && [2, 3, 4, 5, 6, 7].includes(Number(cart.type))) {
      const contactMasterModel = contactModel(req.tenantDB);

      const contact = await contactMasterModel.findOne({
        where: {
          id: resultCart.dataValues.to_customer_id,
        },
      });

      let existingLabel = contact?.dataValues?.lable || "";
      let updatedLabel = "";
      let lableId;

      if ([2, 3, 7].includes(Number(cart.type))) {
        lableId = -2;
      } else {
        lableId = -1;
      }

      if (existingLabel.trim()) {
        const labelArray = existingLabel.split(',').map(Number);
        if (!labelArray.includes(lableId)) {
          updatedLabel = `${existingLabel},${lableId}`;
        } else {
          updatedLabel = existingLabel;
        }
      } else {
        updatedLabel = `${lableId}`;
      }

      await contactMasterModel.update(
        { lable: updatedLabel },
        {
          where: {
            id: resultCart.dataValues.to_customer_id,
          },
        }
      );
    }

    const companyDetail = await companyModel.findAll({
      where: {
        isDelete: 0,
        id: findCompanyId.company_masters_id,
      },
      attributes: [
        "quotation_view_formate",
        "order_view_formate",
        "invoice_view_formate",
        "purchase_view_formate",
        "purchase_order_view_formate",
        "return_sales_invoice_view_formate",
        "return_purchase_invoice_view_formate",
        "quotation_title",
        "order_title",
        "invoice_title",
        "purchase_title",
        "return_sales_invoice_title",
        "return_purchase_invoice_title",
        "inward_title",
        "inward_view_formate",
        "dispatch_title",
        "dispatch_view_formate",
        "proforma_invoice_title",
        "proforma_invoice_view_formate"
      ],
    });

    let dynamicPrintView = 1;
    let dynamicTitleForMessage;
    if (cart.type == 1) {
      dynamicPrintView = companyDetail[0].quotation_view_formate;
      dynamicTitleForMessage = companyDetail[0].quotation_title || "Quotation";
    } else if (cart.type == 2) {
      dynamicPrintView = companyDetail[0].order_view_formate;
      dynamicTitleForMessage = companyDetail[0].order_title || "Sales Order";
    } else if (cart.type == 3) {
      dynamicPrintView = companyDetail[0].invoice_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].invoice_title || "Sales Invoice";
    } else if (cart.type == 4) {
      dynamicPrintView = companyDetail[0].purchase_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].purchase_title || "Purchase Invoice";
    } else if (cart.type == 5) {
      dynamicPrintView = companyDetail[0].purchase_order_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].purchase_order_title || "Purchase Order";
    } else if (cart.type == 6) {
      dynamicPrintView = companyDetail[0].return_sales_invoice_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].return_sales_invoice_title || "Return Sales Invoice";
    } else if (cart.type == 7) {
      dynamicPrintView = companyDetail[0].return_purchase_invoice_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].return_purchase_invoice_title || "Return Purchase Invoice";
    } else if (cart.type == 8) {
      dynamicPrintView = companyDetail[0].inward_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].inward_title || "Goods Received Note";
    }
    else if (cart.type == 9) {
      dynamicPrintView = companyDetail[0].dispatch_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].dispatch_title || "Dispatch";
    }
    else if (cart.type == 12) {
      dynamicPrintView = companyDetail[0].proforma_invoice_view_formate;
      dynamicTitleForMessage =
        companyDetail[0].proforma_invoice_title || "Proforma Invoice";
    }

    const currencyDetails = await currencyModel.findAll({
      where: {
        isDelete: 0,
        id: resultCart.dataValues.currency_id,
      },
    });

    const selectedCurrency = currencyDetails[0]?.short_name || "INR";
    const finalCurrency = selectedCurrency === "INR" ? "INR" : "USD";


    // Handle notifications and messages for approved orders
    if (is_approve === 1) {


      const usernameLiteral = async (login_id) => {
        const user = await loginModel.findOne({
          where: { id: login_id, isDelete: 0 },
          attributes: ["username"],
        });
        return user?.username || "Unknown";
      };

      const username = await usernameLiteral(a_application_login_id);
      const approveBy = await usernameLiteral(a_application_login_id);

      const cartToMsgBody = {
        contact_masters_id: resultCart.dataValues.to_customer_id,
        a_application_login_id: a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        msg_cart_id: cartId,
        description: `
  <b>${dynamicTitleForMessage}</b><br>
  ${resultCart.dataValues.cart_number
            ? `#${resultCart.dataValues.cart_number}`
            : "#XXXXXXXX"
          }<br>
  <b>${resultCart.dataValues.grand_total && resultCart.dataValues.type != 9 && resultCart.dataValues.type != 8
            ? `${resultCart.dataValues.grand_total}${finalCurrency}`
            : ""
          }</b><br>
  <a href="${APP_URL_SMALL_OFFICE_CRM}/OrderPrintViewV${dynamicPrintView}/${cartId}" target="_blank">View ${dynamicTitleForMessage}</a><br>
  <p><b>Created By:</b>${username} (${formatDateAndTimeCreateDateTime(
            formattedDateTime
          )})</p>
  <p><b>Approve By:</b>${approveBy} (${formatDateAndTimeCreateDateTime(
            formattedDateTime
          )})</p>
  `,
        created_date_time: formattedDateTime,
        message_side: 1,
        message_type_id: 2,
        application_login_name: username,
      };


      const getTypeName = (TypeId) => {
        const found = paymentModeList.find(
          (item) => item.id === String(TypeId)
        );
        return found ? found.type : "Unknown";
      };


      if ([3, 4, 6, 7].includes(Number(resultCart.dataValues.type)) && resultCart.dataValues.grand_total > 0) {

        const AccountMsg = {
          contact_masters_id: resultCart.dataValues.to_customer_id,
          a_application_login_id: req.body.a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          msg_cart_id: resultCart.dataValues.id,
          description:
            `<b>Account History</b>` +
            "<br>" +
            (resultCart.dataValues.cart_number
              ? `#${resultCart.dataValues.cart_number}`
              : "#XXXXXXXX") +
            "<br>" +
            `Payment Type : ${getTypeName(resultCart.dataValues.type)}` +
            "</br>" +
            `<b>${resultCart.dataValues.grand_total
              ? `${resultCart.dataValues.grand_total}  ${finalCurrency} By Other`
              : ""
            } </b>` +
            "<br>" +
            `${formatDateCustom(resultCart.dataValues.cart_date) || ""}`,
          created_date_time: formattedDateTime,
          message_side: 1,
          message_type_id: 2,
          application_login_name: username,
        };


        const ATModel = contactMessageHistory(req.tenantDB);
        const contactMessage = await ATModel.create(AccountMsg);
      }

      if (
        [2, 3, 4, 5, 6, 7].includes(Number(resultCart.dataValues.type)) &&
        resultCart.dataValues.advance_payment !== "" && resultCart.dataValues.advance_payment >= 0 &&
        resultCart.dataValues.advance_payment != 0 && resultCart.dataValues.advance_payment != undefined && resultCart.dataValues.advance_payment != null
      ) {
        const AccountMsg = {
          contact_masters_id: resultCart.dataValues.to_customer_id,
          a_application_login_id: req.body.a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          msg_cart_id: resultCart.dataValues.id,
          description:
            `<b>Account History</b>` +
            "<br>" +
            "(Advance Payment)" +
            "<br>" +
            (resultCart.dataValues.cart_number
              ? `#${resultCart.dataValues.cart_number}`
              : "#XXXXXXXX") +
            "<br>" +
            `Payment Type : ${[2, 3, 7].includes(resultCart.dataValues.type) ? "Credit" : "Debit"
            }` +
            "</br>" +
            `<b>${resultCart.dataValues.advance_payment
              ? `${resultCart.dataValues.advance_payment}  ${symbolCurrency} By Other`
              : ""
            } </b>` +
            "<br>" +
            `${formatDateCustom(resultCart.dataValues.cart_date) || ""}`,
          created_date_time: formattedDateTime,
          message_side: 1,
          message_type_id: 2,
          application_login_name: username,
          amount_type: 1
        };


        const ATModel = contactMessageHistory(req.tenantDB);
        const contactMessage = await ATModel.create(AccountMsg);
      }
      const ContactMSG = contactMessageHistory(req.tenantDB);
      await ContactMSG.create(cartToMsgBody);
    }


    const ContactMaster = contactModel(req.tenantDB);

    if (is_approve === 1) {
      const updateUnread = await ContactMaster.update({
        is_read_by_a_application_login_id: a_application_login_id
      }, {
        where: {
          id: cart.to_customer_id
        }
      })
    }


    const username = await loginModel
      .findOne({
        where: { id: a_application_login_id, isDelete: 0 },
        attributes: ["username"],
      })
      .then((user) => user?.username || "Unknown");

    const assigned_team_member = await contactModel(req.tenantDB).findOne({
      where: {
        id: cart.to_customer_id,
        isDelete: 0,
      },
      attributes: ["assinged_to_work_a_application_id", "person_name"],
    });

    const allTokens = [];

    // Step 1: Collect tokens for assigned team members
    if (assigned_team_member?.assinged_to_work_a_application_id) {
      const assignedIds = assigned_team_member.assinged_to_work_a_application_id
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id !== String(a_application_login_id)); // Exclude creator's ID

      if (assignedIds.length > 0) {
        const assignedContacts = await loginModel.findAll({
          where: { id: assignedIds, isDelete: 0 },
          attributes: [
            "web_refresh_token",
            "android_refresh_token",
            "ios_refresh_token",
          ],
        });
        allTokens.push(
          ...assignedContacts.flatMap((contact) => [
            contact.web_refresh_token,
            contact.android_refresh_token,
            contact.ios_refresh_token,
          ])
        );
      }
    }

    // Step 2: Collect tokens for owners, but only if the creator is not the owner
    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        company_flag: 1,
      },
      attributes: ["a_application_login_id"],
    });

    const allLoginIds = ownerTokenData
      .map((item) => item.a_application_login_id)
      .filter((id) => id !== a_application_login_id); // Exclude creator's ID if they are the owner

    if (allLoginIds.length > 0) {
      const ownerTokens = await loginModel.findAll({
        where: { id: allLoginIds, isDelete: 0 },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
        ],
      });
      allTokens.push(
        ...ownerTokens.flatMap((token) => [
          token.web_refresh_token,
          token.android_refresh_token,
          token.ios_refresh_token,
        ])
      );
    }

    // Step 3: Remove duplicates and empty tokens
    const uniqueTokens = [
      ...new Set(allTokens.filter((token) => token && token.trim() !== "")),
    ];

    // Step 4: Send notifications if there are valid tokens
    if (uniqueTokens.length > 0) {
      const orderType = dynamicTitleForMessage;
      const notificationBody = `${username} has ${is_approve === 1 ? "approved" : "drafted"
        } a ${orderType} for ${assigned_team_member?.person_name || "customer"}`;

      await sendMultipleNotification({
        deviceTokens: uniqueTokens,
        title: `New ${orderType}`,
        body: notificationBody,
      });
    } else {
      console.log("No device tokens found for assigned members or owners.");
    }
    return resSuccess({
      data: { item: resultCartItem, companyDetail: companyDetail },
      ack_msg: "Added successfully",
    });
  } catch (error) {
    console.error("Error creating order:", error);
    return resBadRequest({ developer_msg: error.message });
  }
};

export const orderList = async (req) => {
  try {
    let {
      ul,
      ll,
      a_application_login_id,
      contact_master_id,
      searchTerm,
      order_type,
      request_to
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const CATModel = cartModel(req.tenantDB);
    const companyModels = companyModel;

    const ORDER_TYPE_PAGE_MAP = {
      [1]: PAGE_ID.QUOTATION,
      [2]: PAGE_ID.ORDER,
      [3]: PAGE_ID.INVOICE,
      [4]: PAGE_ID.PURCHASE,
      [5]: PAGE_ID.PURCHASE_ORDER,
      [6]: PAGE_ID.RETURN_SALES_INVOICE,
      [7]: PAGE_ID.RETURN_PURCHASE_INVOICE,
      [8]: PAGE_ID.INWARD,
      [9]: PAGE_ID.DISPATCH,
      [12]: PAGE_ID.PROFOMA_INVOICE,
    };

    let page_id = null;

    if (order_type && Number(order_type) !== 0) {
      page_id = ORDER_TYPE_PAGE_MAP[order_type];

      if (!page_id) {
        return resBadRequest({
          developer_msg: "Invalid order_type",
          ack_msg: "Order type not recognized",
        });
      }
    }
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      page_id: page_id,
      tenentId: req.tenantDB
    });

    let whereClause = {
      company_masters_id: findCompanyId.company_masters_id,
      isDelete: "0",
      type: order_type,
    };

    if (request_to == 'jbcrd') {
      whereClause = {
        ...whereClause,
        sr_by_number: { [Op.ne]: 0 },
        cart_status: { [Op.in]: [-9, -8] }
      }
    }

    if (showPersonalData && !showAllData) {
      whereClause.a_application_login_id = a_application_login_id;
    }

    if (searchTerm && searchTerm !== "undefined") {
      whereClause = {
        ...whereClause,
        [Op.or]: [{ cart_number: { [Op.like]: `%${searchTerm}%` } }],
      };
    }

    if (contact_master_id) {
      whereClause = {
        ...whereClause,
        to_customer_id: contact_master_id,
      };
    }


    const usernameLiteral = async (a_application_login_id) => {
      const user = await loginModel.findOne({
        where: {
          id: a_application_login_id,
          isDelete: 0,
        },
        attributes: ["username"],
      });
      return user?.username || null;
    };

    const resultAllCart = await CATModel.findAll({
      where: whereClause,
      limit: Number(ll) || 100000,
      offset: Number(ul) || 0,
      order: [["id", "DESC"]],
      attributes: {
        include: [
          [
            Sequelize.literal(
              `(SELECT reminder_messages.remark FROM reminder_messages WHERE reminder_messages.reference_id = carts.id AND reminder_messages.reference_table="cart_${orderTypesList?.find(
                (option) => Number(option.id) === Number(order_type)
              )?.type || ""
              }" AND reminder_messages.isDelete=0 AND reminder_messages.status=0)`
            ),
            "reminder_remark",
          ],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.reminder_data_time FROM reminder_messages WHERE reminder_messages.reference_id = carts.id AND reminder_messages.reference_table="cart_${orderTypesList?.find(
                (option) => Number(option.id) === Number(order_type)
              )?.type || ""
              }" AND reminder_messages.isDelete=0 AND reminder_messages.status=0)`
            ),
            "reminder_data_time",
          ],
          [
            Sequelize.literal(
              "(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = carts.cart_status AND stage_status_masters.isDelete = 0)"
            ),
            "stage_status_name",
          ],
          [
            Sequelize.literal(
              "(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = carts.cart_status AND stage_status_masters.isDelete = 0)"
            ),
            "stage_status_color",
          ],
        ],
      },
    });

    let activeTeamList;
    let activeTeamMap;
    if (resultAllCart) {
      activeTeamList = await loginModel.findAll(
        {
          where: {
            id: {
              [Op.in]: Sequelize.literal(`(
                    SELECT a_application_login_id
                    FROM company_vs_application_logins
                    WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
                  )`)
            },
            isDelete: 0
          },
          attributes: ["username", "id"],
          raw: true
        }
      );
      activeTeamMap = new Map(
        activeTeamList.map(user => [user.id, user.username])
      );
    }
    const PrintVersion = await companyModels.findOne({
      where: {
        // a_application_login_id: sanitized.a_application_login_id,
        id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: [
        "id",
        "invoice_view_formate",
        "quotation_view_formate",
        "order_view_formate",
        "purchase_view_formate",
        "purchase_order_view_formate",
        "workorder_view_formate",
        "return_sales_invoice_view_formate",
        "return_purchase_invoice_view_formate",
        "proforma_invoice_view_formate",
        "quotation_title",
        "proforma_invoice_title",
        "order_title",
        "invoice_title",
        "purchase_title",
        "purchase_order_title",
        "return_sales_invoice_title",
        "return_purchase_invoice_title",
        "inward_title",
        "inward_view_formate",
        "dispatch_title",
        "dispatch_view_formate",
      ],
    });

    const sanitizedOrder = resultAllCart
      ? await Promise.all(
        resultAllCart.map(async (orderItem) => {
          const sanitized = sanitizeObjectOfNull(orderItem.toJSON());

          const createdBy = activeTeamMap.get(Number(sanitized.a_application_login_id)) || null;

          const approvedBy = activeTeamMap.get(Number(sanitized.approve_a_application_login_id)) || null;


          return {
            ...sanitized,
            created_date_time: sanitized.created_date_time
              ? formatDateAndTimeCreateDateTime(sanitized.created_date_time)
              : "",
            reminder_data_time: sanitized.reminder_data_time
              ? formatDateAndTimeCreateDateTime(sanitized.reminder_data_time)
              : "",
            update_Date_time: sanitized.update_Date_time
              ? formatDateAndTimeCreateDateTime(sanitized.update_Date_time)
              : "",
            created_by: createdBy,
            approved_by: approvedBy,
            invoice_view_formate: PrintVersion?.invoice_view_formate || 1,
            quotation_view_formate: PrintVersion?.quotation_view_formate || 1,
            order_view_formate: PrintVersion?.order_view_formate || 1,
            purchase_view_formate: PrintVersion?.purchase_view_formate || 1,
            purchase_order_view_formate: PrintVersion?.purchase_order_view_formate || 1,
            workorder_view_formate: PrintVersion?.workorder_view_formate || 1,
            return_sales_invoice_view_formate: PrintVersion?.return_sales_invoice_view_formate || 1,
            return_purchase_invoice_view_formate: PrintVersion?.return_purchase_invoice_view_formate || 1,
            quotation_title: PrintVersion?.quotation_title || "Quotation",
            order_title: PrintVersion?.order_title || "Sales Order",
            invoice_title: PrintVersion?.invoice_title || "Sales Invoice",
            purchase_title: PrintVersion?.purchase_title || "Purchase Invoice",
            purchase_order_title: PrintVersion?.purchase_order_title || "Purchase Order",
            return_sales_invoice_title: PrintVersion?.return_sales_invoice_title || "Return Sales Invoice",
            return_purchase_invoice_title: PrintVersion?.return_purchase_invoice_title || "Return Purchase Invoice",
            inward_view_formate: PrintVersion?.inward_view_formate || 1,
            inward_title: PrintVersion?.inward_title || "Inward",
            dispatch_view_formate: PrintVersion?.dispatch_view_formate || 1,
            dispatch_title: PrintVersion?.dispatch_title || "Dispatch",
            proforma_invoice_view_formate: PrintVersion?.proforma_invoice_view_formate || 1,
            proforma_invoice_title: PrintVersion?.proforma_invoice_title || "Proforma Invoice",
            // invoice_view_formate: PrintVersion.dataValues.invoice_view_formate,
            // quotation_view_formate: PrintVersion.dataValues.quotation_view_formate,s
            // order_view_formate: PrintVersion.dataValues.order_view_formate,
            // purchase_view_formate: PrintVersion.dataValues.purchase_view_formate,
            // workorder_view_formate: PrintVersion.dataValues.workorder_view_formate,
          };
        })
      )
      : [];

    if (resultAllCart) {
      return resSuccess({
        data: {
          item: sanitizedOrder,
        },
      });
    } else {
      return resError({
        ack_msg: "No cart",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    console.log("eeeeeee", e);
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};

export const orderById = async (req, res) => {
  try {
    const { cart_id, request_flag, print_flag, a_application_login_id, cart_number, or_cart_type } = req.body;
    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const CATSerialNumberModal = cartSerialNumberModel(req.tenantDB);
    const companyMaster = companyModel;

    let whereClause = {
      isDelete: "0",
    };

    // OLD FLOW
    if (cart_id) {
      whereClause.id = cart_id;
    }

    // NEW FLOW
    if (cart_number && or_cart_type) {
      whereClause.cart_number = cart_number;
      whereClause.type = or_cart_type;
    }
    let whereClauseCartItem = {
      cart_id: cart_id,
      isDelete: "0",
    };
    const resultCartById = await CATModel.findOne({
      where: whereClause,
    });
    if (!resultCartById) {
      return resError({
        ack_msg: "Invalid cart number or cart type",
        developer_msg: "No matching cart found",
      });
    }
    const currentCartId = resultCartById?.dataValues?.id;
    if (resultCartById) {
      const resultAllCartItems = await CATItemModel.findAll({
        where: { cart_id: currentCartId, isDelete: "0" },
      });

      let itemsWithPendingQty = resultAllCartItems;
      if (print_flag == 1) {
        const cartItems = await CATItemModel.findAll({
          where: {
            isDelete: 0,
            referance_cart_id: currentCartId,
            stock_type: { [Op.ne]: 0 },
          },
          attributes: ["id", "item_qty", "item_product_id"],
        });

        // Calculate total item_qty per item_product_id
        const pendingQtyByProduct = cartItems.reduce((acc, item) => {
          const productId = item.item_product_id;
          acc[productId] = (acc[productId] || 0) + (item.item_qty || 0);
          return acc;
        }, {});
        // Map total pending_qty to each item based on item_product_id
        itemsWithPendingQty = resultAllCartItems.map((item) => ({
          ...item.dataValues,
          sales_qty: pendingQtyByProduct[item.item_product_id] || 0,
        }));
      }

      if (print_flag == 2) {
        const cartItems = await CATItemModel.findAll({
          where: {
            isDelete: 0,
            referance_cart_id: currentCartId,
            stock_type: { [Op.ne]: 0 },
          },
          attributes: ["id", "item_qty", "item_product_id"],
        });
        // Calculate total item_qty per item_product_id
        const pendingQtyByProduct = cartItems.reduce((acc, item) => {
          const productId = item.item_product_id;
          acc[productId] = (acc[productId] || 0) + (item.item_qty || 0);
          return acc;
        }, {});


        // Map total pending_qty to each item based on item_product_id
        itemsWithPendingQty = resultAllCartItems.map((item) => ({
          ...item.dataValues,
          sales_qty: pendingQtyByProduct[item.item_product_id] || 0,
        }));
      }

      itemsWithPendingQty = await Promise.all(
        itemsWithPendingQty.map(async (item) => {
          const productModels = productModel(req.tenantDB)
          const productImage = await productModels.findAll({
            where: {
              id: item.item_product_id
            },
            attributes: ["product_img", "is_serial_number"]
          });

          let imageUrl = "";
          if (productImage.length > 0 && productImage[0].product_img) {
            imageUrl = PRODUCT_IMG_LINK_EXTENDED + productImage[0].product_img;
          }

          const serialNumberData = await CATSerialNumberModal.findAll({
            where: {
              cart_id: currentCartId,
              cart_item_id: item.id,
              cart_type: resultCartById.dataValues.type,
              isDelete: 0,
            },
            attributes: ["serial_numbers"],
            raw: true,
          });

          const serial_numbers = serialNumberData.map(
            (sn) => sn.serial_numbers
          );
          return {
            ...(item.dataValues || item),
            product_img: imageUrl,
            is_serial_number:
              productImage.length > 0
                ? productImage[0].is_serial_number
                : 1,
            serial_numbers,
          };
        })
      );

      const company_id = await getCompanyByLoginId(
        resultCartById.dataValues.a_application_login_id
      );

      const PrintVersion = await companyMaster.findAll({
        where: {
          id: company_id.company_masters_id,
          isDelete: 0,
        },
        attributes: [
          "id",
          "invoice_view_formate",
          "quotation_view_formate",
          "order_view_formate",
          "purchase_view_formate",
          "purchase_order_view_formate",
          "workorder_view_formate",
          "return_sales_invoice_view_formate",
          "return_purchase_invoice_view_formate",
        ],
      });

      let state_name = null;
      let cart_state_id = resultCartById.dataValues.state_id;
      if (cart_state_id > 0) {
        const state = await stateModel(req.tenantDB).findOne({
          where: {
            id: cart_state_id,
            isDelete: 0,
          },
          attributes: ["state_name"],
        });
        state_name = state ? state.dataValues.state_name : null;
      }
      // else {
      //   const companyDetail = await getCompanyDetailByLoginId(
      //     resultCartById.dataValues.a_application_login_id
      //   );
      //   if (companyDetail && companyDetail.state_id > 0) {
      //     const state = await stateModel(req.tenantDB).findOne({
      //       where: {
      //         id: companyDetail.state_id,
      //         isDelete: 0,
      //       },
      //       attributes: ["state_name"],
      //     });
      //     state_name = state ? state.dataValues.state_name : null;
      //     // Assign company's state_id to cart's state_id
      //     cart_state_id = companyDetail.state_id;
      //     resultCartById.dataValues.state_id = companyDetail.state_id;
      //   }
      //   if (!state_name) {
      //     console.warn(
      //       `Invalid state_id: ${resultCartById.dataValues.state_id} for cart_id: ${cart_id} and no valid company state_id`
      //     );
      //     return resError({
      //       ack_msg: "please Select Company State"
      //     })
      //   }
      // }

      resultCartById.dataValues.state_name = state_name;

      let city_name = null;
      let cart_city_id = resultCartById.dataValues.city_id;

      if (cart_city_id > 0) {
        const city = await cityModel(req.tenantDB).findOne({
          where: {
            id: cart_city_id,
            isDelete: 0,
          },
          attributes: ["city_name"],
        });

        city_name = city ? city.dataValues.city_name : null;
      }

      resultCartById.dataValues.city_name = city_name;

      const cartData = {
        ...resultCartById.dataValues,
        packing_forwarding_charge_title: resultCartById.dataValues.packing_forwarding_charge_title || "Packing Forwarding charge",
        transport_charge_title: resultCartById.dataValues.transport_charge_title || "Transport charge",
        tcs_title: resultCartById.dataValues.tcs_title || "TCS",
        tcs_percentage: resultCartById.dataValues.tcs_percentage || 0.0001,
        update_Date_time: (resultCartById.dataValues.update_Date_time && resultCartById.dataValues.update_Date_time != null && resultCartById.dataValues.update_Date_time != 'Invalid Date') ? resultCartById.dataValues.update_Date_time : '',
        ...(PrintVersion.length > 0
          ? {
            invoice_view_formate: PrintVersion[0].invoice_view_formate || 1,
            quotation_view_formate:
              PrintVersion[0].quotation_view_formate || 1,
            order_view_formate: PrintVersion[0].order_view_formate || 1,
            purchase_view_formate: PrintVersion[0].purchase_view_formate || 1,
            purchase_order_view_formate:
              PrintVersion[0].purchase_order_view_formate || 1,
            workorder_view_formate:
              PrintVersion[0].workorder_view_formate || 1,
            return_sales_invoice_view_formate:
              PrintVersion[0].return_sales_invoice_view_formate || 1,
            return_purchase_invoice_view_formate:
              PrintVersion[0].return_purchase_invoice_view_formate || 1,
          }
          : {}),
      };

      let finalResult = {};
      if (request_flag === 2) {
        const productModels = productModel(req.tenantDB)




        const companyDetail = await getCompanyDetailByLoginId(
          resultCartById.dataValues.a_application_login_id
        );

        if (companyDetail) {
          companyDetail.header_img = companyDetail.header_img
            ? COMPANY_IMG_LINK_EXTENDED + companyDetail.header_img
            : "";
          companyDetail.footer_img = companyDetail.footer_img
            ? COMPANY_IMG_LINK_EXTENDED + companyDetail.footer_img
            : "";
          companyDetail.company_sign = companyDetail.company_sign
            ? COMPANY_IMG_LINK_EXTENDED + companyDetail.company_sign
            : "";
          companyDetail.company_logo = companyDetail.company_logo
            ? COMPANY_IMG_LINK_EXTENDED + companyDetail.company_logo
            : "";
        }

        let state_name = null;
        if (companyDetail.state_id > 0) {
          const state = await stateModel(req.tenantDB).findOne({
            where: {
              id: companyDetail.state_id,
              isDelete: 0,
            },
            attributes: ["state_name"],
          });
          state_name = state ? state.dataValues.state_name : null;
        }

        companyDetail.state_name = state_name;
        const loginDetail = await getLoginDetailById(
          resultCartById.dataValues.a_application_login_id
        );

        let shareRights = false;
        let showPersonalData = false;

        if (req.body.a_application_login_id) {

          const pageIdMap = {
            1: PAGE_ID.QUOTATION_REPORT,
            2: PAGE_ID.SALESORDER_REPORT,
            3: PAGE_ID.SALESINVOICE_REPORT,
            4: PAGE_ID.PURCHASEORDER_REPORT,
            5: PAGE_ID.PURCHASEINVOICE_REPORT,
            6: PAGE_ID.RETURN_SALES_INVOICE_REPORT,
            7: PAGE_ID.RETURN_PURCHASE_INVOICE_REPORT,
            8: PAGE_ID.INWARD_REPORT,
            9: PAGE_ID.DISPATCH_REPORT,
          };
          const pageID = pageIdMap[resultCartById.dataValues.type] || PAGE_ID.QUOTATION_REPORT;

          const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
          const checkRights = await applicationLoginTypeRightModelIntance.findAll({
            where: {
              a_application_login_id: a_application_login_id,
              isDelete: 0,
              page_id: pageID,
            },
            attributes: ["a_application_login_id", "a_page_id_rights_jason"],

          })


          if (checkRights && checkRights.length > 0) {
            const rightsStr =
              checkRights[0].dataValues?.a_page_id_rights_jason ??
              checkRights[0].a_page_id_rights_jason;

            if (rightsStr) {
              try {
                const rightsJson = JSON.parse(rightsStr);

                shareRights = rightsJson.share === 1;
                showPersonalData = rightsJson.personal === 1;
              } catch (err) {
                console.error("Invalid rights JSON:", err);
              }
            } else {
              console.warn("a_page_id_rights_jason is missing in DB row");
            }
          }
        }


        finalResult = {
          cart: cartData,
          items: itemsWithPendingQty,
          companyDetail: companyDetail,
          loginDetail: loginDetail,
          shareRights: shareRights
        };
      } else {
        finalResult = {
          cart: cartData,
          items: itemsWithPendingQty,
        };
      }

      return resSuccess({
        data: {
          item: finalResult,
        },
      });
    } else {
      return resError({
        ack_msg: "No cart Data found",
        developer_msg: "Data not found",
      });
    }
  } catch (error) {
    console.error("Error creating order in OrderByID: ", error);

    return resBadRequest({ developer_msg: error });
  }
};
export const orderByMultipleId = async (req, res) => {
  try {
    const { cart_id, request_flag, print_flag, a_application_login_id } = req.body;

    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const companyMaster = companyModel;

    const cartIds = Array.isArray(cart_id) ? cart_id : [cart_id];

    const resultCarts = await CATModel.findAll({
      where: {
        id: { [Op.in]: cartIds },
        isDelete: "0",
      },
    });

    if (!resultCarts || resultCarts.length === 0) {
      return resError({
        ack_msg: "No cart Data found",
      });
    }

    const finalData = await Promise.all(
      resultCarts.map(async (cart) => {
        const cartId = cart.id;

        // ✅ Fetch items per cart
        let resultAllCartItems = await CATItemModel.findAll({
          where: { cart_id: cartId, isDelete: "0" },
        });

        let itemsWithPendingQty = resultAllCartItems;

        // ✅ print_flag logic
        if (print_flag == 1 || print_flag == 2) {
          const cartItems = await CATItemModel.findAll({
            where: {
              isDelete: 0,
              referance_cart_id: cartId,
              stock_type: { [Op.ne]: 0 },
            },
            attributes: ["item_qty", "item_product_id"],
          });

          const pendingQtyByProduct = cartItems.reduce((acc, item) => {
            const productId = item.item_product_id;
            acc[productId] = (acc[productId] || 0) + (item.item_qty || 0);
            return acc;
          }, {});

          itemsWithPendingQty = resultAllCartItems.map((item) => ({
            ...item.dataValues,
            sales_qty: pendingQtyByProduct[item.item_product_id] || 0,
          }));
        }
        const CATSerialNumberModal = cartSerialNumberModel(req.tenantDB);

        // ✅ Add product image
        itemsWithPendingQty = await Promise.all(
          itemsWithPendingQty.map(async (item) => {
            const productModels = productModel(req.tenantDB);

            const productImage = await productModels.findOne({
              where: { id: item.item_product_id },
              attributes: ["product_img", "is_serial_number"],
            });

            const serialNumberData = await CATSerialNumberModal.findAll({
              where: {
                cart_id: currentCartId,
                cart_type: resultCartById.dataValues.type,
                product_id: item.item_product_id,
                isDelete: 0,
              },
              attributes: ["serial_numbers"],
            });

            const serial_numbers = serialNumberData.map(
              (sn) => sn.serial_numbers
            );

            let imageUrl = "";
            if (productImage?.product_img) {
              imageUrl = PRODUCT_IMG_LINK_EXTENDED + productImage.product_img;
            }

            return {
              ...(item.dataValues || item),
              product_img: imageUrl,
              is_serial_number:
                productImage.length > 0
                  ? productImage[0].is_serial_number
                  : 1,
              serial_numbers,
            };
          })
        );

        // ✅ Company + state logic
        const company_id = await getCompanyByLoginId(cart.a_application_login_id);

        const PrintVersion = await companyMaster.findAll({
          where: {
            id: company_id.company_masters_id,
            isDelete: 0,
          },
        });

        let state_name = null;
        let cart_state_id = cart.state_id;

        if (cart_state_id > 0) {
          const state = await stateModel(req.tenantDB).findOne({
            where: { id: cart_state_id, isDelete: 0 },
            attributes: ["state_name"],
          });
          state_name = state?.state_name || null;
        } else {
          const companyDetail = await getCompanyDetailByLoginId(cart.a_application_login_id);

          if (companyDetail?.state_id > 0) {
            const state = await stateModel(req.tenantDB).findOne({
              where: { id: companyDetail.state_id, isDelete: 0 },
              attributes: ["state_name"],
            });

            state_name = state?.state_name || null;
            cart_state_id = companyDetail.state_id;
            cart.state_id = companyDetail.state_id;
          }

          if (!state_name) {
            return null;
          }
        }

        cart.dataValues.state_name = state_name;

        const cartData = {
          ...cart.dataValues,
          ...(PrintVersion.length > 0
            ? {
              invoice_view_formate: PrintVersion[0].invoice_view_formate || 1,
              quotation_view_formate: PrintVersion[0].quotation_view_formate || 1,
              order_view_formate: PrintVersion[0].order_view_formate || 1,
            }
            : {}),
        };

        let finalResult = {};

        if (request_flag === 2) {
          const companyDetail = await getCompanyDetailByLoginId(cart.a_application_login_id);

          if (companyDetail) {
            companyDetail.header_img = companyDetail.header_img
              ? COMPANY_IMG_LINK_EXTENDED + companyDetail.header_img
              : "";
            companyDetail.footer_img = companyDetail.footer_img
              ? COMPANY_IMG_LINK_EXTENDED + companyDetail.footer_img
              : "";
            companyDetail.company_logo = companyDetail.company_logo
              ? COMPANY_IMG_LINK_EXTENDED + companyDetail.company_logo
              : "";
          }

          const loginDetail = await getLoginDetailById(cart.a_application_login_id);

          finalResult = {
            cart: cartData,
            items: itemsWithPendingQty,
            companyDetail,
            loginDetail,
          };
        } else {
          finalResult = {
            cart: cartData,
            items: itemsWithPendingQty,
          };
        }

        return finalResult;
      })
    );

    // ✅ remove nulls (invalid states)
    const cleanedData = finalData.filter(Boolean);

    return resSuccess({
      data: {
        items: cleanedData, // ✅ ARRAY RETURN
      },
    });

  } catch (error) {
    console.error("Error in orderByMultipleId:", error);
    return resBadRequest({ developer_msg: error });
  }
};

const parseAsUTC = (dateInput) => {
  if (!dateInput) {
    return new Date(NaN);
  }

  let date;
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      return new Date(NaN);
    }
    return dateInput; // Sequelize Date, assumed UTC
  } else if (typeof dateInput === 'string') {
    if (dateInput.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
      date = new Date(dateInput.replace(' ', 'T') + 'Z');
    } else {
      date = new Date(dateInput);
    }
  } else {
    console.warn("parseAsUTC received unexpected input type:", dateInput);
    return new Date(NaN);
  }

  if (isNaN(date.getTime())) {
    console.warn("parseAsUTC produced invalid date for input:", dateInput);
    return new Date(NaN);
  }
  return date;
};


export const orderUpdate = async (req, res) => {
  try {
    let {
      update_cart,
      update_cart_items,
      cart_id,
      a_application_login_id,
      Approve_application_login_id,
      is_approve,
      type,
      reference_cart_id
    } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const byPassCompany = [];
    const current_date = new Date();
    let formattedDateTime = moment(current_date).format("YYYY-MM-DD HH:mm:ss");
    if (byPassCompany.includes(findCompanyId.company_masters_id)) {
      formattedDateTime = moment('2026-03-31 15:31:00', "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD HH:mm:ss");
      update_cart.new_updateDateTime = '2026-03-31T00:00:00.000Z';
      update_cart.cart_date = '2026-03-31';
    }

    const fatchStrickProductCheckOrNot = await companyModel.findAll({
      where: {
        isDelete: 0,
        id: findCompanyId.company_masters_id,
      },
      attributes: ["is_strict_check_product_stock", "is_strict_wharehouse_wise_product_stock_check", "quotation_sr_number_generate_flag", "order_sr_number_generate_flag", "sales_invoice_sr_number_generate_flag",
        "return_sales_invoice_sr_number_generate_flag", "purchase_order_sr_number_generate_flag", "purchase_invoice_sr_number_generate_flag",
        "return_purchase_invoice_sr_number_generate_flag", "inward_sr_number_generate_flag", "dispatch_sr_number_generate_flag"]
    });

    const sr_number_generatetion_flag = await getSrNumberGenerateAutoOrManuly(type, fatchStrickProductCheckOrNot);

    if (sr_number_generatetion_flag == 1 && is_approve == 1) {
      if (!isValid(update_cart?.entered_series_number)) {
        return resError({
          ack_msg: "Please enter sr number",
          developer_msg: "series not entered",
        });
      }
      if (!isValid(update_cart?.entered_series_date)) {
        return resError({
          ack_msg: "Please select sr number date",
          developer_msg: "series date not entered",
        });
      }
    }

    let reference_cart_type;

    if ([3].includes(type) && reference_cart_id && reference_cart_id != "" && is_approve == 1 &&
      fatchStrickProductCheckOrNot[0]?.is_strict_check_product_stock == 2) {
      const cartModels = cartModel(req.tenantDB)
      const getTypeOfReferance = await cartModels.findOne({
        where: {
          id: reference_cart_id,
          isDelete: 0
        },
        attributes: ["id", "type"],
        row: true
      })
      console.log("getTypeOfReferancegetTypeOfReferancegetTypeOfReferance", getTypeOfReferance);

      reference_cart_type = getTypeOfReferance.type

    }

    if (
      reference_cart_type != 9 &&
      is_approve == 1 &&
      [3, 9].includes(type) &&
      fatchStrickProductCheckOrNot[0]?.is_strict_check_product_stock == 2
    ) {
      const CartItem = cartItemModel(req.tenantDB);
      const WarehouseModel = wareHouseModel(req.tenantDB);
      for (const item of update_cart_items) {
        // Skip deleted items
        // const whereClauseStock = {
        //   isDelete: 0,
        //   item_product_id: item.item_product_id,
        //   [Op.or]: [
        //     { company_masters_id: findCompanyId.company_masters_id }
        //   ],
        //   cart_number: { [Op.ne]: null },
        //   cart_type: { [Op.in]: [3, 4, 8, 9] } // 3= sales 4= purchase 8= inward 9= dispatch 
        // };

        const whereClauseStock = {
          isDelete: 0,
          item_product_id: item.item_product_id,
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
        console.log("whereClauseStockwhereClauseStock", whereClauseStock);

        if (
          fatchStrickProductCheckOrNot[0]?.is_strict_wharehouse_wise_product_stock_check == 2 &&
          item.item_warehouse_id &&
          item.item_warehouse_id != -1
        ) {
          whereClauseStock.item_warehouse_id = item.item_warehouse_id;


          const warehouseData = await WarehouseModel.findOne({
            where: {
              id: item.item_warehouse_id,
              isDelete: 0,
            },
            attributes: ["warehouse_name"],
          });

          if (warehouseData) {
            warehouseName = warehouseData.warehouse_name;
          }
        }
        let warehouseName = "total stock";


        const stockItems = await CartItem.findAll({
          where: whereClauseStock,
          attributes: ["item_product_id", "cart_type", "item_qty", "reference_type"]
        });

        console.log("stockItemsstockItemsstockItems", stockItems);

        // cart_item na tyable ma salaes invoice jetli padeli hoy aenp total aape
        // Calculate current stock

        const currentStock = stockItems.reduce((total, row) => {
          if ((row.cart_type == 4 && row.reference_type != 8) || row.cart_type == 6 || row.cart_type == 8 || row.cart_type == 10) {
            return total + Number(row.item_qty);
          } else if ((row.cart_type == 3 && row.reference_type != 9) || row.cart_type == 7 || row.cart_type == 9 || row.cart_type == 11) {
            return total - Number(row.item_qty);
          }
          return total;
        }, 0);
        //STOCK VALIDATION
        if (Number(item.item_qty) > currentStock) {
          return resError({
            ack_msg: `Product "${item.item_product_name}" has only ${currentStock} stock in ${warehouseName}, you are trying to use ${item.item_qty}`,
            developer_msg: `Product "${item.item_product_name}" has only ${currentStock} stock in ${warehouseName}, you are trying to use ${item.item_qty}`,
            data: {
              product_id: item.item_product_id,
              product_name: item.item_product_name,
              available_stock: currentStock,
              requested_qty: item.item_qty
            }
          });
        }
      }
    }

    // ================= END STOCK STRICT CHECK =================

    // Handle multiple cart_ids
    if (Array.isArray(cart_id) && cart_id.length > 1) {
      const results = [];
      const errors = [];

      for (const singleCartId of cart_id) {
        try {
          // Create a new request body for each cart_id
          const singleReqBody = {
            ...req.body,
            cart_id: singleCartId,
          };

          // Create a modified request object
          const modifiedReq = {
            ...req,
            body: singleReqBody
          };

          // Recursively call the same function with single cart_id
          const result = await orderUpdate(modifiedReq, res);
          results.push({
            cart_id: singleCartId,
            success: true,
            data: result
          });
        } catch (error) {
          errors.push({
            cart_id: singleCartId,
            success: false,
            error: error.message
          });
        }
      }

      if (errors.length > 0) {
        return resError({
          ack_msg: "Some updates failed",
          developer_msg: "Multiple cart update with errors",
          results,
          errors
        });
      }

      return resSuccess({
        ack_msg: "All carts updated successfully",
        data: results
      });
    }

    // If cart_id is array with single element, extract it
    if (Array.isArray(cart_id) && cart_id.length === 1) {
      cart_id = cart_id[0];
    }

    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const CATSerialNumberModal = cartSerialNumberModel(req.tenantDB);
    // return

    if (!findCompanyId || !findCompanyId.company_masters_id) {
      return resBadRequest({
        developer_msg: "Invalid company ID for the provided login ID.",
      });
    }



    if (cart_id && update_cart == undefined && update_cart_items == undefined) {

      const updateCartData = await CATModel.findOne({
        where: {
          id: cart_id,
          isDelete: 0
        },
      })
      const updateCartItemData = await CATItemModel.findAll({
        where: {
          cart_id: cart_id,
          isDelete: 0
        },
      })

      update_cart = {
        ...updateCartData,
        new_updateDateTime: formattedDateTime,
      };
      update_cart_items = updateCartItemData;

      update_cart.new_updateDateTime = formattedDateTime

    }

    let newUpdateformattedDateTime = null;
    let newUpdateDateObj = null;
    if (update_cart?.new_updateDateTime && sr_number_generatetion_flag != 1) {
      try {
        console.log("under avbe cheeeee");

        let dateObj = new Date(update_cart.new_updateDateTime);
        if (isNaN(dateObj.getTime())) {
          newUpdateformattedDateTime = null;
          newUpdateDateObj = null;
        } else {
          newUpdateDateObj = dateObj;
          newUpdateformattedDateTime = moment.utc(dateObj).format("YYYY-MM-DD HH:mm:ss");
        }
      } catch (error) {
        console.error("Date conversion error:", error);
        newUpdateformattedDateTime = null;
        newUpdateDateObj = null;
      }
    }

    const companyDetail = await companyModel.findAll({
      where: {
        isDelete: 0,
        id: findCompanyId.company_masters_id,
      },
      attributes: [
        "quotation_view_formate",
        "order_view_formate",
        "invoice_view_formate",
        "purchase_view_formate",
        "purchase_order_view_formate",
        "return_sales_invoice_view_formate",
        "return_purchase_invoice_view_formate",
        "quotation_title",
        "order_title",
        "invoice_title",
        "purchase_title",
        "purchase_order_title",
        "return_sales_invoice_title",
        "return_purchase_invoice_title",
        "inward_title",
        "inward_view_formate",
        "dispatch_title",
        "dispatch_view_formate",
        "proforma_invoice_title",
        "proforma_invoice_view_formate"
      ],
    });

    let dynamicPrintView = 1;
    let dynamicPrintTitle = "Quotation";
    if (update_cart.type == 1) {
      dynamicPrintView = companyDetail[0].quotation_view_formate;
      dynamicPrintTitle = companyDetail[0].quotation_title;
    } else if (update_cart.type == 2) {
      dynamicPrintView = companyDetail[0].order_view_formate;
      dynamicPrintTitle = companyDetail[0].order_title;
    } else if (update_cart.type == 3) {
      dynamicPrintView = companyDetail[0].invoice_view_formate;
      dynamicPrintTitle = companyDetail[0].invoice_title;
    } else if (update_cart.type == 4) {
      dynamicPrintView = companyDetail[0].purchase_view_formate;
      dynamicPrintTitle = companyDetail[0].purchase_title;
    } else if (update_cart.type == 5) {
      dynamicPrintView = companyDetail[0].purchase_order_view_formate;
      dynamicPrintTitle = companyDetail[0].purchase_order_title;
    } else if (update_cart.type == 6) {
      dynamicPrintView = companyDetail[0].return_sales_invoice_view_formate;
      dynamicPrintTitle = companyDetail[0].return_sales_invoice_title;
    } else if (update_cart.type == 7) {
      dynamicPrintView = companyDetail[0].return_purchase_invoice_view_formate;
      dynamicPrintTitle = companyDetail[0].return_purchase_invoice_title;

    } else if (update_cart.type == 8) {
      dynamicPrintView = companyDetail[0].inward_view_formate;
      dynamicPrintTitle = companyDetail[0].inward_title;
    } else if (update_cart.type == 9) {
      dynamicPrintView = companyDetail[0].dispatch_view_formate;
      dynamicPrintTitle = companyDetail[0].dispatch_title;
    } else if (update_cart.type == 12) {
      dynamicPrintView = companyDetail[0].proforma_invoice_view_formate;
      dynamicPrintTitle = companyDetail[0].proforma_invoice_title;
    }


    if (update_cart.new_srNumber != update_cart.old_srNumber && update_cart.new_updateDateTime && update_cart.new_srNumber > 0 && sr_number_generatetion_flag != 1) {
      const formattedDate = moment(update_cart.new_updateDateTime).format('YYYY-MM-DD');
      if (update_cart.new_srNumber != update_cart.old_srNumber) {
        const existingRecord = await CATModel.findOne({
          where: {
            type: update_cart.type,
            sr_by_number: update_cart.new_srNumber,
            sr_by_prifix: update_cart.sr_by_prifix,
            isDelete: 0
          },
          attributes: ["id"]
        });

        if (existingRecord) {
          return resError({
            ack_msg: "New number already exists in the system",
            developer_msg: "New number already exists in the database"
          });
        }
      }

      const financialYearDetail = await getNumberSeries(
        findCompanyId.company_masters_id,
        update_cart.type,
        formattedDate,
        update_cart.sr_by_prifix,
        req,
        update_cart.new_srNumber
      );

      let newCartNumber = financialYearDetail?.order_no;
      let sr_by_number = update_cart.new_srNumber;

      await CATModel.update({
        sr_by_number: sr_by_number,
        cart_number: newCartNumber,
        ...(newUpdateformattedDateTime && { update_Date_time: newUpdateformattedDateTime })
      }, {
        where: {
          id: cart_id,
          isDelete: 0
        }
      });

      await CATItemModel.update({
        cart_number: newCartNumber
      }, {
        where: {
          cart_id: cart_id,
          isDelete: 0
        }
      });
    }

    let financialYearDetail;
    if (is_approve === 1) {
      const checkBlank = await CATModel.findOne({
        where: {
          isDelete: 0,
          company_masters_id: findCompanyId.company_masters_id,
          id: cart_id,
          [Op.or]: [{ cart_number: "" }, { sr_by_number: 0 }],
        },
      });
      if (checkBlank) {
        financialYearDetail = await getNumberSeries(
          findCompanyId.company_masters_id,
          type,
          update_cart.cart_date || Date.now(),
          update_cart.sr_by_prifix,
          req
        );

        if (sr_number_generatetion_flag == 1) {
          const isExist = await CATModel.findOne({ where: { isDelete: 0, cart_number: update_cart?.entered_series_number, type: update_cart.type, id: { [Op.ne]: cart_id } } });
          if (isExist) {
            return resError({
              ack_msg: "Entered sr number are already exist",
              developer_msg: "Series is duplicate",
            });
          }
          financialYearDetail.order_no = update_cart?.entered_series_number;
          financialYearDetail.sr_by_no = 0;
          financialYearDetail.sr_by_prifix = "";
          formattedDateTime = moment(update_cart?.entered_series_date).format("YYYY-MM-DD") + " " + moment().format("HH:mm:ss");
        }
      }
    }

    const cartItemCustom = {
      carts_column_number_1: update_cart.carts_column_number_1 || "",
      carts_column_number_2: update_cart.carts_column_number_2 || "",
      carts_column_number_3: update_cart.carts_column_number_3 || "",
      carts_column_number_4: update_cart.carts_column_number_4 || "",
      carts_column_number_5: update_cart.carts_column_number_5 || "",
      carts_column_text_1: update_cart.carts_column_text_1 || "",
      carts_column_text_2: update_cart.carts_column_text_2 || "",
      carts_column_text_3: update_cart.carts_column_text_3 || "",
      carts_column_text_4: update_cart.carts_column_text_4 || "",
      carts_column_text_5: update_cart.carts_column_text_5 || "",
      carts_column_text_area_1: update_cart.carts_column_text_area_1 || "",
      carts_column_text_area_2: update_cart.carts_column_text_area_2 || "",
      carts_column_text_area_3: update_cart.carts_column_text_area_3 || "",
      carts_column_text_area_4: update_cart.carts_column_text_area_4 || "",
      carts_column_text_area_5: update_cart.carts_column_text_area_5 || "",
      carts_column_date_1: update_cart.carts_column_date_1 || "",
      carts_column_date_2: update_cart.carts_column_date_2 || "",
      carts_column_date_3: update_cart.carts_column_date_3 || "",
      carts_column_date_4: update_cart.carts_column_date_4 || "",
      carts_column_date_5: update_cart.carts_column_date_5 || "",
      carts_column_date_and_time_1: update_cart.carts_column_date_and_time_1 || "",
      carts_column_date_and_time_2: update_cart.carts_column_date_and_time_2 || "",
      carts_column_date_and_time_3: update_cart.carts_column_date_and_time_3 || "",
      carts_column_date_and_time_4: update_cart.carts_column_date_and_time_4 || "",
      carts_column_date_and_time_5: update_cart.carts_column_date_and_time_5 || "",
      carts_column_time_1: update_cart.carts_column_time_1 || "",
      carts_column_time_2: update_cart.carts_column_time_2 || "",
      carts_column_time_3: update_cart.carts_column_time_3 || "",
      carts_column_time_4: update_cart.carts_column_time_4 || "",
      carts_column_time_5: update_cart.carts_column_time_5 || "",
      carts_column_switch_1: update_cart.carts_column_switch_1 ? 1 : 0,
      carts_column_switch_2: update_cart.carts_column_switch_2 ? 1 : 0,
      carts_column_switch_3: update_cart.carts_column_switch_3 ? 1 : 0,
      carts_column_switch_4: update_cart.carts_column_switch_4 ? 1 : 0,
      carts_column_switch_5: update_cart.carts_column_switch_5 ? 1 : 0,
      carts_column_decimal_1: update_cart.carts_column_decimal_1 || "",
      carts_column_decimal_2: update_cart.carts_column_decimal_2 || "",
      carts_column_decimal_3: update_cart.carts_column_decimal_3 || "",
      carts_column_decimal_4: update_cart.carts_column_decimal_4 || "",
      carts_column_decimal_5: update_cart.carts_column_decimal_5 || "",
      carts_column_dropdown_1: update_cart.carts_column_dropdown_1 || "",
      carts_column_dropdown_2: update_cart.carts_column_dropdown_2 || "",
      carts_column_dropdown_3: update_cart.carts_column_dropdown_3 || "",
      carts_column_dropdown_4: update_cart.carts_column_dropdown_4 || "",
      carts_column_dropdown_5: update_cart.carts_column_dropdown_5 || "",
      carts_column_radio_1: update_cart.carts_column_radio_1 || "",
      carts_column_radio_2: update_cart.carts_column_radio_2 || "",
      carts_column_radio_3: update_cart.carts_column_radio_3 || "",
      carts_column_radio_4: update_cart.carts_column_radio_4 || "",
      carts_column_radio_5: update_cart.carts_column_radio_5 || "",
      carts_column_page_text_1: update_cart.carts_column_page_text_1 || "",
      carts_column_page_text_2: update_cart.carts_column_page_text_2 || "",
      carts_column_page_text_3: update_cart.carts_column_page_text_3 || "",
      carts_column_page_text_4: update_cart.carts_column_page_text_4 || "",
      carts_column_page_text_5: update_cart.carts_column_page_text_5 || "",
      carts_column_page_url_1: update_cart.carts_column_page_url_1 || "",
      carts_column_page_url_2: update_cart.carts_column_page_url_2 || "",
      carts_column_page_url_3: update_cart.carts_column_page_url_3 || "",
      carts_column_page_url_4: update_cart.carts_column_page_url_4 || "",
      carts_column_page_url_5: update_cart.carts_column_page_url_5 || "",
    };

    // let update_dateTime = newUpdateformattedDateTime &&
    //   newUpdateformattedDateTime !== "Invalid date" &&
    //   newUpdateformattedDateTime !== "" &&
    //   newUpdateformattedDateTime != null &&
    //   newUpdateformattedDateTime !== undefined
    //   ? newUpdateformattedDateTime
    //   : formattedDateTime;

    let update_dateTime = newUpdateDateObj || formattedDateTime;

    // cart Type wise add  stock_type
    let getStockType = 0;
    if (is_approve == 1) {
      getStockType = STOCK_IN_OUT_ACCESSIBILITY[update_cart.type] ?? "";
    }

    let reference_cart_type_n;
    if (reference_cart_id && reference_cart_id != "") {
      const cartModels = cartModel(req.tenantDB);
      const referenceCart = await cartModels.findOne({
        where: {
          referance_cart_id: reference_cart_id,
          isDelete: 0
        },
        attributes: ["reference_type"],
        raw: true
      });
      reference_cart_type_n = referenceCart.reference_type;
      if (
        (referenceCart &&
          referenceCart.reference_type == 9 &&
          Number(update_cart.type) == 3) ||
        (referenceCart &&
          referenceCart.reference_type == 8 &&
          Number(update_cart.type) == 4)
      ) {
        getStockType = 0;
      }
    }
    let cartBody;

    switch (is_approve) {
      case 1:
        cartBody = {
          ...update_cart,
          cart_number: financialYearDetail?.order_no,
          sr_by_number: financialYearDetail?.sr_by_no,
          sr_by_prifix: financialYearDetail?.sr_by_prifix,
          approve_a_application_login_id: Approve_application_login_id,
          stock_type: getStockType,
          a_application_login_id: a_application_login_id,
          update_Date_time: update_dateTime,
          ...cartItemCustom,
        };
        break;
      case 2:
        cartBody = {
          ...update_cart,
          approve_a_application_login_id: Approve_application_login_id,
          a_application_login_id: a_application_login_id,
          update_Date_time: update_dateTime,
          stock_type: getStockType,
          ...cartItemCustom,
        };
        break;
      default:
        cartBody = {
          ...update_cart,
          approve_a_application_login_id: Approve_application_login_id,
          a_application_login_id: a_application_login_id,
          update_Date_time: update_dateTime,
          stock_type: getStockType,
          ...cartItemCustom,
        };
        break;
    }
    const updateCartResult = await CATModel.update(cartBody, {
      where: { id: cart_id, isDelete: 0 },
    });

    const usernameLiteral = async (a_application_login_id) => {
      const user = await loginModel.findOne({
        where: {
          id: a_application_login_id,
          isDelete: 0,
        },
        attributes: ["username"],
      });
      return user?.username || null;
    };

    const findCartApplicationId = await CATModel.findOne({
      where: { id: cart_id, isDelete: 0 },
      attributes: ["a_application_login_id"],
    });

    const username = await usernameLiteral(
      findCartApplicationId?.dataValues?.a_application_login_id
    );
    const approveBy = await usernameLiteral(
      cartBody.approve_a_application_login_id
    );

    // if (!updateCartResult[0]) {
    //   return resError({
    //     ack_msg: "Saved Draft Successfully",
    //     developer_msg: "Failed to update cart data",
    //     updateCartResult,
    //   });
    // }

    if (!updateCartResult[0]) {
      return resError({
        ack_msg: "",
        developer_msg: "Failed to update cart data",
        updateCartResult,
      });
    }


    const findCartData = await CATModel.findOne({
      where: { id: cart_id, isDelete: 0 },
    });

    if (!findCartData || !findCartData.dataValues) {
      return resBadRequest({
        developer_msg: "Cart data not found after update",
      });
    }

    const isSrNumberChanged =
      update_cart?.new_srNumber &&
      update_cart?.old_srNumber &&
      Number(update_cart.new_srNumber) !== Number(update_cart.old_srNumber);

    if (
      is_approve === 1 &&
      (Number(update_cart.type) === 3 || Number(update_cart.type) === 7) &&
      update_cart.grand_total != 0
    ) {
      const ATModel = accountTransactionsModel(req.tenantDB);

      if (isSrNumberChanged) {
        //  SOFT DELETE OLD
        await ATModel.update(
          { isDelete: 1 },
          {
            where: {
              reference_id: cart_id,
              contact_masters_id: update_cart.to_customer_id,
              reference_table: update_cart.account_transactions_ref_table || "carts",
              isDelete: 0,
            },
          }
        );

        // CREATE NEW
        const invoiceNum = findCartData.dataValues.cart_number;
        const invoiceDate = findCartData.dataValues.cart_date;
        const customerName = findCartData.dataValues.to_customer_name;
        const createDateTime = findCartData.dataValues.created_date_time.toISOString();

        await createAccountTransaction({
          mode: update_cart.payment_type ? update_cart.payment_type : -1,
          type: 2,
          amount: update_cart.grand_total,
          referenceId: cart_id,
          referenceTable: update_cart.account_transactions_ref_table || "carts",
          remarkDetails: { invoiceNum, invoiceDate, customerName },
          paymentDateTime: createDateTime,
          approvedBy: a_application_login_id,
          contactMasterId: findCartData.dataValues.to_customer_id,
          applicationLoginId: a_application_login_id,
          companyMasterId: findCompanyId.company_masters_id,
          miracle_account_legder: update_cart.miracle_account_legder ? update_cart.miracle_account_legder : "",
          req,
        });

      } else {
        const findAccountTr = await ATModel.findOne({
          where: {
            reference_id: cart_id,
            isDelete: 0,
            reference_table: update_cart.account_transactions_ref_table || "carts",
          },
          attributes: ["id", "reference_id", "reference_table", "isDelete"],
        });

        if (findAccountTr) {
          await ATModel.update(
            { amount: update_cart.grand_total },
            {
              where: {
                id: findAccountTr.dataValues.id,
                reference_id: findAccountTr.dataValues.reference_id,
                isDelete: 0,
              },
            }
          );
        } else {
          if (
            !findCartData.dataValues.cart_number ||
            !findCartData.dataValues.cart_date ||
            !findCartData.dataValues.to_customer_name ||
            !findCartData.dataValues.created_date_time ||
            !findCartData.dataValues.to_customer_id ||
            !update_cart.grand_total ||
            !update_cart.account_transactions_ref_table
          ) {
            return resBadRequest({
              developer_msg:
                "Missing required fields for account transaction (type 3)",
            });
          }

          const invoiceNum = findCartData.dataValues.cart_number;
          const invoiceDate = findCartData.dataValues.cart_date;
          const customerName = findCartData.dataValues.to_customer_name;
          const customerEmail = findCartData.dataValues.to_customer_email;
          const createDateTime = findCartData.dataValues.created_date_time;
          const convertDateTimeString = createDateTime.toISOString();

          await createAccountTransaction({
            mode: update_cart.payment_type ? update_cart.payment_type : -1,
            type: 2,
            amount: update_cart.grand_total,
            referenceId: cart_id,
            referenceTable: update_cart.account_transactions_ref_table || "carts",
            remarkDetails: { invoiceNum, invoiceDate, customerName },
            paymentDateTime: convertDateTimeString,
            approvedBy: a_application_login_id,
            contactMasterId: findCartData.dataValues.to_customer_id,
            applicationLoginId: a_application_login_id,
            companyMasterId: findCompanyId.company_masters_id,
            miracle_account_legder: update_cart.miracle_account_legder ? update_cart.miracle_account_legder : "",
            req,
          });
        }
      }
    }

    if (
      is_approve === 1 &&
      (Number(update_cart.type) === 4 || Number(update_cart.type) === 6) &&
      update_cart.grand_total != 0
    ) {
      const ATModel = accountTransactionsModel(req.tenantDB);

      if (isSrNumberChanged) {
        //  DELETE
        await ATModel.update(
          { isDelete: 1 },
          {
            where: {
              reference_id: cart_id,
              contact_masters_id: update_cart.to_customer_id,
              reference_table: update_cart.account_transactions_ref_table || "carts",
              isDelete: 0,
            },
          }
        );

        // RE-CREATE
        const invoiceNum = findCartData.dataValues.cart_number;
        const invoiceDate = findCartData.dataValues.cart_date;
        const customerName = findCartData.dataValues.to_customer_name;
        const createDateTime = findCartData.dataValues.created_date_time.toISOString();

        await createAccountTransaction({
          mode: update_cart.payment_type ? update_cart.payment_type : -1,
          type: 1,
          amount: update_cart.grand_total,
          referenceId: cart_id,
          referenceTable: update_cart.account_transactions_ref_table || "carts",
          remarkDetails: { invoiceNum, invoiceDate, customerName },
          paymentDateTime: createDateTime,
          approvedBy: a_application_login_id,
          contactMasterId: findCartData.dataValues.to_customer_id,
          applicationLoginId: a_application_login_id,
          companyMasterId: findCompanyId.company_masters_id,
          miracle_account_legder: update_cart.miracle_account_legder ? update_cart.miracle_account_legder : "",
          req,
        });

      } else {
        if (
          !findCartData.dataValues.cart_number ||
          !findCartData.dataValues.cart_date ||
          !findCartData.dataValues.to_customer_name ||
          !findCartData.dataValues.created_date_time ||
          !findCartData.dataValues.to_customer_id ||
          !update_cart.grand_total ||
          !update_cart.account_transactions_ref_table
        ) {
          return resBadRequest({
            developer_msg:
              "Missing required fields for account transaction (type 4)",
          });
        }

        const invoiceNum = findCartData.dataValues.cart_number;
        const invoiceDate = findCartData.dataValues.cart_date;
        const customerName = findCartData.dataValues.to_customer_name;
        const customerEmail = findCartData.dataValues.to_customer_email;
        const createDateTime = findCartData.dataValues.created_date_time;
        const convertDateTimeString = createDateTime.toISOString();

        await createAccountTransaction({
          mode: update_cart.payment_type ? update_cart.payment_type : -1,
          type: 1,
          amount: update_cart.grand_total,
          referenceId: cart_id,
          referenceTable: update_cart.account_transactions_ref_table || "carts",
          remarkDetails: { invoiceNum, invoiceDate, customerName },
          paymentDateTime: convertDateTimeString,
          approvedBy: a_application_login_id,
          contactMasterId: findCartData.dataValues.to_customer_id,
          applicationLoginId: a_application_login_id,
          companyMasterId: findCompanyId.company_masters_id,
          miracle_account_legder: update_cart.miracle_account_legder ? update_cart.miracle_account_legder : "",
          req,
        });
      }
    }

    if (is_approve === 1) {
      const cartToMsgBody = {
        contact_masters_id: findCartData.dataValues.to_customer_id,
        a_application_login_id: req.body.a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        msg_cart_id: findCartData.dataValues.id,
        description: `
          <b>${dynamicPrintTitle}</b><br>
          ${findCartData.dataValues.cart_number
            ? `#${findCartData.dataValues.cart_number}`
            : "#XXXXXXXX"
          }<br>
          <b>${findCartData.dataValues.grand_total && findCartData.dataValues.type != 9 && findCartData.dataValues.type != 8
            ? `${findCartData.dataValues.grand_total} ${symbolCurrency}`
            : ""
          }</b><br>
          <a href="${APP_URL_SMALL_OFFICE_CRM}/OrderPrintViewV${dynamicPrintView}/${findCartData?.dataValues?.id || "unknown"
          }/1" target="_blank">
            View ${dynamicPrintTitle}
          </a><br>
          <p><b>Created By:</b> ${username}(${formatDateAndTimeCreateDateTime(
            findCartData.dataValues.created_date_time
          )})</p>
          <p><b>Approve By:</b> ${approveBy}(${formatDateAndTimeCreateDateTime(
            findCartData.dataValues.update_Date_time
          )})</p>
        `,
        created_date_time: formattedDateTime,
        message_side: 1,
        message_type_id: 2,
        application_login_name: username,
      };

      if ([3, 4, 6, 7].includes(findCartData.dataValues.type) && findCartData.dataValues.grand_total > 0) {
        const getTypeName = (TypeId) => {
          const found = paymentModeList.find(
            (item) => item.id === String(TypeId)
          );
          return found ? found.type : "Unknown";
        };
        const AccountMsg = {
          contact_masters_id: findCartData.dataValues.to_customer_id,
          a_application_login_id: req.body.a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          msg_cart_id: findCartData.dataValues.id,
          description: `
            <b>Account History</b><br>
            ${findCartData.dataValues.cart_number
              ? `#${findCartData.dataValues.cart_number}`
              : "#XXXXXXXX"
            }<br>
            Payment Type: ${getTypeName(findCartData.dataValues.type)}<br>
            <b>${findCartData.dataValues.grand_total
              ? `${findCartData.dataValues.grand_total} ${symbolCurrency} By Other`
              : ""
            }</b><br>
            ${formatDateCustom(findCartData.dataValues.cart_date) || ""}
          `,
          created_date_time: formattedDateTime,
          message_side: 1,
          message_type_id: 2,
          application_login_name: username,
        };
        const ATModel = contactMessageHistory(req.tenantDB);
        await ATModel.create(AccountMsg);
      }

      if (is_approve === 1 && [2, 3, 4, 5, 6, 7].includes(Number(findCartData.dataValues.type))) {

        const contactMasterModel = contactModel(req.tenantDB);

        const contact = await contactMasterModel.findOne({
          where: {
            id: findCartData.dataValues.to_customer_id,
          },
        });

        let existingLabel = contact?.dataValues?.lable || "";
        let updatedLabel = "";
        let lableId;

        if ([2, 3, 7].includes(Number(findCartData.dataValues.type))) {
          lableId = -2;
        } else {
          lableId = -1;
        }

        if (existingLabel.trim()) {
          const labelArray = existingLabel.split(',').map(Number);
          if (!labelArray.includes(lableId)) {
            updatedLabel = `${existingLabel},${lableId}`;
          } else {
            updatedLabel = existingLabel;
          }
        } else {
          updatedLabel = `${lableId}`;
        }


        await contactMasterModel.update(
          { lable: updatedLabel },
          {
            where: {
              id: findCartData.dataValues.to_customer_id,
            },
          }
        );
      }

      if (
        [2, 3, 4, 5, 6, 7].includes(findCartData.dataValues.type) &&
        findCartData.dataValues.advance_payment !== "" &&
        findCartData.dataValues.advance_payment >= 0 &&
        findCartData.dataValues.advance_payment != 0 &&
        findCartData.dataValues.advance_payment != undefined &&
        findCartData.dataValues.advance_payment != null
      ) {
        const AccountMsg = {
          contact_masters_id: findCartData.dataValues.to_customer_id,
          a_application_login_id: req.body.a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          msg_cart_id: findCartData.dataValues.id,
          description: `
            <b>Account History</b><br>
            (Advance Payment)<br>
            ${findCartData.dataValues.cart_number
              ? `#${findCartData.dataValues.cart_number}`
              : "#XXXXXXXX"
            }<br>
            Payment Type: ${[2, 3, 7].includes(findCartData.dataValues.type) ? "Credit" : "Debit"}<br>
            <b>${findCartData.dataValues.advance_payment
              ? `${findCartData.dataValues.advance_payment} ${symbolCurrency} By Other`
              : ""
            }</b><br>
            ${formatDateCustom(findCartData.dataValues.cart_date) || ""}
          `,
          created_date_time: formattedDateTime,
          message_side: 1,
          message_type_id: 2,
          application_login_name: username,
          amount_type: 1
        };
        const ATModel = contactMessageHistory(req.tenantDB);
        await ATModel.create(AccountMsg);
      }

      const CBTMSGHistory = contactMessageHistory(req.tenantDB);
      await CBTMSGHistory.create(cartToMsgBody);
    }

    if (
      is_approve === 1 &&
      [3, 4, 6, 7].includes(Number(update_cart.type)) &&
      update_cart.advance_payment != "" &&
      update_cart.advance_payment != 0 &&
      update_cart.advance_payment >= 0 &&
      update_cart.advance_payment != null &&
      update_cart.advance_payment != undefined
    ) {

      const invoiceNum = findCartData.dataValues.cart_number;
      const invoiceDate = findCartData.dataValues.cart_date;
      const customerName = findCartData.dataValues.to_customer_name;
      const createDateTime = findCartData.dataValues.created_date_time.toISOString();

      const ATModel = accountTransactionsModel(req.tenantDB);

      const existingAdvance = await ATModel.findOne({
        where: {
          reference_id: cart_id,
          reference_table: update_cart.account_transactions_ref_table || "carts",
          isDelete: 0,
          // VERY IMPORTANT → identify advance payment
          remark: { [Op.like]: "%Advance Payment%" } // or use proper field if stored as JSON
        },
      });

      if (existingAdvance) {
        // UPDATE
        await ATModel.update(
          {
            amount: update_cart.advance_payment,
            mode: update_cart.payment_type,
            miracle_account_legder: update_cart.miracle_account_ledger_adv ? update_cart.miracle_account_ledger_adv : "",
          },
          {
            where: {
              id: existingAdvance.id,
              isDelete: 0,
            },
          }
        );
      } else {
        // CREATE
        await createAccountTransaction({
          mode: update_cart.payment_type ? update_cart.payment_type : -1,
          type:
            Number(update_cart.type) == 2 ||
              Number(update_cart.type) == 3 ||
              Number(update_cart.type) == 7
              ? 1
              : 2,
          amount: update_cart.advance_payment,
          referenceId: cart_id,
          referenceTable:
            update_cart.account_transactions_ref_table || "carts",
          remarkDetails: {
            type_name: "Advance Payment",
            invoiceNum,
            invoiceDate,
            customerName,
          },
          paymentDateTime: createDateTime,
          approvedBy: 0,
          contactMasterId: findCartData.dataValues.to_customer_id,
          applicationLoginId: a_application_login_id,
          companyMasterId: findCompanyId.company_masters_id,
          miracle_account_legder: update_cart.miracle_account_ledger_adv ? update_cart.miracle_account_ledger_adv : "",
          amount_type: 1,
          req,
        });
      }
    }

    if (
      is_approve === 1 &&
      [2, 5].includes(Number(update_cart.type)) &&
      update_cart.advance_payment != "" &&
      update_cart.advance_payment != 0 &&
      update_cart.advance_payment >= 0 &&
      update_cart.advance_payment != null &&
      update_cart.advance_payment != undefined
    ) {
      const ATModel = accountTransactionsModel(req.tenantDB);
      if (isSrNumberChanged) {

        //SOFT DELETE OLD ADVANCE
        await ATModel.update(
          { isDelete: 1 },
          {
            where: {
              reference_id: cart_id,
              contact_masters_id: update_cart.to_customer_id,
              reference_table: update_cart.account_transactions_ref_table || "carts",
              isDelete: 0,
            },
          }
        );
      }
      const invoiceNum = findCartData.dataValues.cart_number;
      const invoiceDate = findCartData.dataValues.cart_date;
      const customerName = findCartData.dataValues.to_customer_name;
      const createDateTime = findCartData.dataValues.created_date_time.toISOString();

      await createAccountTransaction({
        mode: update_cart.payment_type ? update_cart.payment_type : -1,
        type: Number(update_cart.type) == 2 || Number(update_cart.type) == 3 || Number(update_cart.type) == 7 ? 1 : 2,
        amount: update_cart.advance_payment,
        referenceId: cart_id,
        referenceTable: update_cart.account_transactions_ref_table || "carts",
        remarkDetails: {
          type_name: "Advance Payment",
          invoiceNum: invoiceNum,
          invoiceDate: invoiceDate,
          customerName: customerName,
        },
        paymentDateTime: createDateTime,
        approvedBy: 0,
        contactMasterId: findCartData.dataValues.to_customer_id,
        applicationLoginId: a_application_login_id,
        companyMasterId: findCompanyId.company_masters_id,
        miracle_account_legder: update_cart.miracle_account_ledger_adv ? update_cart.miracle_account_ledger_adv : "",
        amount_type: 1,
        req,
      });
    }

    const cartItems = update_cart_items;
    let results = "";
    let createCartItemUpdate = [];

    for (let i = 0; i < cartItems.length; i++) {
      if (cartItems[i].cart_item_id_del) {
        const deleteResult = await CATItemModel.update(
          { isDelete: 1 },
          {
            where: {
              id: cartItems[i].cart_item_id_del,
              cart_id: cart_id,
              isDelete: 0,
            },
          }
        );
        results += `Deleted cart item with ID: ${cartItems[i].cart_item_id_del}<br>`;
      } else if (cartItems[i].id) {
        const cartType = Number(update_cart.type);
        const warehouseId = cartItems[i].item_warehouse_id;
        const updateData = {
          item_qty: cartItems[i].item_qty,
          item_total: cartItems[i].item_total,
          item_rate: cartItems[i].item_rate,
          item_net_rate: cartItems[i].item_net_rate,
          item_discount_pct: cartItems[i].item_discount_pct,
          item_discount_pr: cartItems[i].item_discount_pr,
          item_product_description: cartItems[i].item_product_description || "",
          cart_date: update_cart.cart_date,
          cart_type: Number(update_cart.type),
          stock_type: getStockType,
          item_product_id: cartItems[i].item_product_id,
          item_category_id: cartItems[i].item_category_id,
          item_warehouse_id:
            cartType != 1 && cartType != 2 && cartType != 5 && (warehouseId === "" || warehouseId == null || warehouseId == 0)
              ? -1
              : warehouseId,
          item_inner_quantity: cartItems[i].item_inner_quantity,
          item_outer_quantity: cartItems[i].item_outer_quantity,
          item_loose_quantity: cartItems[i].item_loose_quantity,
          is_serial_num_product_item:
            cartItems[i].serial_numbers &&
              cartItems[i].serial_numbers.length > 0
              ? 1
              : 0,
          products_column_number_1: cartItems[i].products_column_number_1 || "",
          products_column_number_2: cartItems[i].products_column_number_2 || "",
          products_column_number_3: cartItems[i].products_column_number_3 || "",
          products_column_number_4: cartItems[i].products_column_number_4 || "",
          products_column_number_5: cartItems[i].products_column_number_5 || "",
          products_column_text_1: cartItems[i].products_column_text_1 || "",
          products_column_text_2: cartItems[i].products_column_text_2 || "",
          products_column_text_3: cartItems[i].products_column_text_3 || "",
          products_column_text_4: cartItems[i].products_column_text_4 || "",
          products_column_text_5: cartItems[i].products_column_text_5 || "",
          products_column_text_area_1: cartItems[i].products_column_text_area_1 || "",
          products_column_text_area_2: cartItems[i].products_column_text_area_2 || "",
          products_column_text_area_3: cartItems[i].products_column_text_area_3 || "",
          products_column_text_area_4: cartItems[i].products_column_text_area_4 || "",
          products_column_text_area_5: cartItems[i].products_column_text_area_5 || "",
          products_column_date_1: cartItems[i].products_column_date_1 || "",
          products_column_date_2: cartItems[i].products_column_date_2 || "",
          products_column_date_3: cartItems[i].products_column_date_3 || "",
          products_column_date_4: cartItems[i].products_column_date_4 || "",
          products_column_date_5: cartItems[i].products_column_date_5 || "",
          products_column_date_and_time_1: cartItems[i].products_column_date_and_time_1 || "",
          products_column_date_and_time_2: cartItems[i].products_column_date_and_time_2 || "",
          products_column_date_and_time_3: cartItems[i].products_column_date_and_time_3 || "",
          products_column_date_and_time_4: cartItems[i].products_column_date_and_time_4 || "",
          products_column_date_and_time_5: cartItems[i].products_column_date_and_time_5 || "",
          products_column_time_1: cartItems[i].products_column_time_1 || "",
          products_column_time_2: cartItems[i].products_column_time_2 || "",
          products_column_time_3: cartItems[i].products_column_time_3 || "",
          products_column_time_4: cartItems[i].products_column_time_4 || "",
          products_column_time_5: cartItems[i].products_column_time_5 || "",
          products_column_switch_1: cartItems[i].products_column_switch_1 ? 1 : 0,
          products_column_switch_2: cartItems[i].products_column_switch_2 ? 1 : 0,
          products_column_switch_3: cartItems[i].products_column_switch_3 ? 1 : 0,
          products_column_switch_4: cartItems[i].products_column_switch_4 ? 1 : 0,
          products_column_switch_5: cartItems[i].products_column_switch_5 ? 1 : 0,
          products_column_decimal_1: cartItems[i].products_column_decimal_1 || "",
          products_column_decimal_2: cartItems[i].products_column_decimal_2 || "",
          products_column_decimal_3: cartItems[i].products_column_decimal_3 || "",
          products_column_decimal_4: cartItems[i].products_column_decimal_4 || "",
          products_column_decimal_5: cartItems[i].products_column_decimal_5 || "",
          products_column_dropdown_1: cartItems[i].products_column_dropdown_1 || "",
          products_column_dropdown_2: cartItems[i].products_column_dropdown_2 || "",
          products_column_dropdown_3: cartItems[i].products_column_dropdown_3 || "",
          products_column_dropdown_4: cartItems[i].products_column_dropdown_4 || "",
          products_column_dropdown_5: cartItems[i].products_column_dropdown_5 || "",
          products_column_radio_1: cartItems[i].products_column_radio_1 || "",
          products_column_radio_2: cartItems[i].products_column_radio_2 || "",
          products_column_radio_3: cartItems[i].products_column_radio_3 || "",
          products_column_radio_4: cartItems[i].products_column_radio_4 || "",
          products_column_radio_5: cartItems[i].products_column_radio_5 || "",
        };

        if (is_approve === 1) {
          updateData.cart_number = financialYearDetail?.order_no;
        }

        const cartItemUpdate = await CATItemModel.update(updateData, {
          where: { id: cartItems[i].id, cart_id: cart_id, isDelete: 0 },
        });

        const serialNumbers = cartItems[i].serial_numbers || [];

        // existing serial records
        const existingSerials = await CATSerialNumberModal.findAll({
          where: {
            cart_id: cart_id,
            cart_type: Number(update_cart.type),
            cart_item_id: cartItems[i].id,
            isDelete: 0,
          },
          order: [["id", "ASC"]],
          raw: true,
        });

        const existingSerialNumbers = existingSerials.map(
          (row) => row.serial_numbers
        );
        const incomingSerialNumbers = serialNumbers;

        // DB ma che pan frontend ma nathi
        const removeSerialIds = existingSerials
          .filter(
            (row) => !incomingSerialNumbers.includes(row.serial_numbers)
          )
          .map((row) => row.id);

        if (removeSerialIds.length > 0) {
          await CATSerialNumberModal.update(
            {
              isDelete: 1,
            },
            {
              where: {
                id: removeSerialIds,
              },
            }
          );
        }
        const newSerialPayload = [];

        serialNumbers.forEach((serial) => {
          if (!existingSerialNumbers.includes(serial)) {
            newSerialPayload.push({
              serial_numbers: serial,
              cart_type: Number(update_cart.type),
              cart_id: cart_id,
              cart_item_id: cartItems[i].id,
              product_id: cartItems[i].item_product_id,
              a_application_login_id: a_application_login_id,
              company_masters_id: findCompanyId.company_masters_id,
              created_date_time: formattedDateTime,
            });
          }
        });

        if (newSerialPayload.length > 0) {
          await CATSerialNumberModal.bulkCreate(newSerialPayload);
        }

        if (cartItemUpdate[0] == 0) {
          results += `Failed to update cart item with ID: ${cartItems[i].id}<br>`;
        } else {
          results += `Updated cart item with ID: ${cartItems[i].id}<br>`;
        }
      } else {
        createCartItemUpdate.push({
          ...cartItems[i],
          cart_id: cart_id,
          is_serial_num_product_item:
            cartItems[i].serial_numbers &&
              cartItems[i].serial_numbers.length > 0
              ? 1
              : 0,
          a_application_login_id: a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          created_date_time: formattedDateTime,
          cart_date: update_cart.cart_date,
          cart_type: Number(update_cart.type),
          stock_type: getStockType,
          cart_number: is_approve === 1 ? financialYearDetail?.order_no : "",
        });
      }
    }

    if (reference_cart_type_n == 1) { // Quotation to order
      await updateCartStatus(req, { type: type, target_id: cart_id, a_application_login_id });
    } else {
      await updateCartStatus(req, { type: reference_cart_type_n, target_id: reference_cart_id, a_application_login_id });
    }

    const ContactMaster = contactModel(req.tenantDB);
    if (is_approve === 1) {
      const updateUnread = await ContactMaster.update({
        is_read_by_a_application_login_id: a_application_login_id
      }, {
        where: {
          id: findCartData.dataValues.to_customer_id
        }
      });
    }

    let resultCartItem = [];
    if (createCartItemUpdate.length > 0) {
      resultCartItem = await CATItemModel.bulkCreate(createCartItemUpdate);
      results += `Created ${resultCartItem.length} new cart item(s)<br>`;
      if (resultCartItem.length > 0) {
        const serialPayload = [];

        resultCartItem.forEach((createdItem, index) => {
          const item = createCartItemUpdate[index];

          if (item.serial_numbers && item.serial_numbers.length > 0) {
            item.serial_numbers.forEach((serial) => {
              serialPayload.push({
                serial_numbers: serial,
                cart_type: Number(update_cart.type),
                cart_id: cart_id,
                cart_item_id: createdItem.id,
                product_id: item.item_product_id,
                a_application_login_id: a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                created_date_time: formattedDateTime,
              });
            });
          }
        });

        if (serialPayload.length > 0) {
          await CATSerialNumberModal.bulkCreate(serialPayload);
        }
      }
    }

    return resSuccess({
      ack_msg: "Updated Successfully",
      data: { item: results, resultCartItem, companyDetail: companyDetail },
    });
  } catch (error) {
    console.error("Error updating order:", error);
    return resBadRequest({
      developer_msg: error.message || "Internal server error",
    });
  }
};

export const orderDelete = async (req, res) => {
  const transaction = await req.tenantDB.transaction();
  try {
    const { cart_id, a_application_login_id, cart_type } = req.body;
    if (!cart_id || !a_application_login_id) {
      await transaction.rollback();
      return resBadRequest({
        developer_msg: "cart_id and a_application_login_id are required",
      });
    }

    // Log tenantDB details for debugging

    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const CBTMSGHistory = contactMessageHistory(req.tenantDB);
    const AccountTransctionModel = accountTransactionsModel(req.tenantDB);
    // Verify table existence
    const tableExists = await req.tenantDB.getQueryInterface().showAllTables();
    if (!tableExists.includes("carts")) {
      await transaction.rollback();
      return resError({
        developer_msg: "The 'carts' table does not exist in the database",
      });
    }

    // Fetch company data
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      await transaction.rollback();
      return resError({ developer_msg: "Company not found" });
    }

    // Fetch cart data
    const findCartData = await CATModel.findOne({
      where: { id: cart_id, isDelete: 0 },
      raw: true,
      transaction,
    });
    if (!findCartData) {
      await transaction.rollback();
      return resError({ developer_msg: "Cart not found or already deleted" });
    }

    // Soft delete cart
    const updateCartResult = await CATModel.update(
      { isDelete: 1 },
      {
        where: { id: cart_id, isDelete: 0 },
        transaction,
      }
    );

    if (updateCartResult[0] === 0) {
      await transaction.rollback();
      return resError({ developer_msg: "Cart not found or already deleted" });
    }

    // Soft delete cart items
    const updateCartItemResult = await CATItemModel.update(
      { isDelete: 1 },
      {
        where: { cart_id: cart_id, isDelete: 0 },
        transaction,
      }
    );

    // WHERE condition for account transaction deletion
    let accoutTrasctionDeleteWhere = {
      reference_id: cart_id,
      isDelete: 0,
      reference_table: "carts"
    };

    // *********************** NEW LOGIC ADDED HERE ***********************
    if ([3, 4, 6, 7].includes(Number(cart_type))) {
      await AccountTransctionModel.update(
        { isDelete: 1 },
        {
          where: accoutTrasctionDeleteWhere,
          transaction,
        }
      );
    }
    // ********************************************************************

    // Fetch usernames for message
    const usernameLiteral = async (login_id) => {
      const user = await loginModel.findOne({
        where: { id: login_id, isDelete: 0 },
        attributes: ["username"],
      });
      return user?.username || "Unknown";
    };

    const username = await usernameLiteral(
      findCartData.a_application_login_id
    );
    const approveBy = await usernameLiteral(a_application_login_id);
    const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    // Create message after successful deletion
    const cartToMsgBody = {
      contact_masters_id: findCartData.to_customer_id,
      a_application_login_id: a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      msg_cart_id: findCartData.id,
      description: `
    <b>${orderTypesShowList?.find(
        (option) =>
          Number(option.id) === Number(findCartData?.type)
      )?.type || "Unknown"
        }</b><br>
    ${findCartData.cart_number
          ? `#${findCartData.cart_number}`
          : "#XXXXXXXX"
        }<br>
    <b>${findCartData.grand_total && findCartData.type != 9 && findCartData.type != 8
          ? `${findCartData.grand_total} ${symbolCurrency || ""}`
          : ""
        }</b><br>
   
    <p><b>Created By:</b> ${username} (${formatDateAndTimeCreateDateTime(
          findCartData.created_date_time
        )})</p>
    <p><b>Deleted By:</b> ${approveBy} (${formatDateAndTimeCreateDateTime(
          formattedDateTime
        )})</p>
  `,
      created_date_time: formattedDateTime,
      message_side: 1,
      message_type_id: 2,
      application_login_name: username,
    };

    const contactToMessage = await CBTMSGHistory.create(cartToMsgBody, {
      transaction,
    });

    await transaction.commit();

    // Update Status 
    if (findCartData.referance_cart_id && findCartData.reference_type) {
      await updateCartStatus(req, { target_id: findCartData.referance_cart_id, type: findCartData.reference_type, a_application_login_id })
    }

    return resSuccess({ data: { item: updateCartItemResult[0] } });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting order:", error);
    return resBadRequest({ developer_msg: error.message });
  }
  ;

};

export const orderTotal = async (req) => {
  try {
    let { a_application_login_id, contact_master_id } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const CATModel = cartModel(req.tenantDB);

    let whereClause = {
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { company_masters_id: findCompanyId.company_masters_id },
      ],
      isDelete: "0",
    };

    if (contact_master_id) {
      whereClause = {
        [Op.or]: [
          { a_application_login_id: a_application_login_id },
          { company_masters_id: findCompanyId.company_masters_id },
        ],
        isDelete: "0",
        to_customer_id: contact_master_id,
      };
    } else {
    }
    const totalQuotation = await CATModel.count({
      where: {
        ...whereClause,
        type: 1, // Type for Quotation
      },
    });
    const totalOrder = await CATModel.count({
      where: {
        ...whereClause,
        type: 2, // Type for Order
      },
    });
    const totalInvoice = await CATModel.count({
      where: {
        ...whereClause,
        type: 3, // Type for Invoice
      },
    });
    if (totalQuotation || totalOrder || totalInvoice) {
      return resSuccess({
        data: {
          item: { totalQuotation, totalOrder, totalInvoice },
        },
      });
    } else {
      return resError({
        ack_msg: "No cart",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    console.log("eeeeeee", e);

    return resBadRequest({ developer_msg: `error ${e}` });
    throw e;
  }
};

export const covertOrderSystem = async (req, res) => {
  const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
  const formattedDate = moment(new Date()).format("YYYY-MM-DD");

  try {
    const {
      cart_type,
      cart_id,
      is_approve,
      request_flag,
      reference_cart_number,
      a_application_login_id,
      multiConvert // 1=> true 2=> False
    } = req.body;

    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const CATSerialNumberModal = cartSerialNumberModel(req.tenantDB);
    const firstCartId = Array.isArray(cart_id) ? cart_id[0] : cart_id;

    //------------------------------------------------//
    const checkCart = await CATModel.findOne({
      where: { id: firstCartId, isDelete: 0 },
      attributes: ['type']
    });
    //------------------------------------------------//


    let remainingQtyByProduct = [];

    // Check if converting from Order (type 2) to Dispatch (type 9)
    if (
      checkCart &&
      (
        (checkCart.type === 2 && cart_type === 9) ||
        (checkCart.type === 2 && cart_type === 3) ||
        // (checkCart.type === 12 && cart_type === 3) ||
        (checkCart.type === 5 && cart_type === 8) ||
        (checkCart.type === 5 && cart_type === 4)
      )
    ) {

      const getOrderQty = await CATItemModel.findAll({
        where: {
          cart_id: firstCartId,
          isDelete: 0,
        },
        attributes: ["item_product_id", "item_qty", "product_inner_qty", "product_outer_qty", "item_inner_quantity", "item_outer_quantity", "item_loose_quantity"],
        raw: true
      });

      const getRefranseDispatchQty = await CATItemModel.findAll({
        where: {
          referance_cart_id: firstCartId,
          isDelete: 0
        },
        attributes: ["item_product_id", "item_qty"],
        raw: true
      });

      remainingQtyByProduct = getOrderQty.map(orderItem => {
        const productId = orderItem.item_product_id;
        const originalQty = parseFloat(orderItem.item_qty || 0);

        const dispatchedQty = getRefranseDispatchQty
          .filter(dispatchItem => dispatchItem.item_product_id === productId)
          .reduce((sum, item) => sum + parseFloat(item.item_qty || 0), 0);

        const remainingQty = originalQty - dispatchedQty;

        return {
          product_id: productId,
          original_Qty: originalQty,
          remaining_Qty: remainingQty
        };
      });

      // Check if all products are fully dispatched
      const allFullyDispatched = remainingQtyByProduct.every(item => item.remaining_Qty <= 0);

      if (allFullyDispatched) {
        return resError({
          ack_msg: "Order is already fully dispatched. No remaining quantity to dispatch.",
          developer_msg: "All products in this order have been fully dispatched"
        });
      }
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const checkQtyClassification = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id },
      raw: true,
      attributes: ["order_qty_unit"]
    });
    const companyFlag = findCompanyId.company_flag;

    // Handle multiple cart conversion
    if (multiConvert === 1 && Array.isArray(cart_id) && cart_id.length > 0) {

      const findCarts = await CATModel.findAll({
        where: { id: cart_id, isDelete: 0 },
      });

      if (!findCarts || findCarts.length === 0) {
        return resError({
          ack_msg: "No carts found",
          developer_msg: "cart IDs are not found or Deleted",
        });
      }

      const baseCart = findCarts[0].dataValues;
      const {
        id,
        created_date_time,
        cart_number,
        sr_by_number,
        cart_status,
        cart_date,
        type,
        gst_amt,
        ...restAllCart
      } = baseCart;

      let financialYearDetail;

      const allCartItems = await CATItemModel.findAll({
        where: { cart_id: cart_id, isDelete: 0 },
      });
      let
        mergedCartItems = allCartItems.map((item) => {
          const { id, cart_id, created_date_time, ...rest } = item.dataValues;

          return {
            ...rest,
            old_cart_item_id: id,
          };
        });

      // Initialize cart totals
      let calculatedTaxableAmt = 0;
      let calculatedGstAmt = 0;
      let calculatedTcsAmt = 0;
      let calculatedGrandTotal = 0;

      // Filter items based on remaining quantity for dispatch conversion
      if (
        (checkCart && remainingQtyByProduct.length > 0) &&
        (
          (checkCart.type === 2 && cart_type === 9) ||
          (checkCart.type === 2 && cart_type === 3) ||
          (checkCart.type === 12 && cart_type === 3) ||
          (checkCart.type === 5 && cart_type === 8) ||
          (checkCart.type === 5 && cart_type === 4)
        )
      ) {

        mergedCartItems = mergedCartItems
          .map(item => {
            const remainingProduct = remainingQtyByProduct.find(
              rp => rp.product_id === item.item_product_id
            );

            if (remainingProduct && remainingProduct.remaining_Qty > 0) {
              const newQty = remainingProduct.remaining_Qty;
              const itemRate = parseFloat(item.item_rate || 0);
              const itemNetRate = parseFloat(item.item_net_rate || 0);
              const discountPct = parseFloat(item.item_discount_pct || 0);
              const discountAmountPerItem = parseFloat(item.item_discount_pr || 0);
              const productInnerQty = item.product_inner_qty;
              const productOuterQty = item.product_outer_qty;
              /* Calculate Innner Outer */
              const packQty = calculatePackQty({
                newQuantity: newQty,
                product_inner_qty: productInnerQty,
                product_outer_qty: productOuterQty,
                isOrderClassification: checkQtyClassification.order_qty_unit
              });

              const newInnerQty = packQty.innerQty;
              const newOuterQty = packQty.outerQty;
              // const newLooseQty = packQty.looseQty;
              // console.log("newInnerQty", newInnerQty);
              // console.log("newOuterQty", newOuterQty);
              // console.log("newLooseQty", newLooseQty);
              // Calculate item_total = (item_net_rate * item_qty) - discount
              const totalDiscount =
                discountAmountPerItem > 0
                  ? discountAmountPerItem * newQty
                  : (itemRate * newQty * discountPct) / 100;
              const itemTotal = (itemRate * newQty) - totalDiscount;

              // ✅ GST
              const discountedAmount = (itemRate * newQty) - totalDiscount;

              const gstContribution =
                gst_amt > 0
                  ? (discountedAmount * (parseFloat(item.item_gst || 0))) / 100
                  : 0;

              // add totals
              calculatedTaxableAmt += itemTotal;
              calculatedGstAmt += gstContribution;

              return {
                ...item,
                item_qty: newQty,
                item_inner_quantity: newInnerQty,
                item_outer_quantity: newOuterQty,
                item_loose_quantity: newLooseQty,
                item_total: itemTotal
              };
            }
            return null;
          })
          .filter(item => item !== null);

        if (mergedCartItems.length === 0) {
          return resError({
            ack_msg: "No items available for dispatch",
            developer_msg: "All items have been fully dispatched"
          });
        }

        const packingCharge = parseFloat(baseCart.packing_forwarding_charge || 0);
        const transportCharge = parseFloat(baseCart.transport_charge || 0);
        const grossTaxable = calculatedTaxableAmt + packingCharge + transportCharge;

        const cashDiscount = parseFloat(baseCart.cash_discount || 0);
        const cashDiscountType = parseInt(baseCart.cash_discount_type || 1);
        let cashDiscountAmount = 0;
        let discountRatio = 0;
        if (cashDiscount > 0 && grossTaxable > 0) {
          if (cashDiscountType === 1) {
            cashDiscountAmount = (grossTaxable * cashDiscount) / 100;
            discountRatio = Math.min(cashDiscount / 100, 1);
          } else {
            cashDiscountAmount = Math.min(cashDiscount, grossTaxable);
            discountRatio = Math.min(cashDiscount / grossTaxable, 1);
          }
        }

        const packingGst = packingCharge * (PACKING_FORWARDING_CHARGE_GST / 100);
        const transportGst = transportCharge * (TRANSPORT_CHARGE__GST / 100);
        const baseGst = (parseFloat(baseCart.gst_amt || 0) > 0 || gst_amt > 0)
          ? (calculatedGstAmt + packingGst + transportGst)
          : 0;
        const finalGst = baseGst * (1 - discountRatio);
        const finalTaxable = Math.max(0, grossTaxable - cashDiscountAmount);
        const tcsRate = parseFloat(baseCart.tcs_percentage || 0) / 100;
        const hasTcs = parseFloat(baseCart.tcs_amt || 0) > 0;
        const finalTcs = hasTcs ? (finalTaxable + finalGst) * tcsRate : 0;

        calculatedTaxableAmt = finalTaxable;
        calculatedGstAmt = finalGst;
        calculatedTcsAmt = finalTcs;
        calculatedGrandTotal = finalTaxable + finalGst + finalTcs;
      } else {
        // Normal multi-cart merge without remaining qty logic
        let mergedTaxableAmt = 0;
        let mergedGstAmt = 0;
        let mergedTcsAmt = 0;

        findCarts.forEach(cart => {
          mergedTaxableAmt += parseFloat(cart.dataValues.taxable_amt || 0);
          mergedGstAmt += parseFloat(cart.dataValues.gst_amt || 0);
          mergedTcsAmt += parseFloat(cart.dataValues.tcs_amt || 0);
        });

        calculatedTaxableAmt = mergedTaxableAmt;
        calculatedGstAmt = mergedGstAmt;
        calculatedGrandTotal = mergedTaxableAmt + mergedGstAmt + mergedTcsAmt;
      }

      // Round off grand total
      const roundedGrandTotal = Math.round(calculatedGrandTotal);
      const roundOffValue = roundedGrandTotal - calculatedGrandTotal;

      const referenceCartNames = Array.isArray(reference_cart_number)
        ? reference_cart_number.join(', ')
        : reference_cart_number;

      const referenceCartIds = cart_id.join(',');

      const cartBody = {
        ...restAllCart,
        cart_number: financialYearDetail?.order_no || "",
        sr_by_number: financialYearDetail?.sr_by_no || 0,
        sr_by_prifix: financialYearDetail?.sr_by_prifix || "cart",
        type: cart_type,
        created_date_time: formattedDateTime,
        cart_date: formattedDate,
        referance_cart_id: referenceCartIds,
        referance_cart_name: referenceCartNames,
        update_Date_time: "",
        //------------------------------------------------//
        reference_type: checkCart.type,
        //------------------------------------------------//

        advance_payment: 0,
        taxable_amt: calculatedTaxableAmt,
        gst_amt: calculatedGstAmt,
        tcs_amt: calculatedTcsAmt,
        grand_total: roundedGrandTotal,
        round_off: roundOffValue,
        stock_type: 0,
        miracle_account_legder: "",
        miracle_account_ledger_adv: "",
        miracle_UniqueId: "",
        miracle_update_date_time: null,
        due_date: null
      };
      const resultCart = await CATModel.create(cartBody);

      if (resultCart) {
        const cartId = resultCart.dataValues.id;

        const cartItemsBody = mergedCartItems.map((item) => {
          const { old_cart_item_id, ...rest } = item;

          return {
            ...rest,
            old_cart_item_id,
            cart_id: cartId,
            created_date_time: formattedDateTime,
            cart_date: formattedDate,
            referance_cart_id: referenceCartIds,
            referance_cart_name: referenceCartNames,
            stock_type: 0,
            reference_type: checkCart.type,
          };
        });

        const resultCartItem = await CATItemModel.bulkCreate(cartItemsBody);

        if (resultCartItem) {
          const oldSerialNumbers = await CATSerialNumberModal.findAll({
            where: {
              cart_id: cart_id,        // source cart ids
              isDelete: 0,
            },
            raw: true,
          });

          if (oldSerialNumbers.length > 0) {
            const serialPayload = [];

            resultCartItem.forEach((newItem, index) => {

              const sourceItem = mergedCartItems[index];

              const matchedSerials = oldSerialNumbers.filter(
                sn => sn.cart_item_id == sourceItem.old_cart_item_id
              );

              matchedSerials.forEach((serialRow) => {

                serialPayload.push({
                  serial_numbers: serialRow.serial_numbers,
                  cart_type: cart_type,
                  cart_id: cartId,
                  cart_item_id: newItem.id,
                  product_id: serialRow.product_id,
                  sn_reference_cart_id: referenceCartIds,
                  sn_reference_type: checkCart.type,
                  a_application_login_id: a_application_login_id,
                  company_masters_id: findCompanyId.company_masters_id,
                  created_date_time: formattedDateTime,
                });

              });

            });

            if (serialPayload.length > 0) {
              await CATSerialNumberModal.bulkCreate(serialPayload);
            }
          }

          if (request_flag === 1) {
            return resSuccess({
              data: { item: resultCart.dataValues.id },
              ack_msg: `Successfully converted ${cart_id.length} carts into one. Go to list and check now.`,
            });
          } else {
            return resSuccess({
              data: { item: resultCart.dataValues.id },
              ack_msg: `Successfully merged ${cart_id.length} carts into new copy`,
            });
          }
        } else {
          return resError({
            ack_msg: "",
            developer_msg: "not Add Data cartItem ",
          });
        }
      } else {
        return resError({ ack_msg: "", developer_msg: "not Add Data cart" });
      }
    }

    // Original single cart conversion logic
    const singleCartId = Array.isArray(cart_id) ? cart_id[0] : cart_id;
    const findCart = await CATModel.findOne({
      where: { id: singleCartId, isDelete: 0 },
    });

    if (findCart) {
      const {
        id,
        created_date_time,
        cart_number,
        sr_by_number,
        cart_status,
        cart_date,
        gst_amt,
        type,
        ...restAllCart
      } = findCart.dataValues;

      let financialYearDetail;

      const findCartItem = await CATItemModel.findAll({
        where: { cart_id: findCart.dataValues.id, isDelete: 0 },
      });

      let cartItems = findCartItem.map((item) => {
        const { id, cart_id, created_date_time, ...rest } = item.dataValues;

        return {
          ...rest,
          old_cart_item_id: id,
        };
      });

      // Initialize cart totals
      let calculatedTaxableAmt = 0;
      let calculatedGstAmt = 0;
      let calculatedTcsAmt = 0;
      let calculatedGrandTotal = 0;

      // Filter and update items based on remaining quantity for dispatch conversion
      if ((checkCart && remainingQtyByProduct.length > 0) &&
        (
          (checkCart.type === 2 && cart_type === 9) ||
          (checkCart.type === 2 && cart_type === 3) ||
          (checkCart.type === 12 && cart_type === 3) ||
          (checkCart.type === 5 && cart_type === 8) ||
          (checkCart.type === 5 && cart_type === 4)
        )
      ) {
        cartItems = cartItems
          .map(item => {
            const remainingProduct = remainingQtyByProduct.find(
              rp => rp.product_id === item.item_product_id
            );

            if (remainingProduct && remainingProduct.remaining_Qty > 0) {
              const newQty = remainingProduct.remaining_Qty;
              // const newInnerQty = remainingProduct.item_inner_quantity;
              // const newOuterQty = remainingProduct.item_outer_quantity;
              // const newLooseQty = remainingProduct.item_loose_quantity;
              const productInnerQty = item.product_inner_qty;
              const productOuterQty = item.product_outer_qty;
              /* Calculate Innner Outer */
              const packQty = calculatePackQty({
                newQuantity: newQty,
                product_inner_qty: productInnerQty,
                product_outer_qty: productOuterQty,
                isOrderClassification: checkQtyClassification.order_qty_unit
              });

              const newInnerQty = packQty.innerQty;
              const newOuterQty = packQty.outerQty;
              const newLooseQty = packQty.looseQty;


              /* Calculate Innner Outer */
              const itemRate = parseFloat(item.item_rate || 0);
              const itemNetRate = parseFloat(item.item_net_rate || 0);
              const discountPct = parseFloat(item.item_discount_pct || 0);
              const discountAmountPerItem = parseFloat(item.item_discount_pr || 0);
              // Calculate item_total = (item_net_rate * item_qty) - discount
              const totalDiscount =
                discountAmountPerItem > 0
                  ? discountAmountPerItem * newQty
                  : (itemRate * newQty * discountPct) / 100;
              const itemTotal = (itemRate * newQty) - totalDiscount;

              // GST
              const discountedAmount = (itemRate * newQty) - totalDiscount;

              const gstContribution =
                gst_amt > 0
                  ? (discountedAmount * (parseFloat(item.item_gst || 0))) / 100
                  : 0;

              // add totals
              calculatedTaxableAmt += itemTotal;
              calculatedGstAmt += gstContribution;

              return {
                ...item,
                item_qty: newQty,
                item_inner_quantity: newInnerQty,
                item_outer_quantity: newOuterQty,
                item_loose_quantity: newLooseQty,
                item_total: itemTotal
              };
            }
            return null;
          })
          .filter(item => item !== null);

        if (cartItems.length === 0) {
          return resError({
            ack_msg: "No items available for dispatch",
            developer_msg: "All items have been fully dispatched"
          });
        }

        const packingCharge = parseFloat(findCart.dataValues.packing_forwarding_charge || 0);
        const transportCharge = parseFloat(findCart.dataValues.transport_charge || 0);
        const grossTaxable = calculatedTaxableAmt + packingCharge + transportCharge;

        const cashDiscount = parseFloat(findCart.dataValues.cash_discount || 0);
        const cashDiscountType = parseInt(findCart.dataValues.cash_discount_type || 1);
        let cashDiscountAmount = 0;
        let discountRatio = 0;
        if (cashDiscount > 0 && grossTaxable > 0) {
          if (cashDiscountType === 1) {
            cashDiscountAmount = (grossTaxable * cashDiscount) / 100;
            discountRatio = Math.min(cashDiscount / 100, 1);
          } else {
            cashDiscountAmount = Math.min(cashDiscount, grossTaxable);
            discountRatio = Math.min(cashDiscount / grossTaxable, 1);
          }
        }

        const packingGst = packingCharge * (PACKING_FORWARDING_CHARGE_GST / 100);
        const transportGst = transportCharge * (TRANSPORT_CHARGE__GST / 100);
        const baseGst = (parseFloat(findCart.dataValues.gst_amt || 0) > 0 || gst_amt > 0)
          ? (calculatedGstAmt + packingGst + transportGst)
          : 0;
        const finalGst = baseGst * (1 - discountRatio);
        const finalTaxable = Math.max(0, grossTaxable - cashDiscountAmount);
        const tcsRate = parseFloat(findCart.dataValues.tcs_percentage || 0) / 100;
        const hasTcs = parseFloat(findCart.dataValues.tcs_amt || 0) > 0;
        const finalTcs = hasTcs ? (finalTaxable + finalGst) * tcsRate : 0;

        calculatedTaxableAmt = finalTaxable;
        calculatedGstAmt = finalGst;
        calculatedTcsAmt = finalTcs;
        calculatedGrandTotal = finalTaxable + finalGst + finalTcs;
      } else {
        // Normal single cart conversion - use existing values
        calculatedTaxableAmt = parseFloat(findCart.dataValues.taxable_amt || 0);
        calculatedGstAmt = parseFloat(findCart.dataValues.gst_amt || 0);
        calculatedTcsAmt = parseFloat(findCart.dataValues.tcs_amt || 0);
        calculatedGrandTotal = calculatedTaxableAmt + calculatedGstAmt + calculatedTcsAmt;
      }

      // Round off grand total
      const roundedGrandTotal = Math.round(calculatedGrandTotal);
      const roundOffValue = roundedGrandTotal - calculatedGrandTotal;

      const cartBody = {
        ...restAllCart,
        cart_number: financialYearDetail?.order_no || "",
        sr_by_number: financialYearDetail?.sr_by_no || 0,
        sr_by_prifix: financialYearDetail?.sr_by_prifix || "cart",
        type: cart_type,
        created_date_time: formattedDateTime,
        cart_date: formattedDate,
        referance_cart_id: singleCartId,
        referance_cart_name: reference_cart_number,
        reference_type: checkCart.type,
        advance_payment: 0,
        taxable_amt: calculatedTaxableAmt,
        gst_amt: calculatedGstAmt,
        tcs_amt: calculatedTcsAmt,
        grand_total: roundedGrandTotal,
        round_off: roundOffValue,
        stock_type: 0,
        update_Date_time: "",
        miracle_account_legder: "",
        miracle_account_ledger_adv: "",
        miracle_UniqueId: "",
        miracle_update_date_time: null,
        due_date: null
      };

      const resultCart = await CATModel.create(cartBody);

      if (resultCart) {
        const cartId = resultCart.dataValues.id;

        const cartItemsBody = cartItems.map((item) => {
          const { old_cart_item_id, ...rest } = item;

          return {
            ...rest,
            old_cart_item_id,
            cart_id: cartId,
            created_date_time: formattedDateTime,
            cart_date: formattedDate,
            referance_cart_id: singleCartId,
            referance_cart_name: reference_cart_number,
            reference_type: checkCart.type,
            stock_type: 0,
          };
        });

        const resultCartItem = await CATItemModel.bulkCreate(cartItemsBody);

        if (resultCartItem) {


          const oldCartItemIds = findCartItem.map((item) => item.id);

          const oldSerialNumbers = await CATSerialNumberModal.findAll({
            where: {
              cart_id: singleCartId,
              isDelete: 0,
            },
            raw: true,
          });
          console.log("oldSerialNumbersoldSerialNumbers", oldSerialNumbers);

          if (oldSerialNumbers.length > 0) {
            const serialPayload = [];

            resultCartItem.forEach((newItem, index) => {

              const sourceItem = cartItems[index];

              const matchedSerials = oldSerialNumbers.filter(
                sn => sn.cart_item_id == sourceItem.old_cart_item_id
              );

              matchedSerials.forEach((serialRow) => {

                serialPayload.push({
                  serial_numbers: serialRow.serial_numbers,
                  cart_type: cart_type,
                  cart_id: cartId,
                  cart_item_id: newItem.id,
                  product_id: serialRow.product_id,
                  sn_reference_cart_id: singleCartId,
                  sn_reference_type: checkCart.type,
                  a_application_login_id: a_application_login_id,
                  company_masters_id: findCompanyId.company_masters_id,
                  created_date_time: formattedDateTime,
                });

              });

            });

            if (serialPayload.length > 0) {
              await CATSerialNumberModal.bulkCreate(serialPayload);
            }
          }
          // return
          if (request_flag === 1) {
            return resSuccess({
              data: { item: resultCart.dataValues.id },
              ack_msg: `Successfully converted. Go to list and check now.`,
            });
          } else {
            return resSuccess({
              data: { item: resultCart.dataValues.id },
              ack_msg: "New Copy Created Successfully",
            });
          }
        } else {
          return resError({
            ack_msg: "",
            developer_msg: "not Add Data cartItem ",
          });
        }
      } else {
        return resError({ ack_msg: "", developer_msg: "not Add Data cart" });
      }
    } else {
      return resError({
        ack_msg: "Cart is not found",
        developer_msg: "cart Id is not there or Deleted",
      });
    }
  } catch (error) {
    console.error("Error creating order:", error);
    return resBadRequest({ developer_msg: error });
  }
};
export const pdfOrder = async (req, res) => {
  try {
    const orderId = req.body.cart_id;
    const CATModel = cartModel(req.tenantDB);
    const CATItemModel = cartItemModel(req.tenantDB);
    const customModel = customFieldFormModel(req.tenantDB);
    const productModels = productModel(req.tenantDB);
    const CATSerialNumberModal = cartSerialNumberModel(req.tenantDB);

    // Cart details
    const resultCartById = await CATModel.findOne({
      where: { id: orderId, isDelete: 0 },
    });

    if (!resultCartById) {
      return resError({
        ack_msg: "Order not found.",
        developer_msg: "No cart found with the provided order ID.",
      });
    }

    // Cart Items details
    const resultAllCartItems = await CATItemModel.findAll({
      where: { cart_id: resultCartById.dataValues.id, isDelete: 0 },
      raw: true,
    });
    const resultAllCartSerialNumbers = await CATSerialNumberModal.findAll({
      where: { cart_id: resultCartById.dataValues.id, isDelete: 0 },
      raw: true,
    });

    const cartvsAttachmentModels = cartvsattachmentmodel(req.tenantDB);

    const attachmentData = await cartvsAttachmentModels.findAll({
      where: {
        cart_id: resultCartById.dataValues.id,
        isDelete: 0
      },
      order: [["display_order", "ASC"]],
    });

    // Separate attachments based on display_order
    const beforeAttachments = attachmentData.filter(att => att.dataValues.display_order < 0);
    const afterAttachments = attachmentData.filter(att => att.dataValues.display_order > 0);

    const productIds = resultAllCartItems.map(item => item.item_product_id);

    const products = await productModels.findAll({
      where: {
        id: productIds,
        isDelete: 0,
      },
      attributes: ["id", "product_img"],
      raw: true,
    });

    const productMap = {};
    products.forEach(p => {
      productMap[p.id] = {
        ...p,
        product_img: p.product_img
          ? PRODUCT_IMG_LINK_EXTENDED + p.product_img
          : null
      };
    });

    const finalData = resultAllCartItems.map(item => {

      // item wise serial numbers get code
      const itemSerialNumbers = resultAllCartSerialNumbers
        .filter(
          serial => serial.cart_item_id == item.id
        )
        .map(
          serial => serial.serial_numbers
        );

      return {
        ...item,
        product: productMap[item.item_product_id] || null,
        serial_numbers: itemSerialNumbers
      };
    });

    let a_application_login_id =
      resultCartById.dataValues.a_application_login_id;

    const companyDetail = await getCompanyDetailByLoginId(
      a_application_login_id
    );

    // Currency details
    const currencyDetails = await currencyModel.findAll({
      where: {
        isDelete: 0,
        id: resultCartById.dataValues.currency_id,
      },
    });

    // Custom form field details
    const customFieldsWhere = {
      isDelete: 0,
      company_masters_id: companyDetail.id,
      print_or_not: 1,
    };

    // Product Custom form Field
    let productFiled = await customModel.findAll({
      where: {
        isDelete: 0,
        company_masters_id: companyDetail.id,
        print_or_not: 1,
        form_type: 4,
      },
      attributes: [
        "id",
        "title",
        "reference_column_name",
        "data_type",
        "display_order",
        "product_feild_row_column",
        "applicable_modules"
      ],
      order: [["display_order", "ASC"]],
    });

    // Check cart_type of all items and set form_type accordingly
    const cartType = resultAllCartItems[0]?.cart_type;
    let dynamicPrintView;
    if (resultAllCartItems.length > 0 && cartType) {
      const allCartItemsSameType = resultAllCartItems.every(
        (item) => item.cart_type === cartType
      );
      if (allCartItemsSameType) {
        if (cartType == 1) {
          customFieldsWhere.form_type = 5;
          dynamicPrintView = companyDetail.quotation_view_formate;
        } else if (cartType == 2) {
          customFieldsWhere.form_type = 6;
          dynamicPrintView = companyDetail.order_view_formate;
        } else if (cartType == 3) {
          customFieldsWhere.form_type = 7;
          dynamicPrintView = companyDetail.invoice_view_formate;
        } else if (cartType == 4) {
          customFieldsWhere.form_type = 8;
          dynamicPrintView = companyDetail.purchase_view_formate;
        } else if (cartType == 5) {
          customFieldsWhere.form_type = 9;
          dynamicPrintView = companyDetail.purchase_order_view_formate;
        } else if (cartType == 6) {
          customFieldsWhere.form_type = 10;
          dynamicPrintView = companyDetail.return_sales_invoice_view_formate;
        } else if (cartType == 7) {
          customFieldsWhere.form_type = 11;
          dynamicPrintView = companyDetail.return_purchase_invoice_view_formate;
        } else if (cartType == 8) {
          customFieldsWhere.form_type = 12;
          dynamicPrintView = companyDetail.inward_view_formate;
        } else if (cartType == 9) {
          customFieldsWhere.form_type = 13;
          dynamicPrintView = companyDetail.dispatch_view_formate;
        } else if (cartType == 12) {
          customFieldsWhere.form_type = 16;
          dynamicPrintView = companyDetail.proforma_invoice_view_formate;
        }
      }
    }

    if (customFieldsWhere.form_type) {
      productFiled = productFiled.filter(f => {
        if (!f.applicable_modules) return true;
        const mods = String(f.applicable_modules).split(",").map(m => m.trim());
        return mods.includes(String(customFieldsWhere.form_type));
      });
    }

    const CartCustomFields = await customModel.findAll({
      where: customFieldsWhere,
      order: [["display_order", "ASC"]],
    });

    // Create product custom fields
    const productCustomFields = resultAllCartItems.map((item) => {
      const fields = {};
      productFiled.forEach((field) => {
        const columnName = field.reference_column_name;
        if (columnName && item[columnName] !== undefined) {
          fields[field.title] = item[columnName];
          fields[field.title + "_product_feild_row_column"] = field.product_feild_row_column;
        }
      });
      return fields;
    });

    const cartCustomFields = {};

    CartCustomFields.forEach((field) => {
      const columnName = field.reference_column_name;
      const d_order = field.display_order;
      const data_type = field.data_type;

      const customFieldKey = `${data_type}_${d_order}=${field.title}`;

      const valueFromDataValues = resultCartById.dataValues[d_order];

      if (valueFromDataValues !== undefined) {
        cartCustomFields[customFieldKey] = valueFromDataValues;
      }

      if (columnName && resultCartById.dataValues[columnName] !== undefined) {
        cartCustomFields[`${data_type}_${d_order}=${field.title}`] =
          resultCartById.dataValues[columnName];
      }
    });

    // Update company detail image paths
    if (companyDetail) {
      companyDetail.header_img = companyDetail.header_img
        ? "../../media-folder/company_image/" + companyDetail.header_img
        : "";
      companyDetail.footer_img = companyDetail.footer_img
        ? "../../media-folder/company_image/" + companyDetail.footer_img
        : "";
      companyDetail.company_sign = companyDetail.company_sign
        ? "../../media-folder/company_image/" + companyDetail.company_sign
        : "";
      companyDetail.company_logo = companyDetail.company_logo
        ? "../../media-folder/company_image/" + companyDetail.company_logo
        : "";
    }

    const stateModels = stateModel(req.tenantDB);
    const cityModels = cityModel(req.tenantDB);

    // Only use cart state_id
    const stateIdToUse = resultCartById.dataValues.state_id;

    // Get State Name
    let customerStateName = "";

    if (stateIdToUse > 0) {
      const stateNameCustomer = await stateModels.findOne({
        where: {
          isDelete: 0,
          id: stateIdToUse,
        },
        attributes: ["state_name"],
      });

      customerStateName = stateNameCustomer
        ? stateNameCustomer.state_name
        : "";
    }

    // Only use cart city_id
    const cityIdToUse = resultCartById.dataValues.city_id;

    // Get City Name
    let customerCityName = "";

    if (cityIdToUse > 0) {
      const cityNameCustomer = await cityModels.findOne({
        where: {
          isDelete: 0,
          id: cityIdToUse,
        },
        attributes: ["city_name"],
      });

      customerCityName = cityNameCustomer
        ? cityNameCustomer.city_name
        : "";
    }


    // State_id to name for company
    const stateNameCompany = await stateModels.findAll({
      where: {
        isDelete: 0,
        id: companyDetail.state_id,
      },
      attributes: ["state_name"],
    });

    const companyStateName =
      stateNameCompany.length > 0 ? stateNameCompany[0].state_name : "";

    // Login details
    const loginDetail = await getLoginDetailById(
      resultCartById.dataValues.a_application_login_id
    );

    // PDF view
    if (orderId) {
      const uploadDir = path.resolve(
        __dirnameConstant,
        `../../media-folder/cart/${companyDetail.id.toString()}`
      );

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // EJS file
      const htmlTemplate = fs.readFileSync(
        path.join(
          __dirnameConstant,
          `../views/carts/order-pdf/orderPdfV${dynamicPrintView}.ejs`
        ),
        "utf-8"
      );

      // Convert image to Base64 — mime sniffed from the real file bytes,
      // not hardcoded to png. Was fine for the EJS/<img> path (browsers
      // render most formats even with a wrong-labeled data URI), but
      // pdfme's own image plugin (used for the §5 pdfme-enabled path's
      // header/logo/footer/signature images AND the watermark overlay,
      // both built from this same encoder) trusts the label to pick
      // pdf-lib's embedPng vs embedJpg — a real JPEG mislabeled as PNG
      // throws "The input is not a PNG file!" and takes down the whole
      // generate, not just that one image.
      const encodeImageToBase64 = (filePath) => {
        try {
          const image = fs.readFileSync(filePath);
          const mime = sniffImageMime(image) || "image/png";
          return `data:${mime};base64,${image.toString("base64")}`;
        } catch (err) {
          console.error("Error reading image:", err);
          return "";
        }
      };

      const headerImage = encodeImageToBase64(
        path.join(__dirnameConstant, companyDetail.header_img)
      );
      const footerImage = encodeImageToBase64(
        path.join(__dirnameConstant, companyDetail.footer_img)
      );
      const signImage = encodeImageToBase64(
        path.join(__dirnameConstant, companyDetail.company_sign)
      );
      const logoImage = encodeImageToBase64(
        path.join(__dirnameConstant, companyDetail.company_logo)
      );

      const orderTypesListPdf = [
        { id: "1", type: "Quotation" },
        { id: "2", type: "Order" },
        { id: "3", type: "Invoice" },
        { id: "4", type: "Purchase" },
        { id: "5", type: "Purchase Order" },
        { id: "6", type: "Return Sales Invoice" },
        { id: "7", type: "Return Purchase Invoice" },
        { id: "8", type: "Inward" },
        { id: "9", type: "Dispatch" },
        { id: "12", type: "Proforma Invoice" },
      ];

      const selectedCurrency = currencyDetails[0]?.short_name || "INR";
      const finalCurrency = selectedCurrency === "INR" ? "INR" : "USD";

      const numberTowords = numberToWordsCurrency(
        resultCartById.dataValues.grand_total ?? 0,
        finalCurrency
      );
      const gstnumberTowords = numberToWordsCurrency(
        resultCartById.dataValues.gst_amt ?? 0,
        finalCurrency
      );

      const currencySymbol = currencyDetails[0]?.symbol || "₹";

      let viewFormate = 1;
      let viewTitle = "";
      let dynamicColor = "";

      if (resultCartById.dataValues.type == 1) {
        viewFormate = companyDetail.quotation_view_formate || 1;
        viewTitle = companyDetail.quotation_title || "Quotation";
        dynamicColor = companyDetail.quotation_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 2) {
        viewFormate = companyDetail.order_view_formate || 1;
        viewTitle = companyDetail.order_title || "Sales Order";
        dynamicColor = companyDetail.order_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 3) {
        viewFormate = companyDetail.invoice_view_formate || 1;
        viewTitle = companyDetail.invoice_title || "Sales Invoice";
        dynamicColor = companyDetail.invoice_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 4) {
        viewFormate = companyDetail.purchase_view_formate || 1;
        viewTitle = companyDetail.purchase_title || "Purchase Invoice";
        dynamicColor = companyDetail.purchase_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 5) {
        viewFormate = companyDetail.purchase_order_view_formate || 1;
        viewTitle = companyDetail.purchase_order_title || "Purchase Order";
        dynamicColor = companyDetail.purchase_order_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 6) {
        viewFormate = companyDetail.return_sales_invoice_view_formate || 1;
        viewTitle = companyDetail.return_sales_invoice_title || "Return Sales Invoice";
        dynamicColor = companyDetail.return_sales_invoice_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 7) {
        viewFormate = companyDetail.return_purchase_invoice_view_formate || 1;
        viewTitle = companyDetail.return_purchase_invoice_title || "Return Purchase Invoice";
        dynamicColor = companyDetail.return_purchase_invoice_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 8) {
        viewFormate = companyDetail.inward_view_formate || 1;
        viewTitle = companyDetail.inward_title || "Goods Received Note (GRN)";
        dynamicColor = companyDetail.inward_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 9) {
        viewFormate = companyDetail.dispatch_view_formate || 1;
        viewTitle = companyDetail.dispatch_title || "Dispatch";
        dynamicColor = companyDetail.dispatch_view_color || "#cfcfcf";
      } else if (resultCartById.dataValues.type == 12) {
        viewFormate = companyDetail.proforma_invoice_view_formate || 1;
        viewTitle = companyDetail.proforma_invoice_title || "Proforma Invoice";
        dynamicColor = companyDetail.proforma_invoice_view_color || "#cfcfcf";
      }
      const printSettingModels = printSettingModel(req.tenantDB);

      const printSettings = await printSettingModels.findOne({
        where: {
          type: Number(resultCartById.dataValues.type),
          print_version: Number(viewFormate),
          isDelete: 0
        },
        attributes: ["setting_details"]
      });

      const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");


      let qrSvg = null;
      let payable_amount = parseFloat(resultCartById.dataValues.grand_total) - parseFloat(resultCartById.dataValues.advance_payment);

      if (companyDetail.upi_id && companyDetail.upi_name) {
        const upiString = `upi://pay?pa=${companyDetail.upi_id}&pn=${encodeURIComponent(companyDetail.upi_name)}&am=${payable_amount}&cu=INR&tn=Invoice%20No%20${encodeURI(resultCartById.dataValues.cart_number || '')}`;

        qrSvg = await QRCode.toString(upiString, {
          type: "svg",
          margin: 2,
          color: {
            dark: "#000000",
            light: "#FFF"
          }
        });
      }

      const renderedHtml = ejs.render(htmlTemplate, {
        userId: orderId,
        cart: resultCartById.dataValues,
        items: finalData,
        productCustom: productCustomFields,
        cartCustom: cartCustomFields,
        companyDetail: companyDetail,
        loginDetail: loginDetail,
        headerImg: headerImage,
        footerImg: footerImage,
        company_sign: signImage,
        company_logo: logoImage,
        cart_state_name: customerStateName,
        cart_city_name: customerCityName,
        company_state_name: companyStateName,
        formatNum: formatNumber,
        orderTypesList: orderTypesListPdf,
        numberToword: numberTowords,
        gstnumberToword: gstnumberTowords,
        currency: currencySymbol,
        transportHSN: TRANSPORT_CHARGE_HSN_CODE,
        transportGST: TRANSPORT_CHARGE__GST,
        packingHSN: PACKING_FORWARDING_CHARGE_HSN_CODE,
        packingGST: PACKING_FORWARDING_CHARGE_GST,
        printSetting: settingDetails,
        qrSvg: qrSvg,
        BACKEND_OF_SMALL_OFFICE_CRM_END_POINT: BACKEND_OF_SMALL_OFFICE_CRM_END_POINT,
      });


      // ✅ Dynamic height calculation function
      const calculateHeaderDetailsHeight = () => {
        if (!settingDetails.headerDetails) return "0px";

        let baseHeight = 30; // Company name section height
        let detailsHeight = 20; // Base details section height

        // Address length check - agar address bada hai to extra height add karo
        const addressLength = companyDetail.address ? companyDetail.address.length : 0;
        if (addressLength > 80) {
          detailsHeight += 25; // 3 lines
        } else if (addressLength > 50) {
          detailsHeight += 15; // 2 lines
        }

        // Calculate total details line (address + other fields)
        const otherDetails = `${companyDetail.printed_number || ''} ${companyDetail.company_email || ''} ${companyDetail.gst_number || ''} ${companyStateName || ''}`;
        const otherDetailsLength = otherDetails.length;

        if (otherDetailsLength > 80) {
          detailsHeight += 15; // Extra line for other details
        }

        const totalHeight = baseHeight + detailsHeight;

        // Minimum 50px guarantee
        return `${Math.max(totalHeight, 50)}px`;
      };

      const options = {
        format:
          viewFormate == 1 || viewFormate == 2
            ? "A4"
            : viewFormate == 5
              ? "80mm"
              : "A5",
        orientation: "portrait",
        border: "5mm",
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: false,
        phantomArgs: [
          '--ignore-ssl-errors=yes',
          '--web-security=false'
        ],


        // ✅ HEADER SECTION
        header:
          viewFormate != 5
            ? {
              height:
                settingDetails.headerImage && headerImage
                  ? "90px"
                  : settingDetails.headerDetails
                    ? calculateHeaderDetailsHeight() // ✅ Dynamic calculated height
                    : settingDetails.headerDetailsWithLogo ? "100px" : "0px",

              contents: {
                default: `
        ${
                  // ✅ CASE 1: Header image is ON and available
                  settingDetails.headerImage && headerImage
                    ? `
<div style="text-align: center; padding: 0px;">
  <img src="${headerImage}" style="width: 99.4%; margin: 0px; padding: 0px;"/>
</div>`
                    : // ✅ CASE 2: Header details are ON, sized by content (table auto-height)
                    settingDetails.headerDetails
                      ? `
<table style="width: 99.4%; margin: 0 auto; border-collapse: collapse;">
  <tr>
    <td style="border: 1px solid black; text-align: center; background-color: ${dynamicColor}; padding: 5px;">
      <strong style="font-size: 12pt;">${companyDetail.company_name}</strong>
    </td>
  </tr>
  <tr>
    <td style="border: 1px solid black; border-top: 0px; text-align: center; padding: 5px; line-height: 1.6; font-size: 7pt;">
      <strong>Address:</strong> ${companyDetail.address}<br>
      <strong>Mo.:</strong> ${companyDetail.printed_number} <strong>Email:</strong> ${companyDetail.company_email} <strong>GSTIN:</strong> ${companyDetail.gst_number} <strong>State:</strong> ${companyStateName}
    </td>
  </tr>
</table>`
                      : // ✅ CASE 3: Header Details With Logo Leftside
                      settingDetails.headerDetailsWithLogo && settingDetails.headerLogoOnRightSide == false
                        ? `
<table style="width:100%; border:1px solid black; border-collapse:collapse; margin:0px; padding:0px; ">
<tr>
  <td style="width:100px; vertical-align:top; padding:10px; border:none;">
    <img src="${logoImage}"
         alt="Company Logo"
         style="width:80px; height:80px; display:block;" />
  </td>
  <td style="vertical-align:top; padding:10px; border:none; text-align:left; font-size:7pt;">
    <strong style="font-size:12pt">${companyDetail.company_name || ''}</strong><br>
    <strong style="font-size:7pt">Address:</strong> ${companyDetail.address}
     <strong style="font-size:7pt">State:</strong> ${companyStateName}<br>
    <strong style="font-size:7pt">Mo.:</strong> ${companyDetail.printed_number} 
    <strong style="font-size:7pt">Email:</strong> ${companyDetail.company_email} 
    <strong style="font-size:7pt">GSTIN:</strong> ${companyDetail.gst_number}
  </td>
</tr>
</table>
`  : // ✅ CASE 4: Header Details With Logo Right side
                        settingDetails.headerDetailsWithLogo && settingDetails.headerLogoOnRightSide == true
                          ? `
<table style="width:100%; border:1px solid black; border-collapse:collapse; margin:0px; padding:0px;">
<tr>
  <td style="vertical-align:top; padding:10px; border:none; text-align:left; font-size:7pt;">
    <strong style="font-size:12pt;">${companyDetail.company_name || ''}</strong><br>
    <strong>Address:</strong> ${companyDetail.address} <strong>State:</strong> ${companyStateName}<br>
    <strong>Mo.:</strong> ${companyDetail.printed_number} 
    <strong>Email:</strong> ${companyDetail.company_email} 
    <strong>GSTIN:</strong> ${companyDetail.gst_number}
  </td>
  <td style="width:100px; vertical-align:top; padding:10px; border:none;">
    <img src="${logoImage}"
         alt="Company Logo"
         style="width:80px; height:80px; display:block;" />
  </td>
</tr>
</table>
`
                          : ""
                  }
      
      ${companyDetail.watermark_in_print == 2 && logoImage
                    ? `
          <img src="${logoImage}" 
               style="position: fixed;
                      top: ${viewFormate == 1 || viewFormate == 2 ? '350px' : '240px'};
                      left: 50%;
                      margin-left: ${viewFormate == 1 || viewFormate == 2 ? '-125px' : '-90px'};
                      width: auto; 
                      height: ${viewFormate == 1 || viewFormate == 2 ? '250px' : '180px'}; 
                      opacity: 0.15; 
                      z-index: -1;" />`
                    : ""
                  }
        </div>
  `,
              },
            }
            : undefined,
        // ✅ FOOTER SECTION
        footer:
          (viewFormate != 5) &&
            settingDetails.footerImage &&
            footerImage
            ? {
              height: "90px",
              contents: {
                default: `
    <div style="text-align: center; display: flex; align-items: center; justify-content: center;">
      <img src="${footerImage}" style="width: 100%; display: block;" alt="Footer Image" />
    </div>
`,
              },
            }
            : {
              height: "20px",
              contents: {
                default: `
<div style="text-align: center; font-size: 10px;">
    Page {{page}} of {{pages}}
  </div>`,
              },
            },
      };
      // Generate temporary PDF name
      const tempFilePath = path.join(uploadDir, `cart_temp_${Date.now()}.pdf`);
      const finalFilePath = path.join(uploadDir, `cart_${Date.now()}.pdf`);
      const pdfPath = `${companyDetail.id.toString()}/cart_${Date.now()}.pdf`;

      const document = {
        html: renderedHtml,
        data: {},
        path: tempFilePath,
        type: "",
      };

      // pdfme Document Designer — opt-in per company. Started Quotation-only
      // (cart type 1); Sales Order (cart type 2) added next, same engine
      // (templates.js's DOC_TYPES/dataDictionary.js already support both —
      // only this gate + generateQuotationPdf's doc_type param needed
      // extending). Isolated to "how tempFilePath's bytes get produced":
      // everything above (renderedHtml/options/document) and everything
      // below (attachment merge, upload, response) is untouched either way.
      const PDFME_DOC_TYPE_BY_CART_TYPE = {
        1: "quotation",
        2: "salesOrder",
        3: "salesInvoice",
        4: "purchaseInvoice",
        5: "purchaseOrder",
        6: "returnSalesInvoice",
        7: "returnPurchaseInvoice",
        8: "inward",
        9: "dispatch",
        12: "proformaInvoice",
      };
      const pdfmeDocType = PDFME_DOC_TYPE_BY_CART_TYPE[resultCartById.dataValues.type];
      const documentDesignerEnabled =
        !!pdfmeDocType &&
        (await isFeatureEnabled(companyDetail.id, "document_designer"));

      if (documentDesignerEnabled) {
        const cartData = resultCartById.dataValues;

        // encodeImageToBase64 (above) hardcodes a "data:image/png;..." prefix
        // regardless of the file's real format — fine for the EJS/browser
        // path (an <img> tag renders most formats even with a wrong-labeled
        // data URI), but imageOverlay.js's detectImageFormat trusts this
        // label to pick pdf-lib's embedPng vs embedJpg, and embedPng throws
        // on real JPEG bytes. Product photos are uploaded as .jpg — needs an
        // accurately-labeled encoder, not the shared header/logo one.
        // Mime comes from the real file bytes (sniffImageMime), not the
        // extension — a mislabeled/renamed file (".jpg" that's actually PNG
        // bytes, or vice versa) makes pdf-lib's embedJpg throw "SOI not
        // found in JPEG" since the bytes genuinely aren't the format the
        // extension claimed.
        const buildProductImageDataUri = (relativePath) => {
          if (!relativePath) return "";
          try {
            const bytes = fs.readFileSync(
              path.join(process.cwd(), "media-folder/product-images", relativePath)
            );
            const mime = sniffImageMime(bytes);
            if (!mime) return "";
            return `data:${mime};base64,${bytes.toString("base64")}`;
          } catch {
            return "";
          }
        };

        const pdfmeItems = finalData.map((item) => ({
          description: item.item_product_name,
          hsn: item.item_hsn_code,
          qty: item.item_unit_name ? `${item.item_qty} / ${item.item_unit_name}` : item.item_qty,
          rate: item.item_rate,
          discount: item.item_discount_pct,
          total: item.item_total,
          item_hsn_code: item.item_hsn_code,
          item_total: item.item_total,
        }));

        const pdfmeItemImages = resultAllCartItems.map((item) => {
          const product = productMap[item.item_product_id];
          if (!product?.product_img) return "";
          // productMap's product_img is PRODUCT_IMG_LINK_EXTENDED + the raw
          // DB value ("<companyId>/<filename>.jpg") — strip only the URL
          // prefix, not the whole path down to the basename, or the
          // company-folder segment (part of the real on-disk path) is lost.
          const relativePath = product.product_img.replace(PRODUCT_IMG_LINK_EXTENDED, "");
          return buildProductImageDataUri(relativePath);
        });

        // "Product Page Designer" — 1:1 with pdfmeItems/pdfmeItemImages, in
        // cart item order. Only consumed when the resolved main template's
        // include_product_pages flag is on (generateDocument.js).
        const pdfmeItemProductIds = resultAllCartItems.map((item) => item.item_product_id);

        const buffer = await generateQuotationPdf({
          documentTemplateId: req.body?.document_template_id,
          company: {
            id: companyDetail.id,
            name: companyDetail.company_name,
            address: companyDetail.address,
            gstin: companyDetail.gst_number,
            mobile: companyDetail.printed_number,
            email: companyDetail.company_email,
            state: companyStateName,
            headerImage,
            logoImage,
            footerImage,
            signImage,
            watermark_in_print: companyDetail.watermark_in_print,
            // Same viewTitle/dynamicColor the old EJS path already computed
            // above (per-company <type>_title/<type>_view_color, falling
            // back to the type's default) — keeps a company's title/color
            // customization intact instead of resetting to the ported
            // static default on every pdfme generate.
            docTitle: viewTitle,
            titleColor: dynamicColor,
            // Same printSetting.paymentQR / companyDetail.upi_id/upi_name
            // the old EJS path already reads above (~line 4491-4505) to
            // decide whether to render the UPI payment QR code.
            paymentQREnabled: !!settingDetails.paymentQR,
            upiId: companyDetail.upi_id,
            upiName: companyDetail.upi_name,
          },
          buyer: {
            companyName: cartData.to_customer_company_name,
            contactName: cartData.to_customer_name,
            phone: cartData.to_customer_phone,
            email: cartData.to_customer_email,
            billingAddress: cartData.Address,
            shippingAddress: cartData.shipping_address,
            gstin: cartData.to_customer_gst_number,
            supplyTo: [customerStateName, customerCityName].filter(Boolean).join(" - "),
          },
          order: {
            number: cartData.cart_number,
            dateTime: cartData.update_Date_time ? moment(cartData.update_Date_time).format("DD-MM-YYYY hh:mm A") : "",
            contactPerson: loginDetail?.username,
          },
          items: pdfmeItems,
          cart: cartData,
          numberTowords,
          columnOptions: null,
          itemImages: pdfmeItemImages,
          itemProductIds: pdfmeItemProductIds,
          customFieldRows: CartCustomFields,
          cartValues: cartData,
          tenantDB: req.tenantDB,
          doc_type: pdfmeDocType,
          // Same company-state-vs-customer-state comparison the old EJS path
          // already computes above (customerStateName/companyStateName) —
          // decides CGST+SGST split vs IGST in the HSN/GST summary table.
          isSameState: !!companyStateName && companyStateName === customerStateName,
          packingChargeLabel: cartData.packing_forwarding_charge_title || "Packing Charge",
          transportChargeLabel: cartData.transport_charge_title || "Transport Charge",
          tcsLabel: cartData.tcs_title || "TCS",
          // bank_detail is rich-text (old EJS renders it raw/unescaped,
          // <%- %>) — pdfme text fields don't render HTML, so it's flattened
          // to plain text here: <br>/</p> become newlines, remaining tags
          // are stripped.
          bankDetails: (companyDetail.bank_detail || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .trim(),
          remarks: cartData.cart_remark || "",
          note: settingDetails.note ? cartData.cart_note || "" : "",
          packingHSN: PACKING_FORWARDING_CHARGE_HSN_CODE,
          packingGSTRate: PACKING_FORWARDING_CHARGE_GST,
          transportHSN: TRANSPORT_CHARGE_HSN_CODE,
          transportGSTRate: TRANSPORT_CHARGE__GST,
        });

        fs.writeFileSync(tempFilePath, buffer);
      } else {
        // Generate the main PDF
        await pdf.create(document, options);
      }

      // ✅ MERGE PDFs if attachments exist
      if (beforeAttachments.length > 0 || afterAttachments.length > 0) {
        const merger = new PDFMerger();

        // Helper function to get full attachment path
        const getAttachmentPath = (attachment) => {
          const attachmentPath = attachment.dataValues.attachment;
          // Build path to media-folder/cart-attachment
          return path.resolve(
            __dirnameConstant,
            `../../media-folder/cart_attachment/${attachmentPath}`
          );
        };

        // Helper function to check if file is PDF or image
        const isPDF = (filePath) => {
          return path.extname(filePath).toLowerCase() === '.pdf';
        };

        try {

          // 1. Add BEFORE attachments (negative display_order)
          for (const attachment of beforeAttachments) {
            const attachmentPath = getAttachmentPath(attachment);
            const displayOrder = attachment.dataValues.display_order;
            const fileType = isPDF(attachmentPath) ? 'PDF' : 'IMAGE';


            if (fs.existsSync(attachmentPath)) {
              if (isPDF(attachmentPath)) {
                await merger.add(attachmentPath);
              } else {
                // For images, create a temporary PDF
                const tempImagePdf = path.join(uploadDir, `temp_img_${Date.now()}.pdf`);
                const imageBase64 = encodeImageToBase64(attachmentPath);
                const imageHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html, body {
        width: 100%;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }
      body {
        background-color: #ffffff;
      }
      .image-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      }
      img {
        max-width: 90%;
        max-height: 90%;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        margin: auto;
      }
    </style>
  </head>
  <body>
    <div class="image-container">
      <img src="${imageBase64}" alt="Attachment" />
    </div>
  </body>
  </html>
`; const imageDoc = {
                  html: imageHtml,
                  data: {},
                  path: tempImagePdf,
                  type: "",
                };
                await pdf.create(imageDoc, { format: "A4", orientation: "portrait" });
                await merger.add(tempImagePdf);
                // Delete temp image PDF
                fs.unlinkSync(tempImagePdf);
              }
            } else {
              console.log(`File not found, skipping...`);
            }
          }

          // 2. Add MAIN generated PDF
          await merger.add(tempFilePath);

          // 3. Add AFTER attachments (positive display_order)
          for (const attachment of afterAttachments) {
            const attachmentPath = getAttachmentPath(attachment);
            const displayOrder = attachment.dataValues.display_order;
            const fileType = isPDF(attachmentPath) ? 'PDF' : 'IMAGE';


            if (fs.existsSync(attachmentPath)) {
              if (isPDF(attachmentPath)) {
                await merger.add(attachmentPath);
              } else {
                // For images, create a temporary PDF
                const tempImagePdf = path.join(uploadDir, `temp_img_${Date.now()}.pdf`);
                const imageBase64 = encodeImageToBase64(attachmentPath);
                const imageHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      html, body {
        width: 100%;
        height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }
      body {
        background-color: #ffffff;
      }
      .image-container {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      }
      img {
        max-width: 90%;
        max-height: 90%;
        width: auto;
        height: auto;
        object-fit: contain;
        display: block;
        margin: auto;
      }
    </style>
  </head>
  <body>
    <div class="image-container">
      <img src="${imageBase64}" alt="Attachment" />
    </div>
  </body>
  </html>
`; const imageDoc = {
                  html: imageHtml,
                  data: {},
                  path: tempImagePdf,
                  type: "",
                };
                await pdf.create(imageDoc, { format: "A4", orientation: "portrait" });
                await merger.add(tempImagePdf);
                // Delete temp image PDF
                fs.unlinkSync(tempImagePdf);
                console.log(`Image converted to PDF and added`);
              }
            } else {
              console.log(`File not found, skipping...`);
            }
          }

          // Save merged PDF
          await merger.save(finalFilePath);

          // Delete temporary generated PDF
          fs.unlinkSync(tempFilePath);
        } catch (mergeError) {
          console.error("Error merging PDFs:", mergeError);
          // If merge fails, use the original PDF
          fs.renameSync(tempFilePath, finalFilePath);
        }
      } else {
        // No attachments, just rename temp file to final
        fs.renameSync(tempFilePath, finalFilePath);
      }

      const fileLinkPath = PDF_LINK_EXTENDED + pdfPath;

      const pdfFrontName =
        resultCartById.dataValues.to_customer_company_name?.trim()
          ? resultCartById.dataValues.to_customer_company_name
          : resultCartById.dataValues.to_customer_name;


      return resSuccess({
        ack_msg: "Pdf generated",
        data: {
          title: sanitizeFileName(pdfFrontName + "_" + viewTitle + "_" + resultCartById.dataValues.sr_by_number + "_" + formatDateWithoutDash(resultCartById.dataValues.update_Date_time)),
          path: fileLinkPath,
          customer_phone: resultCartById.dataValues.to_customer_phone,
          sessionName: `a${req.headers?.["x-tenant-id"]}_c${companyDetail.id.toString()}`
        },
      });
    } else {
      return resError({
        ack_msg: "Something went wrong.",
        developer_msg: "Order Id not found.",
      });
    }
  } catch (error) {
    console.log(`pdfOrder error ${error}`);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
};

export const orderattachment = async (req) => {
  try {
    const { display_orders, cart_id, a_application_login_id, company_master_id } = req.body;
    const images = req.files;


    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (!findCompanyId || !findCompanyId.company_masters_id) {
      return resError({
        ack_msg: "error",
        developer_msg: "Company not found for given login id"
      });
    }

    let directoryPath;
    if (images) {
      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "cart_attachment",
        findCompanyId.company_masters_id.toString()
      );
    }

    const bulkInsertData = [];

    if (images && images.length > 0) {
      await fs.ensureDir(directoryPath);
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        const fileExists = await fs.pathExists(image.path);
        if (!fileExists) {
          console.error(`Source file not found: ${image.path}`);
          continue;
        }

        const fileName = path.basename(image.path);
        const destinationPath = path.join(directoryPath, fileName);
        await fs.copy(image.path, destinationPath, { overwrite: true });

        const imagePath = findCompanyId.company_masters_id.toString() + "/" + fileName;
        const imageName = image.originalname || fileName;

        bulkInsertData.push({
          cart_id: cart_id,
          display_order: display_orders[i],
          attachment: imagePath,
          attachment_name: imageName,
          a_application_login_id: a_application_login_id,
          company_master_id: findCompanyId.company_masters_id.toString(),
          created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss")
        });

        try {
          await fs.remove(image.path);
        } catch (err) {
          console.log("Could not delete temp file:", err.message);
        }
      }


      const cartvsattachmentModels = cartvsattachmentmodel(req.tenantDB);
      const createData = await cartvsattachmentModels.bulkCreate(bulkInsertData);

      return resSuccess({
        ack_msg: "success",
        developer_msg: "Files uploaded and saved to database successfully",
        data: createData
      });
    }

    return resError({
      ack_msg: "error",
      developer_msg: "No files uploaded"
    });

  } catch (e) {
    console.log("error in attachment", e);
    return resError({
      ack_msg: "error",
      developer_msg: e.message || e
    });
  }
}

export const getorderattachment = async (req) => {
  try {
    const { cart_id } = req.body;

    const cartvsAttachemtnModels = cartvsattachmentmodel(req.tenantDB);
    const getAllAttachment = await cartvsAttachemtnModels.findAll({
      where: {
        cart_id: cart_id,
        isDelete: 0
      },
      raw: true
    });

    const attachmentsWithPrefix = getAllAttachment.map(item => ({
      ...item,
      attachment: `${ORDER_ATTACHMENT_LINK_EXTENDED}${item.attachment}`
    }));

    return resSuccess({
      ack_msg: "successfully get attachments",
      data: { getAllAttachment: attachmentsWithPrefix }
    });
  }
  catch (e) {
    console.log("error in Get order Attachment", e);
    return resError({
      ack_msg: "error in get Order Attachment",
      developer_msg: e || "error"
    });
  }
}

export const updateOrderAttachments = async (req) => {
  try {
    const { id, display_order, isDelete } = req.body;
    const cartvsAttachemtnModels = cartvsattachmentmodel(req.tenantDB);

    const updated = await cartvsAttachemtnModels.update(
      {
        display_order: display_order,
        isDelete: isDelete
      },
      {
        where: { id: id }
      }
    );

    return resSuccess({
      ack_msg: "Attachment updated successfully",
      data: { updated }
    });
  } catch (e) {
    console.log("error in Update order Attachment", e);
    return resError({
      ack_msg: "error in update Order Attachment",
      developer_msg: e || "error"
    });
  }
}

export const actionAccessibilityMethod = async (req) => {
  try {
    const { id, cart_type } = req.body;
    const cartModelInstance = cartModel(req.tenantDB);
    // const dependencyRules = {
    //   quotation: {
    //     deleteBlockedBy: ["order"],
    //     priceEditableUntil: ["order"],
    //   },
    //   order: {
    //     deleteBlockedBy: ["dispatch", "invoice"],
    //     priceEditableUntil: ["dispatch"],
    //   },
    //   dispatch: {
    //     deleteBlockedBy: ["invoice"],
    //   },
    // };

    const checkIsValidate = await cartModelInstance.findOne(
      {
        where: {
          referance_cart_id: id,
          reference_type: cart_type,
          cart_number: { [Op.ne]: '' },
          type: { [Op.ne]: cart_type },
          isDelete: 0
        },
        attributes: ["id"]
      }
    );
    if (!checkIsValidate) {
      return resSuccess({
        ack_msg: "accessible",
        data: { canDelete: true, canEdit: true, msg: null }
      })
    }

    return resSuccess({
      ack_msg: "not-accessible",
      data: { canDelete: false, canEdit: false, msg: "This action was not performed for this entry. Because the next step has been approved." }
    })
  } catch (error) {
    console.log("actionAccessibilityMethod Error", error);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
}

export const orderStatusUpdateScriptMethod = async (req, res) => {
  try {
    console.log("Script Start orderStatusUpdateScriptMethod")
    const { company_id } = req.body;
    const whereClouse = {
      isDelete: 0,
      isActive: 1,
    };

    if (isValid(company_id)) {
      const companyIdsArray = [...new Set(
        company_id
          .split(',')
          .map(id => Number(id.trim()))
          .filter(id => !isNaN(id))
      )];

      whereClouse.id = {
        [Op.in]: companyIdsArray,
      };
    }
    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: whereClouse,
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};   // <-- Important

      req.body.a_application_login_id = tenantId;

      // Create fake req object for middleware
      const fakeReq = {
        headers: { "x-tenant-id": tenantId }
      };

      req.headers["x-tenant-id"] = tenantId;
      await new Promise((resolve, reject) => {
        tenantMiddleware(req, res, (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

      const response = await orderStatusUpdateScript(req);
      responseData.push({ company_name: company.company_name, response })
    }
    console.log("Script End orderStatusUpdateScriptMethod")
    return resSuccess({
      ack_msg: "order status update script run successfully",
      data: responseData
    });
  } catch (error) {
    console.log("Script Error orderStatusUpdateScriptMethod")
    console.log("orderStatusUpdateScriptMethod Error", error);
    return resError({ message: "Error starting orderStatusUpdateScriptMethod", developer_msg: error.msg });
  }
}

export const orderStatusUpdateScript = async (req) => {
  const { a_application_login_id } = req.body;
  const cartModelIntance = cartModel(req.tenantDB);

  const getOrderListDb = await cartModelIntance.findAll({
    where: {
      isDelete: 0, cart_status: 0, sr_by_number: { [Op.ne]: 0 }, type: { [Op.in]: [2, 5] }
    },
    attributes: ["type", "id"]
  })
  let resdsds = [];
  if (getOrderListDb) {
    for (const order of getOrderListDb) {
      const ress = await updateCartStatus(req, { type: order.type, target_id: order.id, a_application_login_id });
      resdsds.push(ress)
    }
  }
  return resdsds;
}

export const voiceOrderToCart = async (req, res) => {
  try {
    const { texts, assinged_to_price_list } = req.body;
    if (!texts?.trim()) {
      return res.status(400).json({ error: 'text required' });
    }
    const a_application_login_id = req.headers["x-tenant-id"];
    const findCompanyId = await getCompanyByLoginId(
      a_application_login_id
    );

    // Fetch Gemini API key
    const findGeminiKey = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: "0",
      },
      attributes: ["id", "gimini_appkey", "company_name"],
    });
    if (!findGeminiKey || !findGeminiKey.dataValues.gimini_appkey) {
      return resError({
        ack_msg: "Gemini API key not found",
        developer_msg: `No API key found for company ID`,
      });
    }

    let a_company_name;
    let a_company_id;

    a_company_name = findGeminiKey.dataValues.company_name;
    a_company_id = findGeminiKey.dataValues.id;

    // ---------- Gemini ----------
    const genAI = new GoogleGenerativeAI(findGeminiKey.dataValues.gimini_appkey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    /* --------------------------------------------------------------
   PROMPT – forces Gemini to return **pure JSON only**
   -------------------------------------------------------------- */
    const PROMPT = `
You are an intelligent order parser for Hinglish, Nepali, and Gujarati voice/text orders.

Extract every product mentioned along with its quantity, rate, GST %, and discount.

Return ONLY a valid JSON array (no markdown, no extra text, no explanations):

[
  {
    "product_name": "exact product name from user",
    "quantity": number,
  }
]

Strict Rules:
- product_name → keep EXACTLY as spoken/written by the user
- Do not translate product names
- quantity → default 1 if not mentioned
- One product → still return array with 1 object
- Multiple products → one object per product

Return only the JSON array. Nothing else.
`;
    //     const PROMPT = `
    // You are an intelligent order parser for Hinglish, Nepali, and Gujarati voice/text orders.

    // Extract every product mentioned along with its quantity, rate, GST %, and discount.

    // Return ONLY a valid JSON array (no markdown, no extra text, no explanations):

    // [
    //   {
    //     "product_name": "exact product name from user",
    //     "quantity": number,
    //     "rate": number or 0,
    //     "gst_percent": number or 0,
    //     "discount_percent": number or 0,
    //     "discount_amount": number or 0
    //   }
    // ]

    // Strict Rules:
    // - product_name → keep EXACTLY as spoken/written by the user
    // - Do not translate product names
    // - quantity → default 1 if not mentioned
    // - rate → convert Indian/Nepali verbal numbers correctly:
    //     • "1 lakh 22 thousand" → 122000
    //     • "1.2 hajar" or "barah sau" → 1200
    //     • "22k" or "22 hajar" → 22000
    //     • "do lakh pachas hajar" → 250000
    //     • "ek sau pachaas" → 150
    // - gst_percent → extract only number:
    //     • "18%" → 18
    //     • "5 percent gst" → 5
    //     • "including gst" → null
    // - discount → support both percentage and amount:
    //     • "10% discount" or "10 percent off" → discount_percent: 10
    //     • "500 rupees discount" or "500 off" or "500 kam" → discount_amount: 500
    //     • "5% + 200 off" → discount_percent: 5, discount_amount: 200
    //     • "flat 1000 discount" → discount_amount: 1000
    //     • "no discount" or not mentioned → both null
    // - If rate includes discount phrase like "150000 ka 10% discount ke sath", rate = 150000, discount_percent = 10
    // - One product → still return array with 1 object
    // - Multiple products → one object per product

    // Return only the JSON array. Nothing else.
    // `;

    const result = await model.generateContent([PROMPT, texts]);
    let raw = result.response.text();

    let jsonStr = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```/i, '')
      .replace(/```$/g, '')
      .trim();

    // Keep only the first [ … ] object
    const start = jsonStr.indexOf('[');
    const end = jsonStr.lastIndexOf(']') + 1;
    if (start === -1 || end === 0) {
      return res.status(500).json({ error: 'No JSON array', raw });
    }
    jsonStr = jsonStr.slice(start, end);

    // Safe parse
    let items;
    try {
      items = JSON.parse(jsonStr);
    } catch (e) {
      return res.status(500).json({
        error: 'Invalid JSON from Gemini',
        raw,
        cleaned: jsonStr
      });
    }
    items = items.map(item => ({
      product_name: item.product_name || "",
      quantity: item.quantity ?? 1,
      // rate: item.rate ?? 0,
      // gst_percent: item.gst_percent ?? 0,
      // discount_percent: item.discount_percent ?? 0,
      // discount_amount: item.discount_amount ?? 0,
    }));

    const finalProducts = [];
    const productModels = productModel(req.tenantDB);
    let resultPriceListItem = [];
    const productListCustom = priceListModel(req.tenantDB);

    if (assinged_to_price_list) {
      resultPriceListItem = await productListCustom.findAll({
        where: {
          pricelist_masters_id: assinged_to_price_list,
          isDelete: 0
        }
      });
    }

    for (const item of items) {

      const product = await productModels.findOne({
        where: {
          [Op.or]: [
            { product_name: { [Op.like]: `%${item.product_name}%` } },
            { product_alias: { [Op.like]: `%${item.product_name}%` } },
            { product_code: { [Op.like]: `%${item.product_name}%` } }
          ],
          company_masters_id: a_company_id,
          isDelete: "0",
          isActive: "1"
        },
        attributes: {
          include: [
            [
              Sequelize.literal(
                "(SELECT categories.category_name FROM categories WHERE categories.id = products.category_id AND categories.isDelete=0)"
              ),
              "category_name"
            ],
            [
              Sequelize.literal(
                "(SELECT group_name FROM product_groups WHERE product_groups.id = products.product_group_id AND product_groups.isDelete=0)"
              ),
              "group_name"
            ],
            [
              Sequelize.literal(
                `(SELECT unit 
            FROM product_unit_masters 
            WHERE product_unit_masters.id = products.product_inner_unit 
            AND product_unit_masters.isDelete = 0)`
              ),
              "product_inner_unit_name"
            ],
            [
              Sequelize.literal(
                `(SELECT unit 
            FROM product_unit_masters 
            WHERE product_unit_masters.id = products.product_outer_unit 
            AND product_unit_masters.isDelete = 0)`
              ),
              "product_outer_unit_name"
            ],
            [
              Sequelize.literal(
                `(SELECT is_point_value_allow
          FROM product_unit_masters
          WHERE product_unit_masters.id = products.unit_id
          AND product_unit_masters.isDelete = 0)`
              ),
              "is_point_value_allow"
            ]
          ]
        }
      });

      if (!product) continue;

      const p = product.toJSON();

      let net_rate = p.net_rate;
      let price_list_discount = null;
      let price_list_dis_amt = null;

      if (assinged_to_price_list && resultPriceListItem.length > 0) {
        const matchingItem = resultPriceListItem.find(
          (pl) => pl.dataValues?.product_id === p.id
        );

        if (matchingItem) {
          net_rate = matchingItem.dataValues.net_rate;
          price_list_discount = matchingItem.dataValues.discount;
          price_list_dis_amt = matchingItem.dataValues.discount_amount;
        }
      }

      finalProducts.push({
        ...p,
        order_quantity: item.quantity || 1,
        net_rate,
        ...(price_list_discount !== null && { price_list_discount }),
        ...(price_list_dis_amt !== null && { price_list_dis_amt })
      });

      // finalProducts.push({
      //   ...p,

      //   order_quantity: item.quantity || 1,
      //   // order_rate: item.rate || p.rate,
      //   // order_gst_percent: item.gst_percent || p.GST,
      //   // order_discount_percent: item.discount_percent || 0,
      //   // order_discount_amount: item.discount_amount || 0
      // });
    }

    if (!finalProducts.length) {
      return resError({
        ack: 0,
        ack_msg: "No matching products found for the provided voice order",
        developer_msg: "Gemini parsed items but no product matched in database",
        data: {
          success: false,
          finalProducts: []
        }
      });
    }

    return resSuccess({
      ack_msg: "Products fetched successfully",
      developer_msg: "Voice order parsed and products retrieved successfully",
      data: {
        success: true,
        finalProducts
      }
    });

  } catch (error) {
    return resBadRequest({
      ack_msg: isGeminiQuotaError(error) ? 'Gemini AI feature is temporarily unavailable due to usage limits. Please enable billing or try again later.' : '',
      developer_msg: `${error.message}`,
    });
  }
};

export function isGeminiQuotaError(error) {
  if (!error) return false;

  // Axios / fetch style
  const status = error?.response?.status || error?.status;
  const message =
    error?.response?.data?.error?.message ||
    error?.message ||
    "";

  if (status === 429) return true;

  return (
    message.includes("Quota exceeded") ||
    message.includes("Too Many Requests") ||
    message.includes("generate_content_free_tier") ||
    message.includes("exceeded your current quota")
  );
}

export const fetchLastParty = async (req, res) => {
  try {
    const { type, contact_id } = req.body;
    const tenantId = req.headers["x-tenant-id"];
    const findCompanyId = await getCompanyByLoginId(tenantId);
    if (!findCompanyId) {
      return resError({ developer_msg: "Company not found" });
    }

    const fatchAutoPopulateLastDataFetchFlagDb = await companyModel.findAll({
      where: {
        isDelete: 0,
        id: findCompanyId.company_masters_id,
      },
      attributes: ["quotation_effect_last_data_on_new", "sales_invoice_effect_last_data_on_new", "order_effect_last_data_on_new", "return_sales_invoice_effect_last_data_on_new", "purchase_invoice_effect_last_data_on_new", "return_purchase_invoice_effect_last_data_on_new", "purchase_order_effect_last_data_on_new"]
    });

    const flag = await getAutoPopulateLastDataFetchFlag(type, fatchAutoPopulateLastDataFetchFlagDb);
    if (flag != 1) {
      return resSuccess({
        data: {
          customFormFiledValues: [],
          cartValues: null,
        },
      });
    }
    const cartModelInstance = cartModel(req.tenantDB);
    const customFieldFormModelInstance = customFieldFormModel(req.tenantDB);

    const pageTypes = {
      1: "5",
      2: "6",
      3: "7",
      4: "8",
      5: "9",
      6: "10",
      7: "11",
      8: "12",
      9: "13",
    };

    // Get latest record only
    const lastCart = await cartModelInstance.findOne({
      where: {
        to_customer_id: contact_id,
        type,
        isDelete: 0,
      },
      order: [["id", "DESC"]],
      raw: true,
    });

    // Early return if no data
    if (!lastCart) {
      return resSuccess({
        data: {
          customFormFiledValues: [],
          cartValues: null,
        },
      });
    }

    const formType = pageTypes[type];

    // Fetch custom fields
    const customFields = await customFieldFormModelInstance.findAll({
      where: {
        form_type: formType,
        isDelete: 0,
      },
      attributes: ["reference_column_name", "data_type"],
      raw: true,
    });

    // Map directly (no Promise.all needed)
    const customFormFiledValues = customFields.map((field) => ({
      fieldName: field.reference_column_name,
      value: lastCart[field.reference_column_name],
      dataType: field.data_type,
    }));

    return resSuccess({
      data: {
        customFormFiledValues,
        cartValues: lastCart,
      },
    });

  } catch (error) {
    console.error("fetchLastParty Error:", error);
    return resBadRequest({
      developer_msg: error.message,
    });
  }
};

export const fetchShippingLabelPrint = async (req, res) => {
  try {
    const orderId = req.body.cart_id;
    const orderType = req.body.cart_type;

    const Cart = cartModel(req.tenantDB);
    const CartItem = cartItemModel(req.tenantDB);
    const Product = productModel(req.tenantDB);
    const State = stateModel(req.tenantDB);
    const City = cityModel(req.tenantDB);
    const CustomField = customFieldFormModel(req.tenantDB);
    const PrintSetting = printSettingModel(req.tenantDB);

    //CART
    const cart = await Cart.findOne({
      where: { id: orderId, type: orderType, isDelete: 0 },
      raw: true,
    });

    if (!cart) return resError({ ack_msg: "Order not found" });

    //STATE + CITY NAME
    const state = await State.findOne({ where: { id: cart.state_id }, raw: true });
    const city = await City.findOne({ where: { id: cart.city_id }, raw: true });

    cart.state_name = state?.state_name || "";
    cart.city_name = city?.city_name || "";

    //ITEMS
    const items = await CartItem.findAll({
      where: { cart_id: orderId, isDelete: 0 },
      raw: true,
    });

    //COMPANY
    const company = await getCompanyDetailByLoginId(cart.a_application_login_id);

    //PRINT SETTING
    const printSettingData = await PrintSetting.findOne({
      where: { type: 14, print_version: 1, isDelete: 0 },
      raw: true,
    });

    const printSetting = JSON.parse(printSettingData?.setting_details || "{}");

    //CUSTOM FORM (CART)
    let formType = 5;
    if (cart.type == 8) formType = 12;
    if (cart.type == 9) formType = 13;

    const customFields = await CustomField.findAll({
      where: {
        form_type: formType,
        isDelete: 0,
        print_or_not: 1,
      },
      raw: true,
      order: [["display_order", "ASC"]],
    });

    const matchedCartFields = {};
    customFields.forEach(f => {
      if (cart[f.reference_column_name]) {
        matchedCartFields[f.title] = cart[f.reference_column_name];
      }
    });

    //TERMS
    let dynamicTerms = "";
    if (cart.type == 9) {
      dynamicTerms = company.dispatch_terms_conditions;
    } else if (cart.type == 3) {
      dynamicTerms = company.sales_invoice_terms_conditions;
    }

    //Create folder
    const uploadDir = path.resolve(
      __dirnameConstant,
      `../../media-folder/ShippingLabel/${company.id.toString()}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    //File name
    const fileName = `shipping_label_${Date.now()}.pdf`;
    const fullPath = path.join(uploadDir, fileName);

    //Public path
    const pdfPath = `${company.id}/${fileName}`;

    // pdfme Document Designer — same per-company opt-in as §5's cart-doc
    // path (orderServices.js:4810). document_template_id (from the
    // frontend's picker, when the company has 2+ shippingLabel templates)
    // selects a company-customized template; otherwise the company's
    // default row (if any) or the built-in fixed layout is used.
    const documentDesignerEnabled = await isFeatureEnabled(company.id, "document_designer");

    if (documentDesignerEnabled) {
      let qrDataUri = "";
      if (cart.sr_by_number) {
        qrDataUri = await QRCode.toDataURL(cart.sr_by_number.toString(), {
          margin: 1,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
      }

      const buffer = await generateShippingLabelPdf({
        cart,
        company,
        items,
        qrDataUri,
        documentTemplateId: req.body.document_template_id,
        tenantDB: req.tenantDB,
        dynamicTerms,
        showProductSection: !!printSetting?.ProductSection,
      });

      fs.writeFileSync(fullPath, buffer);
    } else {
      //QR (ONLY sr_number)
      let qrSvg = "";
      if (cart.sr_by_number) {
        qrSvg = await QRCode.toString(cart.sr_by_number.toString(), {
          type: "svg",
        });
      }

      const htmlTemplate = fs.readFileSync(
        path.join(__dirnameConstant, "../views/ShippingLabel/shippingLabel.ejs"),
        "utf-8"
      );

      //Render HTML
      const renderedHtml = ejs.render(htmlTemplate, {
        cart,
        items,
        company,
        qrSvg,
        printSetting,
        matchedCartFields,
        customFields,
        dynamicTerms,
      });

      //Generate PDF
      const document = {
        html: renderedHtml,
        data: {},
        path: fullPath,
        type: "",
      };

      const options = {
        format: "A5",
        orientation: "portrait",
        border: "5mm",
      };

      await pdf.create(document, options);
    }

    //Response
    return resSuccess({
      ack_msg: "PDF Generated",
      data: {
        path: PDF_LINK_SHIPPING_LABEL + pdfPath,
        file_name: fileName
      },
    });
  } catch (err) {
    console.log("ShippingLabel Error:", err);
    return resBadRequest({ developer_msg: err.message });
  }
};

export const fetchSeriesLastNumber = async (req) => {
  try {
    const {
      a_application_login_id,
      order_type,
      prefixes = [],
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(
      a_application_login_id
    );

    const result = await Promise.all(
      prefixes.map(async (prefix) => {
        const seriesData = await getNumberSeries(
          findCompanyId.company_masters_id,
          order_type,
          moment().format("YYYY-MM-DD"),
          prefix,
          req
        );

        return {
          prefix,
          last_sr_no: Math.max((seriesData?.sr_by_no || 1) - 1, 0),
        };
      })
    );

    return resSuccess({
      data: result,
    });
  } catch (e) {
    console.log("fetchSeriesLastNumber Error =>", e);

    return resBadRequest({
      developer_msg: `error ${e}`,
    });
  }
};

export const deleteMultipleOrder = async (req) => {
  const { cart_id, a_application_login_id, cart_type, action = "check" } = req.body;

  if (!cart_id || !a_application_login_id) {
    return resBadRequest({
      developer_msg: "cart_id and a_application_login_id are required",
    });
  }

  const cartIds = Array.isArray(cart_id) ? cart_id : [cart_id];
  const CATModel = cartModel(req.tenantDB);

  // *** PHASE 1: CHECK — Promise.all se parallel ***
  const checkResults = await Promise.all(
    cartIds.map(async (singleId) => {
      const cartData = await CATModel.findOne({
        where: { id: singleId, isDelete: 0 },
        attributes: ["id", "cart_number", "to_customer_name", "grand_total", "type"],
      });

      if (!cartData) {
        return {
          blocked: true,
          data: {
            id: singleId,
            cart_number: "N/A",
            to_customer_name: "N/A",
            grand_total: 0,
            reason: "Not found or already deleted",
          },
        };
      }

      const conversionExists = await CATModel.findOne({
        where: {
          referance_cart_id: singleId,
          reference_type: cart_type,
          cart_number: { [Op.ne]: "" },
          type: { [Op.ne]: cart_type },
          isDelete: 0,
        },
        attributes: ["id"],
      });

      const info = {
        id: cartData.dataValues.id,
        cart_number: cartData.dataValues.cart_number || "Draft",
        to_customer_name: cartData.dataValues.to_customer_name || "N/A",
        grand_total: cartData.dataValues.grand_total || 0,
        type: cartData.dataValues.type,
      };

      return {
        blocked: !!conversionExists,
        data: conversionExists
          ? { ...info, reason: "Next step already approved. Cannot delete." }
          : info,
      };
    })
  );

  const blockedList = checkResults.filter((r) => r.blocked).map((r) => r.data);
  const deletableList = checkResults.filter((r) => !r.blocked).map((r) => r.data);

  if (action === "check") {
    return resSuccess({
      ack_msg: "Check completed",
      data: {
        blockedList,
        deletableList,
        canProceed: deletableList.length > 0,
      },
    });
  }

  // *** PHASE 2: DELETE — sequential rakho (transaction safe) ***
  if (action === "delete") {
    if (deletableList.length === 0) {
      return resError({ ack_msg: "No items to delete." });
    }

    const transaction = await req.tenantDB.transaction();
    try {
      const CATItemModel = cartItemModel(req.tenantDB);
      const CBTMSGHistory = contactMessageHistory(req.tenantDB);
      const AccountTransctionModel = accountTransactionsModel(req.tenantDB);

      const tableExists = await req.tenantDB.getQueryInterface().showAllTables();
      if (!tableExists.includes("carts")) {
        await transaction.rollback();
        return resError({ developer_msg: "Table 'carts' not found" });
      }

      const findCompanyId = await getCompanyByLoginId(a_application_login_id);
      if (!findCompanyId) {
        await transaction.rollback();
        return resError({ developer_msg: "Company not found" });
      }

      const usernameLiteral = async (login_id) => {
        const user = await loginModel.findOne({
          where: { id: login_id, isDelete: 0 },
          attributes: ["username"],
        });
        return user?.username || "Unknown";
      };

      const approveBy = await usernameLiteral(a_application_login_id);
      const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
      const statusEffectList = [];
      for (const item of deletableList) {
        const findCartData = await CATModel.findOne({
          where: { id: item.id, isDelete: 0 },
          transaction,
        });
        if (!findCartData) continue;
        if (findCartData.dataValues.referance_cart_id && findCartData.dataValues.reference_type) {
          statusEffectList.push({ target_id: findCartData.dataValues.referance_cart_id, type: findCartData.dataValues.reference_type })
        }
        await CATModel.update({ isDelete: 1 }, { where: { id: item.id, isDelete: 0 }, transaction });
        await CATItemModel.update({ isDelete: 1 }, { where: { cart_id: item.id, isDelete: 0 }, transaction });

        if ([3, 4, 6, 7].includes(Number(cart_type))) {
          await AccountTransctionModel.update(
            { isDelete: 1 },
            { where: { reference_id: item.id, isDelete: 0, reference_table: "carts" }, transaction }
          );
        }

        const username = await usernameLiteral(findCartData.dataValues.a_application_login_id);
        await CBTMSGHistory.create(
          {
            contact_masters_id: findCartData.dataValues.to_customer_id,
            a_application_login_id,
            company_masters_id: findCompanyId.company_masters_id,
            msg_cart_id: findCartData.dataValues.id,
            description: `
              <b>${orderTypesShowList?.find((o) => Number(o.id) === Number(findCartData?.dataValues?.type))?.type || "Unknown"}</b><br>
              ${findCartData.dataValues.cart_number ? `#${findCartData.dataValues.cart_number}` : "#XXXXXXXX"}<br>
              <b>${findCartData.dataValues.grand_total && findCartData.dataValues.type != 9 && findCartData.dataValues.type != 8
                ? `${findCartData.dataValues.grand_total} ${symbolCurrency || ""}` : ""
              }</b><br>
              <p><b>Created By:</b> ${username} (${formatDateAndTimeCreateDateTime(findCartData.dataValues.created_date_time)})</p>
              <p><b>Deleted By:</b> ${approveBy} (${formatDateAndTimeCreateDateTime(formattedDateTime)})</p>
            `,
            created_date_time: formattedDateTime,
            message_side: 1,
            message_type_id: 2,
            application_login_name: username,
          },
          { transaction }
        );
      }

      await transaction.commit();

      // status update
      for (const v of statusEffectList) {
        await updateCartStatus(req, { target_id: v.target_id, type: v.type, a_application_login_id })
      }
      return resSuccess({
        ack_msg: `${deletableList.length} order deleted successfully`,
        data: { deletedCount: deletableList.length, skippedCount: blockedList.length },
      });
    } catch (error) {
      await transaction.rollback();
      return resBadRequest({ developer_msg: error.message });
    }
  }

  return resBadRequest({ developer_msg: "Invalid action. Use 'check' or 'delete'." });
};