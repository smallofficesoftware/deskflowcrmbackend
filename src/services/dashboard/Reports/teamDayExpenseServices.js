import { Op } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { expensesModel } from "../../../models/hr/expensesModel.js";
import { EXPENSE_IMG_LINK_EXTENDED } from "../../../utils/appConstants.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const teamDayExpense = async (req) => {
  try {
    const selectedDates = req.body.selectedDates || [];
    const selectedTeamMembers = req.body.selectedTeamMembers;
    const offset = req.body.ul;
    const limit = req.body.ll;

    const globalSearch = req.body.globalSearch?.trim() || "";


    const startDate = new Date(selectedDates[0]);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(selectedDates[1]);
    endDate.setHours(23, 59, 59, 999);

    let fullTextSearchCondition = {};
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

      fullTextSearchCondition = { [Op.or]: orConditions };
    }


    let dateFilter = {};
    if (selectedDates.length === 2) {
      dateFilter = {
        expense_date: {
          [Op.between]: [startDate, endDate],
        },
      };
    }

    const findCompanyId = await getCompanyByLoginId(
      req.body.a_application_login_id
    );

    let whereClause = {};

    const a_application_login_type_rights = req.body.a_application_login_id;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: a_application_login_type_rights,
      page_id: PAGE_ID.TEAMEXPENSE_REPORT,
      tenentId: req.tenantDB
    });

    if (showAllData) {
      whereClause = {
        company_masters_id: findCompanyId.company_masters_id,
      }
    }
    else if (showPersonalData) {
      whereClause = {
        a_application_login_id: req.body.a_application_login_id
      }
    }

    if (selectedTeamMembers && selectedTeamMembers.length > 0) {
      whereClause["a_application_login_id"] = {
        [Op.in]: selectedTeamMembers,
      };
    }

    const companyVsApplicationLoginResult =
      await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          ...whereClause
        },
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
            ...fullTextSearchCondition,
            id: item.a_application_login_id,
            isDelete: 0,

          },
          attributes: ["id", "username"],
          offset, // ll -> offset
          limit,  // ul -> limit
        });

        const username = a_application_logins[0]?.username || "";
        const teamId = a_application_logins[0]?.id || "";

        const expenseModels = await expensesModel(req.tenantDB);
        const expense = await expenseModels.findAll({
          where: {
            a_application_login_id: item.a_application_login_id,
            isDelete: 0,
            ...dateFilter,
          },
          attributes: ["id", "amount", "pass_amount", "created_date_time", "expense_date", "expense_type_id", "expense_status", "a_application_login_id", "image"],
          raw: true,
        });
        const result = [];

        if (!expense || expense.length === 0) {
          const expenseObj = {
            requested_amount: 0,
            pass_amount: 0,
            create_date_time: "00:00;00",
          };
          result.push(expenseObj);
        } else {
          for (let i = 0; i < expense.length; i++) {
            const expenseObj = {
              id: expense[i]?.id || 0,
              requested_amount: expense[i]?.amount
                ? `${currency?.symbol || ""} ${expense[i]?.amount}`
                : "0",
              pass_amount: expense[i]?.pass_amount
                ? `${currency?.symbol || ""} ${expense[i]?.pass_amount}`
                : "0",
              exp_image: expense[i]?.image
                ? `${EXPENSE_IMG_LINK_EXTENDED}/${expense[i]?.image}`
                : null,
              create_date_time: expense[i]?.created_date_time || 0,
              expense_date: expense[i]?.expense_date || 0,
              expense_type_id: expense[i]?.expense_type_id || "0",
              expense_status: expense[i]?.expense_status || 0,
              expense_pass_or_reject:
                expense[i]?.expense_status === 2
                  ? "P"
                  : expense[i]?.expense_status === 3
                    ? "R"
                    : "",
              a_application_login_id: expense[i]?.a_application_login_id || 0,
            };
            result.push(expenseObj);
          }
        }

        return {
          teamId,
          username,
          result,
        };
      })
    );

    return resSuccess({
      data: { item: teamData },
      ack_msg: "Successfully get Data",
    });
  } catch (e) {
    return resError({
      ack_msg: "Error Found In Catch",
      developer_msg: `${e}`,
    });
  }
};
