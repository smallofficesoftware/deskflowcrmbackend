import { Op, Sequelize, fn, col as sequelizeCol } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { buildSearchQuery } from "../../../helpers/searchAlgoV1.js";
import { cartItemModel } from "../../../models/activities/cartItemsModel.js";
import { cartModel } from "../../../models/activities/cartsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { customFieldFormModel } from "../../../models/other_settings/customFieldFormModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const getTeamAllCarts = async (req) => {
  try {
    const type = req.body.type || 1;
    const selectedDates = req.body.selectedDates || [];
    // const selectedDates = [];
    const selectedTeamMembers = req.body.selectedTeamMembers || [];
    const selectedStageStatus = req.body.selectedStageStatus || [];
    const selectedSeries = req.body.selectedSeries || [];
    const globalSearch = req.body.globalSearch?.trim() || "";
    const selectedContactId = req.body.selectedContactId || "";
    const selectedProduct = req.body.selectedProduct || "";
    const selectedCategory = req.body.selectedCategory || "";
    const referenceWiseContact = req.body.referenceWiseContact || "";
    const selectedGstOptions = req.body.selectedGstOptions || [];
    const selectedTrasactionModeOptions = req.body.selectedTrasactionModeOptions || null;
    const { ll, ul } = req.body;
    const offset = ul
    const limit = ll

    // Date filter
    let dateFilter = {};
    if (selectedDates.length === 2) {
      const startDate = new Date(selectedDates[0]);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDates[1]);
      endDate.setHours(23, 59, 59, 999);

      dateFilter = {
        created_date_time: {
          [Op.between]: [startDate, endDate],
        },
      };
    }

    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);

    // Page ID mapping
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
      12: PAGE_ID.PROFORMA_INVOICE_REPORT,
    };
    const pageID = pageIdMap[type] || PAGE_ID.QUOTATION_REPORT;

    // Global search condition
    let fullTextSearchCondition = {};
    let relevanceOrder;
    if (globalSearch) {
      const cartColumns = Object.keys(cartModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = cartModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        globalSearch,
        cartColumns
      );
      relevanceOrder = relevanceSearchOrder
      fullTextSearchCondition = searchClause;
    }

    // User rights check
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: req.body.a_application_login_id,
      page_id: pageID,
      tenentId: req.tenantDB
    });

    let whereClause = { isDelete: 0 };

    if (showAllData) {
      whereClause = { company_masters_id: findCompanyId.company_masters_id };
    } else if (showPersonalData) {
      whereClause = { a_application_login_id: req.body.a_application_login_id };
    }

    // Stage status filter
    const whereForCart = {
      [Op.and]: []
    };
    if (Array.isArray(selectedStageStatus) && selectedStageStatus.length > 0) {
      const stageStatusCsv = selectedStageStatus
        .map(id => String(id).trim())
        .filter(id => /^-?\d+$/.test(id))
        .join(',');

      if (stageStatusCsv) {
        whereForCart[Op.and].push(
          Sequelize.literal(`FIND_IN_SET(cart_status, '${stageStatusCsv}')`)
        );
      }

    }

    if (Array.isArray(selectedGstOptions) && selectedGstOptions.length > 0) {
      const gstOptions = selectedGstOptions.map(Number);
      const gstConditions = [];

      // With GST
      if (gstOptions.includes(1)) {
        gstConditions.push({
          gst_amt: {
            [Op.gt]: 0,
          },
        });
      }

      // Without GST
      if (gstOptions.includes(2)) {
        gstConditions.push({
          gst_amt: {
            [Op.lte]: 0,
          },
        });
      }

      if (gstConditions.length === 1) {
        Object.assign(whereForCart, gstConditions[0]);
      } else if (gstConditions.length > 1) {
        whereForCart[Op.or] = gstConditions;
      }
    }

    if (selectedTrasactionModeOptions == 1) {
      whereForCart.transaction_mode = 1;
    } else if (selectedTrasactionModeOptions == 2) {
      whereForCart.transaction_mode = 2;
    }
    const CartItem = cartItemModel(req.tenantDB);

    let andConditions = [];
    let cartIdsFromItems = null;

    if (selectedProduct?.value || selectedCategory?.value) {
      const itemWhere = { isDelete: 0 };
      const itemAnd = [];

      if (selectedProduct?.value) {
        itemAnd.push(
          Sequelize.literal(`FIND_IN_SET('${selectedProduct.value}', item_product_id)`)
        );
      }
      if (selectedCategory?.value) {
        itemAnd.push(
          Sequelize.literal(`FIND_IN_SET('${selectedCategory.value}', item_category_id)`)
        );
      }
      if (itemAnd.length) itemWhere[Op.and] = itemAnd;

      const matchingItems = await CartItem.findAll({
        where: itemWhere,
        attributes: ["cart_id"],
        raw: true,
      });

      cartIdsFromItems = [...new Set(matchingItems.map(i => i.cart_id))];
    }

    if (Array.isArray(selectedSeries) && selectedSeries.length > 0) {
      const seriesCsv = selectedSeries
        .map(id => String(id).trim())
        .join(',');

      if (seriesCsv) {
        whereForCart[Op.and].push(
          Sequelize.literal(`FIND_IN_SET(sr_by_prifix, '${seriesCsv}')`)
        );
      }
    }
    let contactCondition = {};

    if (selectedContactId && referenceWiseContact == 1) {
      contactCondition = {
        to_customer_id: selectedContactId,
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
        to_customer_id: {
          [Op.in]: contactIds,
        },
      };
    }
    // Team members filter
    if (selectedTeamMembers.length > 0) {

      whereClause.a_application_login_id = { [Op.in]: selectedTeamMembers };
    }

    const companyVsApplicationLoginResult = await companyVsApplicationLoginModel.findAll({
      where: whereClause,
      attributes: ["a_application_login_id"],
      raw: true,
    });

    // Form type mapping for custom fields
    const formTypeMap = {
      1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 12, 9: 13,
    };
    const formType = formTypeMap[type] || 5;

    // Get company currency
    const companyCurrency = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: { id: companyCurrency?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol", "short_name"],
    });

    // Models
    const Cart = cartModel(req.tenantDB);
    const CustomField = customFieldFormModel(req.tenantDB);
    const StageStatus = stagestatusModel(req.tenantDB);
    const Contact = contactModel(req.tenantDB);

    // Collect ALL carts from all team members
    let allCartsWithUser = [];
    /* Sorting and ordering */
    const order = [["sr_by_number", "DESC"], ["id", "DESC"]];
    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }

    if (whereForCart[Op.and].length === 0) {
      delete whereForCart[Op.and];
    }
    await Promise.all(
      companyVsApplicationLoginResult.map(async (user) => {
        const login = await loginModel.findOne({
          where: { id: user.a_application_login_id, isDelete: 0 },
          attributes: ["username"],
          raw: true,
        });

        const username = login?.username || "Unknown";
        console.log("-------------TeamReport------------")
        const carts = await Cart.findAll({
          where: {
            isDelete: 0,
            a_application_login_id: user.a_application_login_id,
            type: type,
            ...dateFilter,
            ...whereForCart,
            ...fullTextSearchCondition,
            ...contactCondition,
            ...(cartIdsFromItems !== null ? { id: { [Op.in]: cartIdsFromItems } } : {})
          },
          order,
          // limit: Number(limit),
          // offset: Number(offset),
          attributes: { exclude: [] },
          raw: true,
        });

        const processed = await Promise.all(
          carts.map(async (cart) => {
            // Status name & color
            const status = cart.cart_status ? await StageStatus.findOne({
              where: { id: cart.cart_status, isDelete: 0 },
              attributes: ["name", "color"],
              raw: true,
            }) : null;

            // const is_approve = cart.sr_by_number > 0 ? {
            const is_approve = cart.cart_number != '' ? {
              name: "Approved", bg_color: "#06cf9c",
              border_color: "#06cf9c",
              text_color: "black"
            } : {
              name: "Draft", bg_color: "#eeeeee",
              border_color: "rgb(207, 207, 207)",
              text_color: "black"
            }
            const contact = await Contact.findOne({
              where: {
                id: cart.to_customer_id,
                isDelete: 0
              },
              attributes: ["gst_number"],
              raw: true
            });

            const grand_total_sum = cart.grand_total ? `${Number(
              cart.conversion_rate > 0
                ? cart.grand_total * cart.conversion_rate
                : cart.grand_total
            ).toFixed(2)}` : "0.00"

            const taxable_amt_sum = cart.taxable_amt ? `${Number(
              cart.conversion_rate > 0
                ? cart.taxable_amt * cart.conversion_rate
                : cart.taxable_amt
            ).toFixed(2)}` : "0.00"

            const gst_amt_sum = cart.gst_amt ? `${Number(
              cart.conversion_rate > 0
                ? cart.gst_amt * cart.conversion_rate
                : cart.gst_amt
            ).toFixed(2)}` : "0.00"

            const tcs_amt_sum = cart.tcs_amt ? `${Number(
              cart.conversion_rate > 0
                ? cart.tcs_amt * cart.conversion_rate
                : cart.tcs_amt
            ).toFixed(2)}` : "0.00"

            const round_off_sum = cart.round_off ? `${Number(
              cart.conversion_rate > 0
                ? cart.round_off * cart.conversion_rate
                : cart.round_off
            ).toFixed(2)}` : "0.00"

            // Custom fields
            const customFields = await CustomField.findAll({
              where: {
                form_type: formType,
                isDelete: 0,
                report_print_or_not: 1,
                data_type: { [Op.notIn]: [11, 12] },
              },
              raw: true,
            });

            // Duplicate check (request_flag === 1)
            if (req.body.request_flag === 1) {

              const itemsInCart = await CartItem.findAll({
                where: { cart_id: cart.id, isDelete: 0 },
                attributes: ["item_product_id", [fn("SUM", sequelizeCol("item_qty")), "item_qty"]],
                group: ["item_product_id"],
                raw: true,
              });

              const itemsInReference = await CartItem.findAll({
                where: { referance_cart_id: cart.id, isDelete: 0, stock_type: { [Op.ne]: 0 } },
                attributes: ["item_product_id", [fn("SUM", sequelizeCol("item_qty")), "item_qty"]],
                group: ["item_product_id"],
                raw: true,
              });



              const mapQty = (arr) => arr.reduce((acc, i) => ({ ...acc, [i.item_product_id]: Number(i.item_qty) }), {});

              const qty1 = mapQty(itemsInCart);
              const qty2 = mapQty(itemsInReference);

              const allIds = new Set([...Object.keys(qty1), ...Object.keys(qty2)]);
              const isDuplicate = [...allIds].every(id => qty1[id] === qty2[id]);

              if (isDuplicate) return null; // Skip duplicate
            }
            // Map custom field values
            const customFieldValues = {};

            customFields.forEach((field) => {
              const key = field.reference_column_name;
              customFieldValues[key] = cart[key] ?? null;
            });
            const cartItems = await CartItem.findAll({
              where: {
                cart_id: cart.id,
                isDelete: 0
              },
              attributes: [
                "item_product_id",
                "item_product_name",
                "item_product_code",
                "item_rate",
                [fn("SUM", sequelizeCol("item_qty")), "item_qty"]
              ],
              group: ["item_product_id", "item_product_name", "item_product_code", "item_rate"],
              raw: true,
            });
            return {
              id: cart.id,
              cart_number: cart.cart_number,
              sr_by_number: cart.sr_by_number,
              username: username,
              customer_name: cart.customer_name || "",
              items: cartItems,
              transaction_mode: cart.transaction_mode,
              grand_total: (grand_total_sum > 0 ? `${currency?.symbol || ""} ${grand_total_sum}` : `${grand_total_sum}`),
              grand_total_wo_c: `${grand_total_sum}`,
              taxable_amt: (taxable_amt_sum > 0 ? `${currency?.symbol || ""} ${taxable_amt_sum}` : `${taxable_amt_sum}`),
              taxable_amt_wo_c: `${taxable_amt_sum}`,
              gst_amt: (gst_amt_sum > 0 ? `${currency?.symbol || ""} ${gst_amt_sum}` : `${gst_amt_sum}`),
              gst_amt_wo_c: `${gst_amt_sum}`,
              tcs_amt: (tcs_amt_sum > 0 ? `${currency?.symbol || ""} ${tcs_amt_sum}` : `${tcs_amt_sum}`),
              tcs_amt_wo_c: `${tcs_amt_sum}`,
              round_off: (round_off_sum > 0 ? `${currency?.symbol || ""} ${round_off_sum}` : `${round_off_sum}`),
              round_off_wo_c: `${round_off_sum}`,
              created_date_time: cart.created_date_time,
              cart_status: status?.name,
              status_colour: status?.color,
              statusDetails: status || { name: "-", color: "" },
              customForm: customFields,
              ...customFieldValues,
              to_customer_company_name: cart.to_customer_company_name,
              to_customer_id: cart.to_customer_id,
              to_customer_name: cart.to_customer_name,
              to_customer_phone: cart.to_customer_phone,
              gst_number: contact?.gst_number || "",
              update_Date_time: cart.update_Date_time,
              is_approve: is_approve
              // Add more fields if needed: reference_no, remarks, etc.
            };
          })
        );

        // Add only valid carts
        allCartsWithUser.push(...processed.filter(c => c !== null));
      })
    );

    // Final sort by sr_by_number (in case multiple users have same sr_by_number)
    allCartsWithUser.sort((a, b) => b.sr_by_number - a.sr_by_number);

    // Apply pagination
    const total = allCartsWithUser.length;
    const paginatedData = allCartsWithUser.slice(ul, ul + ll);

    // Type names
    const types = {
      "1": "Quotation",
      "2": "Order",
      "3": "Sell Invoice",
      "4": "Purchase Invoice",
      "5": "Purchase Order",
      "6": "Return Sales Invoice",
      "7": "Return Purchase Invoice",
      "8": "Inward",
      "9": "Dispatch",
      "12": "Proforma Invoice "
    };

    return resSuccess({
      data: {
        item: paginatedData,
        total: total,
        currency_name: currency?.short_name || ""
      },
      ack_msg: `Team ${types[type] || "Report"} fetched successfully`,
    });

  } catch (e) {
    console.error("Error in getTeamAllCarts:", e);
    return resSuccess({
      data: { item: [], total: 0, currency_name: "" },
      ack_msg: "Something went wrong",
      ack: 0,
    });
  }
};


