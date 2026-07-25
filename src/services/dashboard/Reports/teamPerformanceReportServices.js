import moment from "moment";
import { col, Op } from "sequelize";
import sequelize from "../../../config/sequelize.js";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { accountTransactionsModel } from "../../../models/activities/accountTransactionsModel.js";
import { cartModel } from "../../../models/activities/cartsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { inquiryModel } from "../../../models/activities/inquiryModel.js";
import { reminderMessagesModel } from "../../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../../models/activities/taskManagementModel.js";
import { visitsModel } from "../../../models/activities/visitModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { attendanceModel } from "../../../models/hr/attendanceModel.js";
import { expensesModel } from "../../../models/hr/expensesModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import {
  formatDateAndTimeCreateDateTime,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const getTeamPerformanceReport = async (req) => {
  const selectedDates = req.body.selectedDates || [];
  const selectedTeamMembers = req.body.selectedTeamMembers || [];
  const { globalSearch = '' } = req.body;
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

  //  let dateFilterforInquiry = {};
  // if (selectedDates.length === 2) {
  //   dateFilterforInquiry = {
  //     create_date_time: {
  //       [Op.between]: [startDate, endDate],
  //     },
  //   };
  // }

  let dateFilterforReminder = {};
  if (selectedDates.length === 2) {
    dateFilterforReminder = {
      create_date_time: {
        [Op.between]: [startDate, endDate],
      },
    };
  }
  let dateFilterforAmount = {};
  if (selectedDates.length === 2) {
    dateFilterforAmount = {
      created_date_time: {
        [Op.between]: [startDate, endDate],
      },
    };
  }

  const findCompanyId = await getCompanyByLoginId(
    req.body.a_application_login_id
  );

  let whereClause = {
    isDelete: 0,
  };


  const a_application_id_rights = req.body.a_application_login_id;
  const { showAllData, showPersonalData } = await getUserRights({
    company_masters_id: findCompanyId.company_masters_id,
    a_application_login_id: a_application_id_rights,
    page_id: PAGE_ID.TEAMPERFORMANCE_REPORT,
    tenentId: req.tenantDB
  });

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

  const search = globalSearch?.trim();

  let contactSearchCondition = {};

  if (search) {
    const contactColumns = Object.keys(
      loginModel.rawAttributes
    ).filter((col) => {
      const attr = loginModel.rawAttributes[col];

      return ["STRING", "TEXT", "CHAR", "VARCHAR"].includes(
        attr.type.key
      );
    });

    contactSearchCondition = {
      [Op.or]: contactColumns.map((col) => ({
        [col]: {
          [Op.like]: `%${search}%`,
        },
      })),
    };
  }

  const teamData = await Promise.all(
    companyVsApplicationLoginResult.map(async (item) => {
      const a_application_logins = await loginModel.findAll({
        where: {
          isDelete: 0,
          id: item.a_application_login_id,
          ...contactSearchCondition,
        },
        attributes: ["username", "per_hour_salary"],
      });
      if (!a_application_logins || a_application_logins.length === 0) {
        return null;   // OR return {}; OR don’t return at all
      }
      const username = a_application_logins[0]?.username || "Unknown";
      const salary = a_application_logins[0]?.per_hour_salary || 0;

      const CTContactModel = contactModel(req.tenantDB);
      const contactCount = await CTContactModel.count({
        where: {
          isDelete: 0,
          ...dateFilter,
          [Op.or]: [
            {
              a_application_login_id: item.a_application_login_id
            },
            sequelize.literal(
              `FIND_IN_SET(${item.a_application_login_id}, assinged_to_work_a_application_id)`
            )
          ]
        },
      });

      const InquiryModel = inquiryModel(req.tenantDB);

      const inquiryCount = await InquiryModel.count({
        where: {
          isDelete: 0,
          a_application_login_id: item.a_application_login_id,
          ...dateFilter,
        },
      });

      const TaskModel = taskManagementModel(req.tenantDB);

      const dueTaskCount = await TaskModel.count({
        where: {
          isDelete: 0,
          is_support_ticket: 0,
          [Op.or]: [
            {
              a_application_login_id: item.a_application_login_id
            },
            sequelize.literal(
              `FIND_IN_SET(${item.a_application_login_id}, assigned_team_member)`
            )
          ],
          task_enddate: {
            [Op.lt]: endDate,
          },
          status: { [Op.ne]: -6 },
          ...dateFilter,
        },
      });

      const dueSupportTicketCount = await TaskModel.count({
        where: {
          isDelete: 0,
          is_support_ticket: 1,
          [Op.or]: [
            {
              a_application_login_id: item.a_application_login_id
            },
            sequelize.literal(
              `FIND_IN_SET(${item.a_application_login_id}, assigned_team_member)`
            )
          ], task_enddate: {
            [Op.lt]: endDate,
          },
          status: { [Op.ne]: -6 },
          ...dateFilter,
        },
      });


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
            ...dateFilter,
          },
          raw: true,
        });

        const data = result[0] || {};
        return {
          count: data.count
            ? `${parseInt(data.count)} `
            : "0",
          amount: data.total
            ? `${currency?.symbol || ""} ${parseFloat(data.total)} `
            : "0",
          // count: parseInt(data.count) || 0,
          // amount: parseFloat(data.total) || 0,
        };
      };

      const quotation = await getCartStats("1");
      const order = await getCartStats("2");
      const sell_invoice = await getCartStats("3");
      const purchase_invoice = await getCartStats("4");
      const purchase_order = await getCartStats("5");

      const visitModel = visitsModel(req.tenantDB);
      const visitCount = await visitModel.count({
        where: {
          isDelete: 0,
          a_application_login_id: item.a_application_login_id,
          ...dateFilter,
        },
      });

      const expenseModel = expensesModel(req.tenantDB);
      const getExpenseStatus = async (status) => {
        const expense = await expenseModel.findAll({
          attributes: [
            [sequelize.fn("SUM", sequelize.col("amount")), "requested_amount"],
            [
              sequelize.fn("SUM", sequelize.col("pass_amount")),
              "passed_amount",
            ],
          ],
          where: {
            isDelete: 0,
            expense_status: status,
            a_application_login_id: item.a_application_login_id,
            ...dateFilter,
          },
          raw: true,
        });

        const data = expense[0] || {};

        return {
          requestedAmount: data.requested_amount
            ? `${currency?.symbol || ""} ${parseFloat(data.requested_amount)} `
            : "",
          // requestedAmount: parseFloat(data.requested_amount) || 0,
          passedAmount: data.passed_amount
            ? `${currency?.symbol || ""} ${parseFloat(data.passed_amount)} `
            : "",
          // passedAmount: parseFloat(data.passed_amount) || 0,
        };
      };

      const pending = await getExpenseStatus("1");
      const approved = await getExpenseStatus("2");

      const expense = {
        RequestedAmount: pending.requestedAmount + approved.requestedAmount,
        PassedAmount: approved.passedAmount,
        // RequestedAmount: pending.requestedAmount + approved.requestedAmount,
        // PassedAmount: approved.passedAmount,
      };

      const reminderModel = reminderMessagesModel(req.tenantDB);
      const getReminder = async (status) => {
        const reminder = await reminderModel.count({
          where: {
            isDelete: 0,
            is_reminder_app_flag: 0,
            [Op.or]: [
              {
                a_application_login_id: item.a_application_login_id
              },
              sequelize.literal(
                `FIND_IN_SET(${item.a_application_login_id}, assigned_to)`
              )
            ], status: status,
            ...dateFilterforReminder,
          },
        });
        return reminder || 0;
      };

      const accountModels = accountTransactionsModel(req.tenantDB);
      const getAccount = async () => {
        const getAccountStats = async (type) => {
          const account = await accountModels.findAll({
            where: {
              isDelete: 0,
              a_application_login_id: item.a_application_login_id,
              type: type,
              ...dateFilterforAmount,
            },
            attributes: [
              [sequelize.fn("SUM", sequelize.col("amount")), "totalAmount"],
              [sequelize.fn("COUNT", sequelize.col("id")), "totalCount"],
            ],
            raw: true,
          });

          const data = account[0] || {};

          return {
            amount: data.totalAmount
              ? `${currency?.symbol || ""} ${parseFloat(data.totalAmount)}`
              : "0",
            count: data.totalCount ? parseInt(data.totalCount) : 0,
          };
        };

        const credit = await getAccountStats(1); // Type 1: Credit
        const debit = await getAccountStats(2); // Type 2: Debit

        return {
          credit,
          debit,
        };
      };

      const account = await getAccount();

      const pendingReminder = await getReminder("0");

      const AMmodel = attendanceModel(req.tenantDB);

      if (req.body.request_flag === 1) {
        const viewAttendance = await AMmodel.findOne({
          where: {
            company_masters_id: findCompanyId.company_masters_id,
            a_application_login_id: item.a_application_login_id,
            isDelete: "0",
          },
          order: [["check_in_out_date_time", "DESC"]],
          attributes: ["attendance_status"],
        });
        if (viewAttendance) {
          return resSuccess({
            ack_msg: "Attendance view",
            data: viewAttendance.attendance_status,
          });
        } else {
          return resError({
            ack_msg: "something went wrong",
            developer_msg: "Data not found",
          });
        }
      } else {
        const start = moment(req.body.selectedDates[0]).format("YYYY-MM-DD");
        const end = moment(req.body.selectedDates[1]).format("YYYY-MM-DD");

        const viewAttendance = await AMmodel.findAll({
          where: {
            a_application_login_id: item.a_application_login_id,
            isDelete: "0",
            [Op.and]: [
              sequelize.where(
                sequelize.fn("DATE", sequelize.col("check_in_out_date_time")),
                {
                  [Op.gte]: start,
                  [Op.lte]: end,
                }
              ),
            ],
          },
          attributes: {
            include: [
              [
                sequelize.fn("DATE", col("check_in_out_date_time")),
                "attendanceDate",
              ],
              [
                sequelize.fn("TIME", col("check_in_out_date_time")),
                "attendanceTime",
              ],
            ],
          },
          order: [["check_in_out_date_time", "ASC"]],
        });

        const sanitizeData =
          viewAttendance &&
          viewAttendance.map((e, i) => {
            const sanitized = sanitizeObjectOfNull(e.toJSON());
            return {
              ...sanitized,
              check_in_out_date_time: e.dataValues.check_in_out_date_time
                ? formatDateAndTimeCreateDateTime(
                  e.dataValues.check_in_out_date_time
                )
                : "",
            };
          });

        const result = [];

        if (!sanitizeData || sanitizeData.length === 0) {
          result.push({
            attendance_status: "0",
            a_application_login_id: item.a_application_login_id,
            check_in_out_date_time: "00-00-00 00:00",
            total_working_hour: "00:00:00",
            company_masters_id: findCompanyId.company_masters_id,
            attendanceDate: "00-00-00",
            attendanceTime: "00:00",
          });
        } else {
          for (let i = 0; i < sanitizeData.length; i++) {
            const attendanceData = sanitizeData[i];

            const attendanceDataObj = {
              attendance_status: attendanceData.attendance_status || "",
              a_application_login_id:
                attendanceData.a_application_login_id || "",
              check_in_out_date_time:
                attendanceData.check_in_out_date_time || "",
              total_working_hour:
                attendanceData.total_working_hour || "00:00:00",
              company_masters_id: attendanceData.company_masters_id || 0,
              attendanceDate: attendanceData.attendanceDate || "",
              attendanceTime: attendanceData.attendanceTime || "",
            };

            result.push(attendanceDataObj);
          }
        }

        return {
          username,
          contactCount,
          inquiryCount,
          dueTaskCount,
          dueSupportTicketCount,
          quotation,
          order,
          sell_invoice,
          purchase_invoice,
          purchase_order,
          visitCount,
          salary,
          expense,
          pendingReminder,
          attendanceData: result,
          account

        };
      }
    })
  );
  const finalTeamData = teamData.filter((e) => e !== null);
  return resSuccess({
    data: { item: finalTeamData },
    ack_msg: "Team performance report fetched successfully",
  });
};
