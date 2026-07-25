

import { Op } from "sequelize";
import sequelize from "../../config/sequelize.js"; // Adjust path as necessary
import { accountTransactionsModel } from "../../models/activities/accountTransactionsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import {
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";
// import { sequelize } from "../config/sequelize.js"; // Ensure sequelize is imported correctly
import { getUserRights } from "../../helpers/rightsHelper.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getdataStatistics = async (req) => {
  try {
    const { contact_master_id, a_application_login_id } = req.body;

    if (!contact_master_id) {
      return resBadRequest({ ack_msg: "Missing contact_masters_id" });
    }


    const inquiries = sequelize.models.inquiries = inquiryModel(req.tenantDB);
    const account_transactions = sequelize.models.account_transactions = accountTransactionsModel(req.tenantDB);
    const reminder_messages = sequelize.models.reminder_messages = reminderMessagesModel(req.tenantDB);
    const getcart = sequelize.models.carts = cartModel(req.tenantDB);


    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const tenantDB = req.tenantDB;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.CONTACT,
      tenentId: req.tenantDB
    });


    let baseWhereClause = {};
    if (findCompanyId.company_flag === 1 || (findCompanyId.company_flag === 2 && showAllData)) {
      baseWhereClause.company_masters_id = findCompanyId.company_masters_id;
    } else if (findCompanyId.company_flag === 2 && showPersonalData) {
      baseWhereClause[Op.or] = [
        { a_application_login_id: a_application_login_id },

      ];
    }

    const inquiryCount = await inquiries.count({
      where: {
        contact_master_id: contact_master_id,
        ...baseWhereClause,
      },
    });


    const reminderCount = await reminder_messages.count({
      where: {
        contact_masters_id: contact_master_id,
        is_reminder_app_flag: 0,
        ...baseWhereClause,
      },
    });


    const transactionSums = await account_transactions.findAll({
      attributes: [
        'type',
        [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
      ],
      where: {
        contact_masters_id: contact_master_id,
        isActive: 1,
        isDelete: 0,
        ...baseWhereClause,
      },
      group: ['type'],
      raw: true,
    });

    let totalCredit = 0;
    let totalDebit = 0;

    transactionSums.forEach((item) => {
      if (item.type === 1) {
        totalCredit = parseFloat(item.total_amount);
      } else if (item.type === 2) {
        totalDebit = parseFloat(item.total_amount);
      }
    });


    const getCartStats = async (type) => {
      const result = await getcart.findAll({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('grand_total')), 'total'],
        ],
        where: {
          to_customer_id: contact_master_id,
          type: type,
          ...baseWhereClause,
        },
        raw: true,
      });
      return {
        count: parseInt(result[0]?.count) || 0,
        amount: parseFloat(result[0]?.total) || 0,
      };
    };

    const quotation = await getCartStats("1");
    const order = await getCartStats("2");
    const sell_invoice = await getCartStats("3");
    const purchase_invoice = await getCartStats("4");


    return resSuccess({
      data: {
        inquiryCount,
        reminderCount,
        totalCredit,
        totalDebit,
        quotation,
        order,
        sell_invoice,
        purchase_invoice,
      },
    });

  } catch (error) {
    console.error("error", error);
    return resBadRequest({ developer_msg: `error ${error.message}` });
  }
};


export const getallreport = async (req, res) => {
  try {
    const { contact_masters_id, end_date, a_application_login_id } = req.body;

    if (!contact_masters_id) {
      return resBadRequest({ ack_msg: "Missing contact_master_id" });
    }

    const carts = sequelize.models.carts = cartModel(req.tenantDB);
    const currentDate = end_date && !isNaN(new Date(end_date).getTime())
      ? new Date(end_date)
      : new Date();
    const currentYear = currentDate.getFullYear();
    const lastYear = currentYear - 1;
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();

    const dateRanges = {
      LY_MTD: { start: new Date(lastYear, currentMonth, 1), end: new Date(lastYear, currentMonth, currentDay) },
      CY_MTD: { start: new Date(currentYear, currentMonth, 1), end: currentDate },
      LY_LTD: { start: new Date(lastYear, 3, 1), end: new Date(lastYear, currentMonth, currentDay) },
      CY_LTD: { start: new Date(currentYear, 3, 1), end: currentDate },
      LY_YTD: { start: new Date(lastYear, 3, 1), end: new Date(currentYear, 2, 31) },
      CY_YTD: { start: new Date(currentYear, 3, 1), end: currentDate },
    };

    const entities = [
      { name: "Quotation", type: "1" },
      { name: "SalesOrder", type: "2" },
      { name: "SalesInvoice", type: "3" },
      { name: "PurchaseInvoice", type: "4" },
    ];

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.CONTACT,
      tenentId: req.tenantDB
    });



    const result = {};

    for (const entity of entities) {
      const metrics = {};
      for (const period of ["LY_MTD", "CY_MTD", "LY_LTD", "CY_LTD", "LY_YTD", "CY_YTD"]) {
        const startDate = dateRanges[period].start;
        const endDate = dateRanges[period].end;

        let whereClause = {
          to_customer_id: contact_masters_id,
          type: entity.type,
          created_date_time: {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          },
        };

        // Apply user rights-based filtering
        if (findCompanyId.company_flag === 1 || (findCompanyId.company_flag === 2 && showAllData)) {
          whereClause.company_masters_id = findCompanyId.company_masters_id;
        } else if (findCompanyId.company_flag === 2 && showPersonalData) {
          whereClause[Op.or] = [
            { a_application_login_id: a_application_login_id },

          ];
        }

        const cartResult = await carts.findAll({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('grand_total')), 'total'],
          ],
          where: whereClause,
          raw: true,
        });

        const count = parseInt(cartResult[0]?.count) || 0;
        const amount = parseFloat(cartResult[0]?.total) || 0;

        metrics[period] = {
          count,
          amount,
          formatted: `${period.startsWith("LY") ? lastYear : currentYear} "${count} (${amount.toLocaleString()})"`,
        };
      }

      const growth = {
        LTD: metrics.LY_LTD.amount === 0 ? 0 : Number(((metrics.CY_LTD.amount - metrics.LY_LTD.amount) / metrics.LY_LTD.amount * 100).toFixed(2)),
      };

      result[entity.name] = {
        LY_MTD: metrics.LY_MTD.formatted,
        CY_MTD: metrics.CY_MTD.formatted,
        LY_LTD: metrics.LY_LTD.formatted,
        CY_LTD: metrics.CY_LTD.formatted,
        LY_YTD: metrics.LY_YTD.formatted,
        CY_YTD: metrics.CY_YTD.formatted,
        Growth: {
          LTD: growth.LTD,
        },
      };
    }

    return resSuccess({ data: result });
  } catch (error) {
    console.error("error:", error);
    return resError({ developer_msg: `error ${error.message}` });
  }
};