export const OrderDetailsProductIteamWise = async (req) => {
  try {
    const type = req.body.type || 1;
    const selectedDates = req.body.selectedDates || [];
    // const selectedDates = [];
    const selectedTeamMembers = req.body.selectedTeamMembers || [];
    const selectedStageStatus = req.body.selectedStageStatus || [];
    const selectedSeries = req.body.selectedSeries || [];
    const globalSearch = req.body.globalSearch?.trim() || "";
    const selectedContactId = req.body.selectedContactId || "";
    const { ll, ul } = req.body;
    const offset = ul
    const limit = ll

    // Date filter
    let dateFilter = {};
    if (selectedDates.length === 2) {
      const startDate = new Date(selectedDates[0]);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDates[1]);
      endDate.setHours(23, 59, 59, 999);

      dateFilter = {
        created_date_time: {
          [Op.between]: [startDate, endDate],
        },
      };
    }

    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);

    // Page ID mapping
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
    const pageID = pageIdMap[type] || PAGE_ID.QUOTATION_REPORT;

    // Global search condition
    let fullTextSearchCondition = {};
    let relevanceOrder;
    if (globalSearch) {
      const cartColumns = Object.keys(cartModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = cartModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        globalSearch,
        cartColumns
      );
      relevanceOrder = relevanceSearchOrder
      fullTextSearchCondition = searchClause;
    }

    // User rights check
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: req.body.a_application_login_id,
      page_id: pageID,
      tenentId: req.tenantDB
    });

    let whereClause = { isDelete: 0 };

    if (showAllData) {
      whereClause = { company_masters_id: findCompanyId.company_masters_id };
    } else if (showPersonalData) {
      whereClause = { a_application_login_id: req.body.a_application_login_id };
    }

    // Stage status filter
    const whereForCart = {};
    if (Array.isArray(selectedStageStatus) && selectedStageStatus.length > 0) {
      const stageStatusCsv = selectedStageStatus
        .map(id => String(id).trim())
        .filter(id => /^-?\d+$/.test(id))
        .join(',');

      if (stageStatusCsv) {
        whereForCart[Op.and] = [
          Sequelize.literal(`FIND_IN_SET(cart_status, '${stageStatusCsv}')`)
        ];
      }
    }

    if (Array.isArray(selectedSeries) && selectedSeries.length > 0) {
      const seriesCsv = selectedSeries
        .map(id => String(id).trim())
        .join(',');

      if (seriesCsv) {
        whereForCart[Op.and] = [
          Sequelize.literal(`FIND_IN_SET(sr_by_prifix, '${seriesCsv}')`)
        ];
      }
    }
    let contactCondition = {};
    if (selectedContactId) {
      contactCondition = {
        to_customer_id: selectedContactId
      };
    }
    // Team members filter
    if (selectedTeamMembers.length > 0) {

      whereClause.a_application_login_id = { [Op.in]: selectedTeamMembers };
    }

    const companyVsApplicationLoginResult = await companyVsApplicationLoginModel.findAll({
      where: whereClause,
      attributes: ["a_application_login_id"],
      raw: true,
    });

    // Form type mapping for custom fields
    const formTypeMap = {
      1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 12, 9: 13,
    };
    const formType = formTypeMap[type] || 5;

    // Get company currency
    const companyCurrency = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: { id: companyCurrency?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol", "short_name"],
    });

    // Models
    const Cart = cartModel(req.tenantDB);
    const CartItem = cartItemModel(req.tenantDB);
    const CustomField = customFieldFormModel(req.tenantDB);
    const StageStatus = stagestatusModel(req.tenantDB);

    // Collect ALL carts from all team members
    let allCartsWithUser = [];
    /* Sorting and ordering */
    const order = [["sr_by_number", "DESC"], ["id", "DESC"]];
    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }
    await Promise.all(
      companyVsApplicationLoginResult.map(async (user) => {
        const login = await loginModel.findOne({
          where: { id: user.a_application_login_id, isDelete: 0 },
          attributes: ["username"],
          raw: true,
        });

        const username = login?.username || "Unknown";
        console.log("-------------TeamReport------------")
        const carts = await Cart.findAll({
          where: {
            isDelete: 0,
            a_application_login_id: user.a_application_login_id,
            type: type,
            ...dateFilter,
            ...whereForCart,
            ...fullTextSearchCondition,
            ...contactCondition
          },
          order,
          // limit: Number(limit),
          // offset: Number(offset),
          attributes: { exclude: [] },
          raw: true,
        });

        const processed = await Promise.all(
          carts.map(async (cart) => {
            // Status name & color
            const status = cart.cart_status ? await StageStatus.findOne({
              where: { id: cart.cart_status, isDelete: 0 },
              attributes: ["name", "color"],
              raw: true,
            }) : null;

            // const is_approve = cart.sr_by_number > 0 ? {
            const is_approve = cart.cart_number != '' ? {
              name: "Approved", bg_color: "#06cf9c",
              border_color: "#06cf9c",
              text_color: "black"
            } : {
              name: "Draft", bg_color: "#eeeeee",
              border_color: "rgb(207, 207, 207)",
              text_color: "black"
            }

            const grand_total_sum = cart.grand_total ? `${Number(
              cart.conversion_rate > 0
                ? cart.grand_total * cart.conversion_rate
                : cart.grand_total
            ).toFixed(2)}` : "0.00"

            const taxable_amt_sum = cart.taxable_amt ? `${Number(
              cart.conversion_rate > 0
                ? cart.taxable_amt * cart.conversion_rate
                : cart.taxable_amt
            ).toFixed(2)}` : "0.00"

            const gst_amt_sum = cart.gst_amt ? `${Number(
              cart.conversion_rate > 0
                ? cart.gst_amt * cart.conversion_rate
                : cart.gst_amt
            ).toFixed(2)}` : "0.00"

            const tcs_amt_sum = cart.tcs_amt ? `${Number(
              cart.conversion_rate > 0
                ? cart.tcs_amt * cart.conversion_rate
                : cart.tcs_amt
            ).toFixed(2)}` : "0.00"

            const round_off_sum = cart.round_off ? `${Number(
              cart.conversion_rate > 0
                ? cart.round_off * cart.conversion_rate
                : cart.round_off
            ).toFixed(2)}` : "0.00"

            // Custom fields
            const customFields = await CustomField.findAll({
              where: {
                form_type: formType,
                isDelete: 0,
                report_print_or_not: 1,
                data_type: { [Op.notIn]: [11, 12] },
              },
              raw: true,
            });

            // Duplicate check (request_flag === 1)
            if (req.body.request_flag === 1) {

              const itemsInCart = await CartItem.findAll({
                where: { cart_id: cart.id, isDelete: 0 },
                attributes: ["item_product_id", [fn("SUM", sequelizeCol("item_qty")), "item_qty"]],
                group: ["item_product_id"],
                raw: true,
              });

              const itemsInReference = await CartItem.findAll({
                where: { referance_cart_id: cart.id, isDelete: 0, stock_type: { [Op.ne]: 0 } },
                attributes: ["item_product_id", [fn("SUM", sequelizeCol("item_qty")), "item_qty"]],
                group: ["item_product_id"],
                raw: true,
              });



              const mapQty = (arr) => arr.reduce((acc, i) => ({ ...acc, [i.item_product_id]: Number(i.item_qty) }), {});

              const qty1 = mapQty(itemsInCart);
              const qty2 = mapQty(itemsInReference);

              const allIds = new Set([...Object.keys(qty1), ...Object.keys(qty2)]);
              const isDuplicate = [...allIds].every(id => qty1[id] === qty2[id]);

              if (isDuplicate) return null; // Skip duplicate
            }
            // Map custom field values
            const customFieldValues = {};

            customFields.forEach((field) => {
              const key = field.reference_column_name;
              customFieldValues[key] = cart[key] ?? null;
            });
            const cartItems = await CartItem.findAll({
              where: {
                cart_id: cart.id,
                isDelete: 0
              },
              attributes: [
                "item_product_id",
                "item_product_name",
                "item_product_code",
                [fn("SUM", sequelizeCol("item_qty")), "item_qty"]
              ],
              group: ["item_product_id", "item_product_name", "item_product_code"],
              raw: true,
            });
            return {
              id: cart.id,
              cart_number: cart.cart_number,
              sr_by_number: cart.sr_by_number,
              username: username,
              customer_name: cart.customer_name || "",
              items: cartItems,
              grand_total: (grand_total_sum > 0 ? `${currency?.symbol || ""} ${grand_total_sum}` : `${grand_total_sum}`),
              grand_total_wo_c: `${grand_total_sum}`,
              taxable_amt: (taxable_amt_sum > 0 ? `${currency?.symbol || ""} ${taxable_amt_sum}` : `${taxable_amt_sum}`),
              taxable_amt_wo_c: `${taxable_amt_sum}`,
              gst_amt: (gst_amt_sum > 0 ? `${currency?.symbol || ""} ${gst_amt_sum}` : `${gst_amt_sum}`),
              gst_amt_wo_c: `${gst_amt_sum}`,
              tcs_amt: (tcs_amt_sum > 0 ? `${currency?.symbol || ""} ${tcs_amt_sum}` : `${tcs_amt_sum}`),
              tcs_amt_wo_c: `${tcs_amt_sum}`,
              round_off: (round_off_sum > 0 ? `${currency?.symbol || ""} ${round_off_sum}` : `${round_off_sum}`),
              round_off_wo_c: `${round_off_sum}`,
              created_date_time: cart.created_date_time,
              cart_status: status?.name,
              status_colour: status?.color,
              statusDetails: status || { name: "-", color: "" },
              customForm: customFields,
              ...customFieldValues,
              to_customer_company_name: cart.to_customer_company_name,
              to_customer_name: cart.to_customer_name,
              to_customer_phone: cart.to_customer_phone,
              update_Date_time: cart.update_Date_time,
              is_approve: is_approve
              // Add more fields if needed: reference_no, remarks, etc.
            };
          })
        );

        // Add only valid carts
        allCartsWithUser.push(...processed.filter(c => c !== null));
      })
    );

    // Final sort by sr_by_number (in case multiple users have same sr_by_number)
    allCartsWithUser.sort((a, b) => b.sr_by_number - a.sr_by_number);

    // Apply pagination
    const total = allCartsWithUser.length;
    const paginatedData = allCartsWithUser.slice(ul, ul + ll);

    // Type names
    const types = {
      "1": "Quotation",
      "2": "Order",
      "3": "Sell Invoice",
      "4": "Purchase Invoice",
      "5": "Purchase Order",
      "6": "Return Sales Invoice",
      "7": "Return Purchase Invoice",
      "8": "Inward",
      "9": "Dispatch",
    };

    return resSuccess({
      data: {
        item: paginatedData,
        total: total,
        currency_name: currency?.short_name || ""
      },
      ack_msg: `Team ${types[type] || "Report"} fetched successfully`,
    });

  } catch (e) {
    console.error("Error in getTeamAllCarts:", e);
    return resSuccess({
      data: { item: [], total: 0, currency_name: "" },
      ack_msg: "Something went wrong",
      ack: 0,
    });
  }
}



