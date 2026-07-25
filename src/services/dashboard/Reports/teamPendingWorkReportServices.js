import { Op } from "sequelize";
import sequelize from "../../../config/sequelize.js";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { cartModel } from "../../../models/activities/cartsModel.js";
import { reminderMessagesModel } from "../../../models/activities/reminderMessagesModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { expensesModel } from "../../../models/hr/expensesModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const getTeamPendingWorkReport = async (req) => {

  const selectedDates = req.body.selectedDates || [];
  const selectedTeamMembers = req.body.selectedTeamMembers || [];
  const globalSearch = req.body.globalSearch?.trim() || "";

  const { ll, // offset (number)
    ul, // limit (number)
  } = req.body

  const offset = ul;
  const limit = ll;


  const startDate = new Date(selectedDates[0]);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(selectedDates[1]);
  endDate.setHours(23, 59, 59, 999);

  let dateFilter = {};
  if (selectedDates.length === 2) {
    dateFilter = {
      created_date_time: {
        [Op.between]: [startDate, endDate],
      },
    };
  }

  let dateFilterforReminder = {};
  if (selectedDates.length === 2) {
    dateFilterforReminder = {
      create_date_time: {
        [Op.between]: [startDate, endDate],
      },
    };
  }

  let dateFilterforExpense = {};
  if (selectedDates.length === 2) {
    dateFilterforExpense = {
      created_date_time: {
        [Op.between]: [startDate, endDate],
      },
    };
  }

  let fullTextSearchCondition = {};
  if (globalSearch) {
    const cartColumns = Object.keys(cartModel(req.tenantDB).rawAttributes)
      .filter(col => {
        const attr = cartModel(req.tenantDB).rawAttributes[col];
        return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
      });

    const like = `%${globalSearch}%`;
    const orConditions = cartColumns.map(col => ({
      [col]: { [Op.like]: like }
    }));

    fullTextSearchCondition = { [Op.or]: orConditions };
  }
  let fullTextSearchConditionForLogin = {};
  if (globalSearch) {
    const cartColumns = Object.keys(loginModel.rawAttributes)
      .filter(col => {
        const attr = loginModel.rawAttributes[col];
        return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
      });

    const like = `%${globalSearch}%`;
    const orConditions = cartColumns.map(col => ({
      [col]: { [Op.like]: like }
    }));

    fullTextSearchConditionForLogin = { [Op.or]: orConditions };
  }

  const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);

  const a_application_login_type_rights = req.body.a_application_login_id;
  const { showAllData, showPersonalData } = await getUserRights({
    company_masters_id: findCompanyId.company_masters_id,
    a_application_login_id: a_application_login_type_rights,
    page_id: PAGE_ID.PENDINGWORK_REPORT,
    tenentId: req.tenantDB
  });

  let whereClause = {
    isDelete: 0,
  };

  if (showAllData) {
    whereClause = {
      isDelete: 0,
      company_masters_id: findCompanyId.company_masters_id,
    }
  }
  else if (showPersonalData) {
    whereClause = {
      isDelete: 0,
      a_application_login_id: req.body.a_application_login_id
    }
  }


  if (selectedTeamMembers.length > 0) {
    whereClause.a_application_login_id = {
      [Op.in]: selectedTeamMembers,
    };
  }



  const companyVsApplicationLoginResult =
    await companyVsApplicationLoginModel.findAll({
      where: whereClause,
    });


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
  });

  const teamData = await Promise.all(
    companyVsApplicationLoginResult.map(async (item) => {
      const a_application_logins = await loginModel.findAll({
        where: {
          isDelete: 0,
          id: item.a_application_login_id,
          ...fullTextSearchConditionForLogin,
        },
        attributes: ["username"],

        offset, // ll -> offset
        limit,
      });
      if (!a_application_logins || a_application_logins.length === 0) {
        return null;   // OR return {}; OR don’t return at all
      }
      const username = a_application_logins[0]?.username || "Unknown";

      const getcart = (sequelize.models.carts = cartModel(req.tenantDB));
      const getCartStats = async (type) => {
        const result = await getcart.findAll({
          attributes: [
            [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            [sequelize.fn("SUM", sequelize.col("grand_total")), "total"],
          ],
          where: {
            isDelete: 0,
            a_application_login_id: item.a_application_login_id,
            type: type,
            sr_by_number: 0,
            ...dateFilter,
            ...fullTextSearchCondition,
          },
          raw: true,
        });

        const data = result[0] || {};

        return {
          count: parseInt(data.count) || 0,
          amount: data.total
            ? `${currency?.symbol || ""} ${parseFloat(data.total)} `
            : "0",
        };
      };

      const quotation = await getCartStats("1");
      const order = await getCartStats("2");
      const sell_invoice = await getCartStats("3");
      const purchase_invoice = await getCartStats("4");
      const purchase_order = await getCartStats("5");

      const reminderModel = reminderMessagesModel(req.tenantDB);
      const getReminder = async (status) => {
        const reminder = await reminderModel.count({
          where: {
            isDelete: 0,
            is_reminder_app_flag: 0,
            a_application_login_id: item.a_application_login_id,
            status: status,
            ...dateFilterforReminder,

          },
        });
        return reminder || 0;
      };
      const expensesModelInstance = expensesModel(req.tenantDB);
      const getReqExpense = async (status) => {
        const reqExpenseAmt = await expensesModelInstance.sum('amount', {
          where: {
            isDelete: 0,
            a_application_login_id: item.a_application_login_id,
            expense_status: status,
            ...dateFilterforExpense,

          },
        });
        return reqExpenseAmt || 0;
      };

      const pendingReminder = await getReminder("0");
      const reqExpenseAmount = await getReqExpense("1");

      return {
        username,
        quotation,
        order,
        sell_invoice,
        purchase_invoice,
        purchase_order,
        pendingReminder,
        reqExpenseAmount
      };
    })
  );
  const finalTeamData = teamData.filter((e) => e !== null);
  return resSuccess({
    data: { item: finalTeamData },
    ack_msg: "Team performance report fetched successfully",
  });
};