export const getDailySalesInvoiceReport = async (req) => {
  try {
    const type = req.body.type || 1;
    const selectedDates = req.body.selectedDates || [];
    // const selectedDates = [];
    const selectedTeamMembers = req.body.selectedTeamMembers || [];
    const selectedStageStatus = req.body.selectedStageStatus || [];
    const selectedSeries = req.body.selectedSeries || [];
    const globalSearch = req.body.globalSearch?.trim() || "";
    const selectedContactId = req.body.selectedContactId || "";
    const referenceWiseContact = req.body.referenceWiseContact || "";
    const { ll, ul } = req.body;
    const offset = ul
    const limit = ll

    // Date filter
    let dateFilter = {};
    if (selectedDates.length === 2) {
      const startDate = new Date(selectedDates[0]);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDates[1]);
      endDate.setHours(23, 59, 59, 999);

      dateFilter = {
        created_date_time: {
          [Op.between]: [startDate, endDate],
        },
      };
    }

    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);

    // Page ID mapping
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
    const pageID = pageIdMap[type] || PAGE_ID.QUOTATION_REPORT;

    // Global search condition
    let fullTextSearchCondition = {};
    let relevanceOrder;
    if (globalSearch) {
      const cartColumns = Object.keys(cartModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = cartModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const { searchClause, relevanceSearchOrder } = buildSearchQuery(
        globalSearch,
        cartColumns
      );
      relevanceOrder = relevanceSearchOrder
      fullTextSearchCondition = searchClause;
    }

    // User rights check
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: req.body.a_application_login_id,
      page_id: pageID,
      tenentId: req.tenantDB
    });

    let whereClause = { isDelete: 0 };

    if (showAllData) {
      whereClause = { company_masters_id: findCompanyId.company_masters_id };
    } else if (showPersonalData) {
      whereClause = { a_application_login_id: req.body.a_application_login_id };
    }

    // Stage status filter
    const whereForCart = {};
    if (Array.isArray(selectedStageStatus) && selectedStageStatus.length > 0) {
      const stageStatusCsv = selectedStageStatus
        .map(id => String(id).trim())
        .filter(id => /^-?\d+$/.test(id))
        .join(',');

      if (stageStatusCsv) {
        whereForCart[Op.and] = [
          Sequelize.literal(`FIND_IN_SET(cart_status, '${stageStatusCsv}')`)
        ];
      }
    }

    if (Array.isArray(selectedSeries) && selectedSeries.length > 0) {
      const seriesCsv = selectedSeries
        .map(id => String(id).trim())
        .join(',');

      if (seriesCsv) {
        whereForCart[Op.and] = [
          Sequelize.literal(`FIND_IN_SET(sr_by_prifix, '${seriesCsv}')`)
        ];
      }
    }
    let contactCondition = {};

    if (selectedContactId && referenceWiseContact == 1) {
      contactCondition = {
        to_customer_id: selectedContactId,
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
        to_customer_id: {
          [Op.in]: contactIds,
        },
      };
    }
    // Team members filter
    if (selectedTeamMembers.length > 0) {

      whereClause.a_application_login_id = { [Op.in]: selectedTeamMembers };
    }

    const companyVsApplicationLoginResult = await companyVsApplicationLoginModel.findAll({
      where: whereClause,
      attributes: ["a_application_login_id"],
      raw: true,
    });

    // Form type mapping for custom fields
    const formTypeMap = {
      1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11, 8: 12, 9: 13,
    };
    const formType = formTypeMap[type] || 5;

    // Get company currency
    const companyCurrency = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: { id: companyCurrency?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol", "short_name"],
    });

    // Models
    const Cart = cartModel(req.tenantDB);
    const CartItem = cartItemModel(req.tenantDB);
    const CustomField = customFieldFormModel(req.tenantDB);
    const StageStatus = stagestatusModel(req.tenantDB);

    // Collect ALL carts from all team members
    let allCartsWithUser = [];
    /* Sorting and ordering */
    const order = [["sr_by_number", "DESC"], ["id", "DESC"]];
    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }
    await Promise.all(
      companyVsApplicationLoginResult.map(async (user) => {
        const login = await loginModel.findOne({
          where: { id: user.a_application_login_id, isDelete: 0 },
          attributes: ["username"],
          raw: true,
        });

        const username = login?.username || "Unknown";
        console.log("-------------TeamReportdaily------------")
        const carts = await Cart.findAll({
          where: {
            isDelete: 0,
            a_application_login_id: user.a_application_login_id,
            type: type,
            ...dateFilter,
            ...whereForCart,
            ...fullTextSearchCondition,
            ...contactCondition
          },
          order,
          // limit: Number(limit),
          // offset: Number(offset),
          attributes: { exclude: [] },
          raw: true,
        });
        console.log("cartscartscartscartscartscartscartscarts", carts);

        const processed = await Promise.all(
          carts.map(async (cart) => {
            // Status name & color
            const status = cart.cart_status ? await StageStatus.findOne({
              where: { id: cart.cart_status, isDelete: 0 },
              attributes: ["name", "color"],
              raw: true,
            }) : null;

            const is_approve = cart.cart_number != '' ? {
              name: "Approved",
              bg_color: "#06cf9c",
              border_color: "#06cf9c",
              text_color: "black"
            } : {
              name: "Draft",
              bg_color: "#eeeeee",
              border_color: "rgb(207, 207, 207)",
              text_color: "black"
            };

            const advance_payment = cart.advance_payment ? Number(cart.advance_payment) : 0;

            // Grand Total with conversion rate
            const grand_total_raw = cart.grand_total
              ? Number(cart.conversion_rate > 0
                ? cart.grand_total * cart.conversion_rate
                : cart.grand_total)
              : 0;

            const grand_total_sum = grand_total_raw.toFixed(2);

            // Payable Amount = Grand Total - Advance Payment
            const payable_amount_raw = Math.max(0, grand_total_raw - advance_payment); // prevent negative
            const payable_amount_sum = payable_amount_raw.toFixed(2);

            const taxable_amt_sum = cart.taxable_amt
              ? Number(cart.conversion_rate > 0
                ? cart.taxable_amt * cart.conversion_rate
                : cart.taxable_amt).toFixed(2)
              : "0.00";

            const gst_amt_sum = cart.gst_amt
              ? Number(cart.conversion_rate > 0
                ? cart.gst_amt * cart.conversion_rate
                : cart.gst_amt).toFixed(2)
              : "0.00";

            const tcs_amt_sum = cart.tcs_amt
              ? Number(cart.conversion_rate > 0
                ? cart.tcs_amt * cart.conversion_rate
                : cart.tcs_amt).toFixed(2)
              : "0.00";

            const round_off_sum = cart.round_off
              ? Number(cart.conversion_rate > 0
                ? cart.round_off * cart.conversion_rate
                : cart.round_off).toFixed(2)
              : "0.00";

            // Custom fields...
            const customFields = await CustomField.findAll({
              where: {
                form_type: formType,
                isDelete: 0,
                report_print_or_not: 1,
                data_type: { [Op.notIn]: [11, 12] },
              },
              raw: true,
            });

            // Duplicate check (request_flag === 1)
            if (req.body.request_flag === 1) {
              const itemsInCart = await CartItem.findAll({
                where: { cart_id: cart.id, isDelete: 0 },
                attributes: ["item_product_id", [fn("SUM", sequelizeCol("item_qty")), "item_qty"]],
                group: ["item_product_id"],
                raw: true,
              });

              const itemsInReference = await CartItem.findAll({
                where: { referance_cart_id: cart.id, isDelete: 0, stock_type: { [Op.ne]: 0 } },
                attributes: ["item_product_id", [fn("SUM", sequelizeCol("item_qty")), "item_qty"]],
                group: ["item_product_id"],
                raw: true,
              });

              const mapQty = (arr) => arr.reduce((acc, i) => ({ ...acc, [i.item_product_id]: Number(i.item_qty) }), {});

              const qty1 = mapQty(itemsInCart);
              const qty2 = mapQty(itemsInReference);

              const allIds = new Set([...Object.keys(qty1), ...Object.keys(qty2)]);
              const isDuplicate = [...allIds].every(id => qty1[id] === qty2[id]);

              if (isDuplicate) return null; // Skip duplicate
            }

            // Map custom field values
            const customFieldValues = {};
            customFields.forEach((field) => {
              const key = field.reference_column_name;
              customFieldValues[key] = cart[key] ?? null;
            });

            const cartItems = await CartItem.findAll({
              where: {
                cart_id: cart.id,
                isDelete: 0
              },
              attributes: [
                "item_product_id",
                "item_product_name",
                "item_product_code",
                "item_rate",
                [fn("SUM", sequelizeCol("item_qty")), "item_qty"]
              ],
              group: ["item_product_id", "item_product_name", "item_product_code", "item_rate"],
              raw: true,
            });

            return {
              id: cart.id,

              cart_details: {
                cart_number: cart.cart_number,
                sr_by_number: cart.sr_by_number,
                username: username,

                grand_total: (grand_total_raw > 0 ? `${currency?.symbol || ""} ${grand_total_sum}` : `${grand_total_sum}`),
                adv_payment: (advance_payment > 0 ? `${currency?.symbol || ""} ${advance_payment.toFixed(2)}` : `${advance_payment.toFixed(2)}`),
                grand_total_wo_c: `${grand_total_sum}`,

                // ✅ NEW: Payable Amount (Grand Total - Advance Payment)
                payable_amount: (payable_amount_raw > 0 ? `${currency?.symbol || ""} ${payable_amount_sum}` : `${payable_amount_sum}`),
                payable_amount_wo_c: `${payable_amount_sum}`,

                taxable_amt: (taxable_amt_sum > 0 ? `${currency?.symbol || ""} ${taxable_amt_sum}` : `${taxable_amt_sum}`),
                taxable_amt_wo_c: `${taxable_amt_sum}`,

                gst_amt: (gst_amt_sum > 0 ? `${currency?.symbol || ""} ${gst_amt_sum}` : `${gst_amt_sum}`),
                gst_amt_wo_c: `${gst_amt_sum}`,

                tcs_amt: (tcs_amt_sum > 0 ? `${currency?.symbol || ""} ${tcs_amt_sum}` : `${tcs_amt_sum}`),
                tcs_amt_wo_c: `${tcs_amt_sum}`,

                round_off: (round_off_sum > 0 ? `${currency?.symbol || ""} ${round_off_sum}` : `${round_off_sum}`),
                round_off_wo_c: `${round_off_sum}`,

                created_date_time: cart.created_date_time,
                update_Date_time: cart.update_Date_time,

                cart_status: status?.name,
                status_colour: status?.color,
                statusDetails: status || { name: "-", color: "" },

                is_approve: is_approve
              },

              contact_details: {
                customer_name: cart.customer_name || "",
                to_customer_company_name: cart.to_customer_company_name,
                to_customer_name: cart.to_customer_name,
                to_customer_phone: cart.to_customer_phone,
              },

              product_items: cartItems,

              custom_fields: {
                fields: customFields,
                values: customFieldValues
              }
            };
          })
        );

        // Add only valid carts
        allCartsWithUser.push(...processed.filter(c => c !== null));
      })
    );

    // Final sort by sr_by_number (in case multiple users have same sr_by_number)
    allCartsWithUser.sort((a, b) => b.sr_by_number - a.sr_by_number);

    // Apply pagination
    const total = allCartsWithUser.length;
    const paginatedData = allCartsWithUser.slice(ul, ul + ll);

    // Type names
    const types = {
      "1": "Quotation",
      "2": "Order",
      "3": "Sell Invoice",
      "4": "Purchase Invoice",
      "5": "Purchase Order",
      "6": "Return Sales Invoice",
      "7": "Return Purchase Invoice",
      "8": "Inward",
      "9": "Dispatch",
    };

    return resSuccess({
      data: {
        item: paginatedData,
        total: total,
        currency_name: currency?.short_name || ""
      },
      ack_msg: `Team ${types[type] || "Report"} fetched successfully`,
    });

  } catch (e) {
    console.error("Error in getTeamAllCarts:", e);
    return resSuccess({
      data: { item: [], total: 0, currency_name: "" },
      ack_msg: "Something went wrong",
      ack: 0,
    });
  }
};

export const getGstInOutReport = async (req) => {
  try {
    const {
      a_application_login_id
    } = req.body
    const reportType = req.body.reportType || "IN";
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const cartType = reportType === "IN" ? 3 : 4;

    const Cart = cartModel(req.tenantDB);
    const Contact = contactModel(req.tenantDB);

    const companyCurrency = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["currency_id"],
    });

    const currency = await currencyModel.findOne({
      where: { id: companyCurrency?.currency_id, isDelete: 0 },
      attributes: ["id", "symbol", "short_name"],
    });

    const carts = await Cart.findAll({
      where: {
        isDelete: 0,
        type: cartType,
        gst_amt: { [Op.gt]: 0 },
        company_masters_id: findCompanyId.company_masters_id
      },
      attributes: [
        "id",
        "cart_number",
        "to_customer_name",
        "to_customer_id",
        "gst_amt",
        "created_date_time",
        "update_Date_time"
      ],
      order: [["id", "DESC"]],
      raw: true,
    });

    const finalData = await Promise.all(
      carts.map(async (cart) => {
        const contact = await Contact.findOne({
          where: { id: cart.to_customer_id, isDelete: 0 },
          attributes: ["gst_number"],
          raw: true
        });

        return {
          id: cart.id,
          cart_number: cart.cart_number,
          to_customer_name: cart.to_customer_name || "",
          gst_number: contact?.gst_number || "", // Customer GST number
          gst_amt: currency?.symbol ? `${currency.symbol} ${cart.gst_amt}` : `${cart.gst_amt}`,
          created_date_time: cart.created_date_time,
          update_Date_time: cart.update_Date_time,
        };
      })
    );

    return resSuccess({
      data: finalData,
      ack_msg: `GST ${reportType} data fetched successfully`,
      ack: 1
    });

  } catch (e) {
    console.error("Error in getGstInOutReport:", e);
    return resSuccess({
      data: [],
      ack_msg: "Something went wrong",
      ack: 0,
    });
  }
};

