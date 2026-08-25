import fs from "fs-extra";
import jwt from "jsonwebtoken";
import moment from "moment";
import nodemailer from "nodemailer";
import path from "path";
import { Op } from "sequelize";
import { requestContext } from "../config/context.js";
import sequelize from "../config/sequelize.js";
import { statusLogsMessageConfig } from "../helpers/statusLogsMessageConfig.js";
import { accountTransactionsModel } from "../models/activities/accountTransactionsModel.js";
import { cartItemModel } from "../models/activities/cartItemsModel.js";
import { cartSerialNumberModel } from "../models/activities/cartSerialNumberModel.js";
import { cartModel } from "../models/activities/cartsModel.js";
import { contactMessageHistory } from "../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../models/activities/contactModel.js";
import { employeeAccountTransactionsModel } from "../models/activities/employeeAccountTransactionModel.js";
import { inquiryModel } from "../models/activities/inquiryModel.js";
import { paymentTypeModel } from "../models/activities/paymentTypeModel.js";
import { personalNotesModel } from "../models/activities/personalNotesModel.js";
import { reminderMessagesModel } from "../models/activities/reminderMessagesModel.js";
import { routePlannerModel } from "../models/activities/routePlannerModel.js";
import { taskManagementModel } from "../models/activities/taskManagementModel.js";
import { taskMessageHistroyModel } from "../models/activities/taskMessageHistroyModel.js";
import { visitsModel } from "../models/activities/visitModel.js";
import applicationLoginHistoriesModel from "../models/application_login/applicationLoginHistoriesModel.js";
import loginModel from "../models/application_login/loginModel.js";
import { userAppTrackModel } from "../models/application_login/userAppTrackModel.js";
import { statusAndStagesLogsModel } from "../models/common/statusAndStagesLogsModel.js";
import companyModel from "../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../models/company_setup/companyVsApplicationLoginModel.js";
import companyVsPlansModel from "../models/configuration/companyVsPlanModel.js";
import { AdjustmentTypes } from "../models/hr/adjustmentTypes.js";
import { dayConversionModel } from "../models/hr/dayConversionModel.js";
import { departmentModel } from "../models/hr/departmentModel.js";
import { employeePayrollModel } from "../models/hr/employeePayrollModel.js";
import { expenseTypeModel } from "../models/hr/expenseTypeModel.js";
import { expensesModel } from "../models/hr/expensesModel.js";
import { holidayModel } from "../models/hr/holidayModel.js";
import { leaveTypeModel } from "../models/hr/leaveTypeModel.js";
import { leavesModel } from "../models/hr/leavesModel.js";
import { lockcontrolModel } from "../models/hr/lockcontrolModel.js";
import { targetVsIncentiveModel } from "../models/hr/targetVsIncentiveModel.js";
import { visitTypeModel } from "../models/hr/visitTypeModel.js";
import { areaModel } from "../models/masters/areaModel.js";
import { billOfMaterialsModel } from "../models/masters/billOfMaterialsModel.js";
import { cityModel } from "../models/masters/cityModel.js";
import { countryModel } from "../models/masters/countryModel.js";
import { labelModel } from "../models/masters/labelModel.js";
import { machineManagementModel } from "../models/masters/machineManagementModel.js";
import { sourceTypesModel } from "../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../models/masters/stagestatusModel.js";
import { stateModel } from "../models/masters/stateModel.js";
import { taskCategoryModel } from "../models/masters/taskCategoryModel.js";
import { taskTemplateModel } from "../models/masters/taskTemplateModel.js";
import { taskTemplateDatasource } from "../models/masters/taslTemplateDatasources.js";
import { customFieldFormModel } from "../models/other_settings/customFieldFormModel.js";
import { customFieldDatavaluesModel } from "../models/other_settings/customfieldDatavaluesModel.js";
import { wareHouseModel } from "../models/other_settings/wareHouseModel.js";
import { wrkflwAutoAssignmentContactModel } from "../models/other_settings/wrkflwAutoAssignmentContactModel.js";
import { categoryModel } from "../models/product_settings/categoryModel.js";
import { priceListMastersModel } from "../models/product_settings/priceListMastersModel.js";
import { priceListModel } from "../models/product_settings/priceListModel.js";
import { processMastersModel } from "../models/product_settings/processMastersModel.js";
import { productGroupModel } from "../models/product_settings/productGroupModel.js";
import { productModel } from "../models/product_settings/productModel.js";
import { productUnitMasterModel } from "../models/product_settings/productUnitMasterModel.js";
import { taxModel } from "../models/product_settings/taxModel.js";
import {
  addContactByWhatsApps,
  sendMultipleNotification,
} from "../services/company_setup/thirdPartyIntegrationService.js";
import {
  JWT_TOKEN_EXPIRES_TIME,
  JWT_TOKEN_SIGNATURE,
  MAIL_SETTING_HOST_NAME,
  MAIL_SETTING_HOST_USER_NAME,
  MAIL_SETTING_HOST_USER_PASSWORD,
  WHATSAPP_SEND_ADD_PRE_NUMBER
} from "../utils/appConstants.js";
import {
  isValid,
  isValidEmail,
  normalizeToTenDigit,
  resBadRequest,
  resError,
  resSuccess
} from "../utils/sharedFunctions.js";


export const getAllCommon = async (req) => {
  let table, columns, where, order, request_flag, personal_flag;
  if (req.body) {
    ({ table, columns, where, order, request_flag, personal_flag } = req.body);
  } else {
    ({ table, columns, where, order, request_flag, personal_flag } = req);
  }


  try {

    const modelRegistry = req.models;
    const model = modelRegistry[table];
    if (!model) {
      return resError({
        ack_msg: "Invalid table name",
        developer_msg: `Model "${table}" not found`,
      });
    }
    let queryOptions = {
      attributes: columns
        ? columns.split(",").map((column) => column.trim())
        : undefined,
    };
    if (request_flag === 0) {
      const operatorRegex = /(!=|<=|>=|=|<|>|LIKE|NOT LIKE)/i;
      const operatorMap = {
        "=": Op.eq,
        "!=": Op.ne,
        "<": Op.lt,
        ">": Op.gt,
        "<=": Op.lte,
        ">=": Op.gte,
        "LIKE": Op.like,
        "NOT LIKE": Op.notLike,
      };

      const conditionRegex = /^([^!<>=]+?)\s*(LIKE|NOT LIKE|!=|<=|>=|=|<|>)\s*(.+)$/i;

      function parseValue(val) {
        const trimmed = val.trim();
        if (trimmed === "true") return true;
        if (trimmed === "false") return false;
        if (!isNaN(trimmed)) return Number(trimmed);
        return trimmed;
      }

      const whereConditions = await Promise.all(
        where.map(async (condition) => {
          const match = condition.match(conditionRegex);
          if (!match) return {};
          const [, column, operatorRaw, valueRaw] = match.map((v) => v.trim());
          const operator = operatorRaw.toUpperCase();
          const value = valueRaw.replace(/^['"]|['"]$/g, ""); // remove quotes if any

          if (!column || value === undefined) return {};


          // OR condition using ||
          if (value.includes("||")) {
            const parsedOrValues = value.split("||").map((v) => parseValue(v));
            return {
              [column]: {
                [Op.or]: parsedOrValues.map((orVal) => ({
                  [operatorMap[operator]]: orVal,
                })),
              },
            };
          }

          // Normal case (including LIKE)
          return {
            [column]: {
              [operatorMap[operator]]: parseValue(value),
            },
          };
        })
      );
      if (order) {
        let orderObj;
        try {
          orderObj = JSON.parse(order);
        } catch (error) {
          console.error("Invalid order JSON:", error);
          orderObj = {};
        }
        const orderBy = Object.entries(orderObj).map(([column, direction]) => {
          const validDirection = ['ASC', 'DESC'].includes(direction.toUpperCase())
            ? direction.toUpperCase()
            : 'ASC';
          return [column, validDirection];
        });
        queryOptions.order = orderBy;
      }
      queryOptions = {
        ...queryOptions,
        where: {
          [Op.and]: whereConditions,
        },
      };
    } else {
      if (where) {
        const whereObj = JSON.parse(where);
        if (request_flag === 2) {
          queryOptions.where = {
            ...whereObj,
            id: { [Op.ne]: whereObj.id },
          };
        } else {
          queryOptions.where = whereObj;
        }
      }
      if (req.body.order || req.order) {
        const orderObj = JSON.parse(req.order);
        const orderBy = [
          [...Object.keys(orderObj), ...Object.values(orderObj)],
        ];
        queryOptions.order = orderBy;
      }
    }
    if (table === "contact_master" && request_flag == 1) {
      const whereObj = JSON.parse(where);
      const contactData = await sequelize.models.contact_masters.findAll({
        where: {
          isDelete: 0,
          latitude: { [Op.ne]: null, [Op.ne]: "" },
          longitude: { [Op.ne]: null, [Op.ne]: "" },
          [Op.and]: [
            sequelize.where(
              sequelize.fn(
                "FIND_IN_SET",
                whereObj.a_application_login_id,
                sequelize.col("assinged_to_work_a_application_id")
              ),
              { [Op.gt]: 0 }
            )
          ]
        },
        attributes: ["id", "latitude", "longitude", "person_name", "company_name", "mobile_number", "email_id", "address"],
      });
      return resSuccess({
        ack_msg: "get successfully",
        data: { contactData }
      })
    }

    sequelize.models.products = productModel;

    const result = await model.findAll(queryOptions);
    if (!result || result.length === 0) {
      if (table === "visit_type_masters") {
        return resError({
          ack_msg: "No any visits type available",
          developer_msg: "Record(s) not found",
        });
      }
      return resError({
        ack_msg: "No Data Found",
        developer_msg: "Record(s) not found",
      });
    }

    // if (table === "task_managements") {
    //   const modify = (row) => {
    //     if (row.task_attechment && row.task_attechment !== "") {
    //       row.task_attechment_url = TASK_ATTEECHMENT_VIEW + row.task_attechment;

    //     } else {
    //       row.task_attechment_url = null; // or "" (your choice)
    //     }

    //     return row;
    //   };

    //   if (Array.isArray(result)) {
    //     result = result.map(modify);
    //   } else if (typeof result === "object" && result !== null) {
    //     result = modify(result);
    //   }
    // }

    return resSuccess({
      data: result,
    });

  } catch (e) {
    console.log("getAllCommon error", e)
    return resBadRequest({ developer_msg: `Error ${e}` });
  }
};

const checkDuplicationCommon = async (table, whereClause, tenantDB) => {
  try {
    const model = sequelize.models[table];
    if (!model) {
      // throw new Error(`Model for table '${table}' not found`);
    }
    const whereConditions = {};
    for (let key in whereClause) {
      whereConditions[key] = whereClause[key];
    }
    whereConditions["isDelete"] = "0";
    const existingRecord = await model.findOne({
      where: whereConditions,
      attributes: ["id"],
    });
    return !!existingRecord;
  } catch (error) {
    console.log(`Error checking duplication in ${table}:`, error);
    return resError({
      ack_msg: (`Error checking duplication in ${table}:`, error),
      developer_msg: `Error checking duplication`,
    });
  }
};

export const createCommon = async (req) => {
  try {
    let table, data;
    if (req.body) {
      table = req.body.table;
      data = req.body.data;
    } else {
      table = req.table;
      data = req.data;
    }
    if (!table || !data) {
      return resError({
        ack_msg: "Table and data are required.",
        developer_msg: "Required fields are missing.",
      });
    }
    sequelize.models.company_masters = companyModel;
    sequelize.models.company_vs_plans = companyVsPlansModel;
    sequelize.models.categories = categoryModel(req.tenantDB);
    sequelize.models.product_groups = productGroupModel(req.tenantDB);
    sequelize.models.warehouses = wareHouseModel(req.tenantDB);
    sequelize.models.task_categories = taskCategoryModel(req.tenantDB);
    sequelize.models.bill_of_materials_masters = billOfMaterialsModel(req.tenantDB);
    sequelize.models.payment_types = paymentTypeModel(req.tenantDB);
    sequelize.models.expense_type_masters = expenseTypeModel(req.tenantDB);
    sequelize.models.visit_type_masters = visitTypeModel(req.tenantDB);
    sequelize.models.leave_type_masters = leaveTypeModel(req.tenantDB);
    sequelize.models.pricelist_masters = priceListMastersModel(req.tenantDB);
    sequelize.models.price_lists = priceListModel(req.tenantDB);
    sequelize.models.source_types = sourceTypesModel(req.tenantDB);
    sequelize.models.lable_masters = labelModel(req.tenantDB);
    sequelize.models.a_countries = countryModel(req.tenantDB);
    sequelize.models.a_states = stateModel(req.tenantDB);
    sequelize.models.a_cities = cityModel(req.tenantDB);
    sequelize.models.a_areas = areaModel(req.tenantDB);
    sequelize.models.custom_field_form_masters = customFieldFormModel(req.tenantDB);
    sequelize.models.stage_status_masters = stagestatusModel(req.tenantDB);
    sequelize.models.task_templete_masters = taskTemplateModel(req.tenantDB);
    sequelize.models.personal_notes = personalNotesModel(req.tenantDB);
    sequelize.models.contact_message_histories = contactMessageHistory(req.tenantDB);
    sequelize.models.task_message_histories = taskMessageHistroyModel(req.tenantDB);
    sequelize.models.account_transactions = accountTransactionsModel(req.tenantDB);
    sequelize.models.employee_account_transactions = employeeAccountTransactionsModel(req.tenantDB);
    sequelize.models.reminder_messages = reminderMessagesModel(req.tenantDB);
    sequelize.models.inquiries = inquiryModel(req.tenantDB);
    sequelize.models.carts = cartModel(req.tenantDB);
    sequelize.models.cart_items = cartItemModel(req.tenantDB);
    sequelize.models.cart_vs_serial_numbers = cartSerialNumberModel(req.tenantDB);
    sequelize.models.products = productModel(req.tenantDB);
    sequelize.models.target_vs_incentives = targetVsIncentiveModel(req.tenantDB);
    sequelize.models.departments = departmentModel(req.tenantDB);
    sequelize.models.machine_managements = machineManagementModel(req.tenantDB);
    sequelize.models.contact_masters = contactModel(req.tenantDB);
    sequelize.models.holidays = holidayModel(req.tenantDB);
    sequelize.models.custom_field_form_datavalues = customFieldDatavaluesModel(req.tenantDB);
    sequelize.models.product_unit_masters = productUnitMasterModel(req.tenantDB);
    sequelize.models.employee_payrolls = employeePayrollModel(req.tenantDB);
    sequelize.models.process_masters = processMastersModel(req.tenantDB);
    sequelize.models.user_app_tracks = userAppTrackModel(req.tenantDB);
    sequelize.models.tax_masters = taxModel(req.tenantDB);
    const parsedData = JSON.parse(data);

    // Check  duplication Start.
    let duplicationCheckFields = {};
    // switch (req.body.table) {
    if (table === "a_states") {
      duplicationCheckFields = {
        state_name: parsedData.state_name,
        country_id: parsedData.country_id,
        isDelete: "0",
      };
    } else if (table === "a_cities") {
      duplicationCheckFields = {
        state_id: parsedData.state_id,
        country_id: parsedData.country_id,
        city_name: parsedData.city_name,
        isDelete: "0",
      };
    } else if (table === "a_areas") {
      duplicationCheckFields = {
        area_name: parsedData.area_name,
        country_id: parsedData.country_id,
        state_id: parsedData.state_id,
        city_id: parsedData.city_id,
        isDelete: "0", // Corrected to "0" instead of four spaces for consistency
      };
    } else if (table === "a_countries") {
      duplicationCheckFields = {
        country_name: parsedData.country_name,
        country_code: parsedData.country_code,
        isDelete: "0",
      };
    } else if (table === "categories") {
      duplicationCheckFields = {
        category_name: parsedData.category_name,
        isDelete: "0",
      };
    } else if (table === "source_types") {
      duplicationCheckFields = {
        source_name: parsedData.source_name,
        isDelete: "0",
      };
    } else if (table === "lable_masters") {
      duplicationCheckFields = {
        lable_name: parsedData.lable_name,
        isDelete: "0",
      };
    } else if (table === "visit_type_masters") {
      duplicationCheckFields = {
        visit_type: parsedData.visit_type,
        isDelete: "0",
      };
    } else if (table === "leave_type_masters") {
      duplicationCheckFields = {
        leave_type: parsedData.leave_type,
        isDelete: "0",
      };
    } else if (table === "expense_type_masters") {
      duplicationCheckFields = {
        expense_name: parsedData.expense_name,
        isDelete: "0",
      };
    } else if (table === "task_categories") {
      duplicationCheckFields = {
        task_category_name: parsedData.task_category_name,
        isDelete: "0",
      }
    } else if (table === "product_unit_masters") {
      duplicationCheckFields = {
        unit: parsedData.unit,
        isDelete: "0",
      };
    }
    // Perform duplication check only for the specified tables
    if (["a_states", "a_cities", "a_areas", "a_countries", "categories", 'source_types', 'lable_masters', 'visit_type_masters', 'leave_type_masters', 'expense_type_masters', 'task_categories', 'product_unit_masters'].includes(table)) {
      const isDuplicate = await checkDuplicationCommon(
        table,
        duplicationCheckFields,
        req.tenantDB
      );
      if (isDuplicate) {
        return resError({
          ack_msg: "This value is already available in System",
          developer_msg: "Duplicate record found.",
        });
      }
    }
    if (table === "reminder_messages" && parsedData.assigned_to) {
      // const contactId = parsedData.contact_masters_id;
      const contactId = parsedData?.id;
      if (contactId) {
        const contactDetails = await sequelize.models.contact_masters.findOne({
          where: { id: contactId, isDelete: "0" },
          attributes: [
            "a_application_login_id",
            "assinged_to_work_a_application_id",
          ],
        });
        if (!contactDetails) {
          return resError({
            ack_msg: "Contact not found.",
            developer_msg: "Contact ID does not exist in contact_masters.",
          });
        }
        const ContactAssignedIds = (
          contactDetails.assinged_to_work_a_application_id || ""
        )
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
        const isAuthorized =
          contactDetails.a_application_login_id ===
          parsedData.a_application_login_id ||
          ContactAssignedIds.includes(
            parsedData.a_application_login_id?.toString()
          );
        if (!isAuthorized) {
          return resError({
            ack_msg: "Please assign this contact before Assign a reminder.",
            developer_msg: "This Contact is Not Assign This TeamMember/Owner",
          });
        }
      }
      const assignedMemberTokens = await loginModel.findAll({
        where: {
          id: parsedData.assigned_to,
          isDelete: 0,
        },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
        ],
      });
      const assignedMemberTo = await loginModel.findOne({
        where: {
          id: parsedData.a_application_login_id,
          isDelete: 0,
        },
        attributes: ["username"],
      });
      const allTokens = assignedMemberTokens
        .flatMap((tokenObj) => [
          tokenObj.web_refresh_token,
          tokenObj.android_refresh_token,
          tokenObj.ios_refresh_token,
        ])
        .filter((token) => token && token.trim() !== "");
      const uniqueTokens = [...new Set(allTokens)];
      if (uniqueTokens.length > 0) {
        try {
          await sendMultipleNotification({
            deviceTokens: uniqueTokens,
            title: `${assignedMemberTo.username} has assigned you a new reminder `,
            // body: ` ${assignedMemberTo.username} has assigned you a new reminder `,
          });
        } catch (notificationError) {
          console.log(
            "Notification failed (non-critical):",
            notificationError.message
          );
        }
      } else {
        console.log("No device tokens found for assigned team members.");
      }
    }
    let findCompanyId;
    if (table === "target_vs_incentives") {
      findCompanyId = await getCompanyByLoginId(
        parsedData.a_application_login_id
      );
      if (!findCompanyId) {
        return resError({
          ack_msg: "Company not found for login ID",
          developer_msg: "No company associated with the provided login ID",
        });
      }
      // Utility function to fetch username
      const usernameLiteral = async (a_application_login_id) => {
        if (!a_application_login_id) return "Someone";
        const user = await loginModel.findOne({
          where: { id: a_application_login_id, isDelete: "0" },
          attributes: ["username"],
        });
        return user?.username || "Someone";
      };
      const approverUsername = await usernameLiteral(
        parsedData.a_application_login_id
      );
      let assignedIds = [];
      // Convert target_flag to number for comparison
      const targetFlag = Number(parsedData.target_flag);
      if (targetFlag === 1) {
        const allTeamMembers = await companyVsApplicationLoginModel.findAll({
          where: {
            isDelete: "0",
            company_masters_id: findCompanyId.company_masters_id,
            company_flag: 2,
          },
          attributes: ["a_application_login_id"],
        });
        if (allTeamMembers && allTeamMembers.length > 0) {
          assignedIds = allTeamMembers.map((member) =>
            String(member.a_application_login_id)
          );
        } else {
          console.log("No team members found");
        }
      } else if (targetFlag === 2) {
        console.log("Processing target_flag 2: Specific team members");
        // Handle assigned_team_member as single ID, string, or array
        if (
          typeof parsedData.assigned_team_member === "number" ||
          typeof parsedData.assigned_team_member === "string"
        ) {
          assignedIds = String(parsedData.assigned_team_member)
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id);
        } else if (Array.isArray(parsedData.assigned_team_member)) {
          assignedIds = parsedData.assigned_team_member
            .map((id) => String(id).trim())
            .filter((id) => id);
        } else {
          console.log("Invalid assigned_team_member format");
        }
      } else {
        return resError({
          ack_msg: "Invalid target_flag value",
          developer_msg: `Received target_flag: ${parsedData.target_flag}, expected 1 or 2`,
        });
      }
      if (assignedIds.length > 0) {
        for (const id of assignedIds) {
          // if (id === (a_application_login_id)) {
          //   continue;
          // }
          try {
            const assignedContact = await loginModel.findOne({
              where: { id: id, isDelete: "0" },
              attributes: [
                "web_refresh_token",
                "android_refresh_token",
                "ios_refresh_token",
              ],
            });
            if (assignedContact) {
              const tokens = [
                assignedContact.web_refresh_token,
                assignedContact.android_refresh_token,
                assignedContact.ios_refresh_token,
              ].filter((token) => token && token.trim() !== "");
              if (tokens.length > 0) {
                await sendMultipleNotification({
                  deviceTokens: tokens,
                  title: `New Target Assigned`,
                  body: `${approverUsername} assigned a target (type: ${parsedData.target_type}) with ${parsedData.target_count} units valued at ₹${parsedData.target_value}.`,
                });
                console.log(
                  `Notifications sent successfully to ${tokens.length} devices for ID ${id}`
                );
              } else {
                console.log(`No valid tokens found for ID ${id}`);
              }
            } else {
              console.log(`No contact found for ID ${id}`);
            }
          } catch (error) {
            console.log(
              `Notification failed for ID ${id} (non-critical):`,
              error.message
            );
          }
        }
      } else {
        console.log("No assigned IDs found for notifications");
      }
    }


    if (!sequelize.models[table]) {
      return resError({
        ack_msg: `Invalid table name. `,
        developer_msg: `Table '${table}' not found in models.`,
      });
    }
    if (
      table !== "company_masters" &&
      table !== "company_vs_application_logins" &&
      req.body.request_flag !== "CreateCompanyNotExists"
    ) {
      if (parsedData.a_application_login_id) {
        const findCompanyId = await getCompanyByLoginId(
          parsedData.a_application_login_id
        );
        parsedData.company_masters_id = findCompanyId.company_masters_id;
      }
    }
    if (req.body.request_flag === "msg" && parsedData.message_side === 1) {
      let contact_masters_id = parsedData.contact_masters_id;
      const requestData = {
        table: "contact_masters",
        columns: "id,mobile_number",
        where: `{\"isDelete\":\"0\",\"id\":\"${contact_masters_id}\,"}`,
      };
      const getContactById = await rp_getValue(requestData);
      let contact_master_number =
        WHATSAPP_SEND_ADD_PRE_NUMBER + `${getContactById.data}`;
      let contact_history_message = parsedData.description;
      const whatsappReqestFlag = "msg";
      const atteched_file = "";
      const superAdminWhatsAppKey = parsedData.superAdminWhatsAppKey;

      const response = await addContactByWhatsApps(
        req,
        whatsappReqestFlag,
        atteched_file,
        contact_master_number,
        contact_history_message,
        parsedData.a_application_login_id,
        "",
        ""
      );
      return response;

    }
    if (parsedData.entry_flag !== 1) {

      const createdItem = await sequelize.models[table].create(parsedData);
      if (!createdItem) {
        return resError({
          ack_msg: "Failed to create record.",
          developer_msg: "Database error occurred.",
        });
      }

      if (req.body.request_flag === "CreateCompanyNotExists") {
        const token = jwt.sign(
          {
            a_application_login_id: createdItem.dataValues.a_application_login_id,
          },
          JWT_TOKEN_SIGNATURE,
          { expiresIn: JWT_TOKEN_EXPIRES_TIME }
        );
        return resSuccess({
          data: { item: createdItem, token },
        });
      } else {
      }
      if (req.body.table === "inquiries") {

        /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
        await insertStagesAndStatusLogs(req,
          {
            reference_table: "inquiries",
            reference_id: createdItem.dataValues.id,
            status_id: "-2",
            a_application_login_id: createdItem.dataValues.a_application_login_id
          }
        );
        /* Status Log Entry Added BY Dinesh -> 20-11-2025 */


        const assigned_team_member =
          await sequelize.models.contact_masters.findOne({
            where: {
              id: parsedData.contact_master_id,
              isDelete: 0,
            },
            attributes: ["assinged_to_work_a_application_id"],
          });
        const usernameLiteral = async (a_application_login_id) => {
          if (!a_application_login_id) return "Someone";
          const user = await loginModel.findOne({
            where: { id: a_application_login_id, isDelete: "0" },
            attributes: ["username"],
          });
          return user?.username || "Someone";
        };
        const approverUsername = await usernameLiteral(
          parsedData.a_application_login_id
        );
        if (
          assigned_team_member &&
          assigned_team_member.assinged_to_work_a_application_id
        ) {
          const assignedIds =
            assigned_team_member.assinged_to_work_a_application_id
              .split(",")
              .map((id) => id.trim());
          for (const id of assignedIds) {
            if (id === String(parsedData.a_application_login_id)) {
              continue;
            }
            try {
              const assignedContact = await loginModel.findOne({
                where: {
                  id: id,
                  isDelete: 0,
                },
                attributes: [
                  "web_refresh_token",
                  "android_refresh_token",
                  "ios_refresh_token",
                ],
              });
              if (assignedContact) {
                const tokens = [
                  assignedContact.web_refresh_token,
                  assignedContact.android_refresh_token,
                  assignedContact.ios_refresh_token,
                ].filter((token) => token); // Filter out null/undefined tokens
                if (tokens.length > 0) {
                  await sendMultipleNotification({
                    deviceTokens: tokens,
                    title: `${approverUsername} added new inquiry`,
                    body: ``,
                  });
                } else {
                  console.log(`No valid tokens found for ID ${id}`);
                }
              } else {
                console.log(`No contact found for ID ${id}`);
              }
            } catch (error) {
              console.log(
                `Notification failed for ID ${id} (non-critical):`,
                error.message
              );
            }
          }
        } else {
          console.log("No contact data or assigned IDs found");
        }
        try {
          const inquiriesdata = JSON.parse(req.body.data);
          // Verify models exist
          if (!sequelize.models.contact_masters) {
            throw new Error("Model contact_masters is not defined");
          }
          if (!sequelize.models.categories) {
            throw new Error("Model categories is not defined");
          }
          if (!sequelize.models.products) {
            throw new Error("Model products is not defined");
          }
          // Async function to fetch username
          const usernameLiteral = async (a_application_login_id) => {
            if (!a_application_login_id) return null;
            const user = await loginModel.findOne({
              where: {
                id: a_application_login_id,
                isDelete: "0",
              },
              attributes: ["username"],
            });
            return user?.username || null;
          };
          // Async function to fetch contact name
          const Contactname = async (contact_master_id) => {
            if (!contact_master_id) return null;
            const user = await sequelize.models.contact_masters.findOne({
              where: {
                id: contact_master_id,
                isDelete: "0",
              },
              attributes: ["person_name"],
            });
            return user?.person_name || null;
          };
          // Async function to fetch product category(-ies) — category_id is
          // a comma-separated list, same convention as product_id below.
          const Productcategory = async (category_id) => {
            if (!category_id) return null;
            const ids = String(category_id)
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean);
            if (ids.length === 0) return null;
            const users = await sequelize.models.categories.findAll({
              where: {
                id: { [Op.in]: ids },
                isDelete: "0",
              },
              attributes: ["category_name"],
            });
            const names = users.map((u) => u.category_name).filter(Boolean);
            return names.length > 0 ? names.join(", ") : null;
          };
          // Async function to fetch product name(s) — product_id is a
          // comma-separated list (an inquiry can reference multiple
          // products), e.g. "5,12,18"; a single product is just "5".
          const Product = async (product_id) => {
            if (!product_id) return null;
            const ids = String(product_id)
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean);
            if (ids.length === 0) return null;
            const users = await sequelize.models.products.findAll({
              where: {
                id: { [Op.in]: ids },
                isDelete: "0",
              },
              attributes: ["product_name"],
            });
            const names = users.map((u) => u.product_name).filter(Boolean);
            return names.length > 0 ? names.join(", ") : null;
          };
          // Fetch data concurrently
          const [contactnameall, productcategory, product, username] =
            await Promise.all([
              Contactname(inquiriesdata.contact_master_id),
              Productcategory(inquiriesdata.category_id),
              Product(inquiriesdata.product_id),
              usernameLiteral(inquiriesdata.a_application_login_id),
            ]);
          const requirementType = inquiriesdata.static == 1 ? "Recurring" : "One time";
          const customInquiryColumnKeys = [
            'column_number_1',
            'column_number_2',
            'column_number_3',
            'column_number_4',
            'column_number_5',
            'column_text_1',
            'column_text_2',
            'column_text_3',
            'column_text_4',
            'column_text_5',
            'column_text_area_1',
            'column_text_area_2',
            'column_text_area_3',
            'column_text_area_4',
            'column_text_area_5',
            'column_date_1',
            'column_date_2',
            'column_date_3',
            'column_date_4',
            'column_date_5',
            'column_date_and_time_1',
            'column_date_and_time_2',
            'column_date_and_time_3',
            'column_date_and_time_4',
            'column_date_and_time_5',
            'column_time_1',
            'column_time_2',
            'column_time_3',
            'column_time_4',
            'column_time_5',
            'column_switch_1',
            'column_switch_2',
            'column_switch_3',
            'column_switch_4',
            'column_switch_5',
            'column_decimal_1',
            'column_decimal_2',
            'column_decimal_3',
            'column_decimal_4',
            'column_decimal_5',
            'column_dropdown_1',
            'column_dropdown_2',
            'column_dropdown_3',
            'column_dropdown_4',
            'column_dropdown_5',
            'column_radio_1',
            'column_radio_2',
            'column_radio_3',
            'column_radio_4',
            'column_radio_5',
          ];

          const filledCustomColumns = customInquiryColumnKeys.filter(key => {
            let value = parsedData[key];
            if (value === undefined || value === null) return false;
            if (typeof value === 'string' && key.includes('switch')) {
              value = value.trim().toLowerCase();
              if (value === 'true') return true;
              if (value === 'false' || value === '' || value === '0') return false;
            }
            if (key.includes('switch')) {
              if (typeof value === 'boolean') return value === true;
              if (typeof value === 'string') {
                return value.trim().toLowerCase() === 'true';
              }
              return false;
            }
            if (key.includes('date') && typeof value === 'string') {
              if (value === '0000-00-00' || value === '' || value.trim() === '') return false;
            }
            if (key.includes('time') && typeof value === 'string') {
              if (value === '00:00:00' || value === '00:00' || value.trim() === '') return false;
            }
            if (typeof value === 'string') {
              return value.trim() !== '';
            }
            if (typeof value === 'number') {
              return true;
            }
            return !!value;
          });

          let customFieldTitles = [];
          if (filledCustomColumns.length > 0) {
            const customFormFiledModel = customFieldFormModel(req.tenantDB);
            const customFields = await customFormFiledModel.findAll({
              where: {
                reference_column_name: filledCustomColumns
              },
              attributes: ['reference_column_name', 'title'],
              raw: true
            });
            const titleMap = {};
            customFields.forEach(field => {
              titleMap[field.reference_column_name] = field.title;
            });

            customFieldTitles = filledCustomColumns.map(key => ({
              key,
              title: titleMap[key] || key.replace(/_/g, ' ').toUpperCase(), // fallback
              value: parsedData[key]
            }));
          }

          let customFieldsHTML = "";
          if (customFieldTitles.length > 0) {
            customFieldsHTML = "<br><b>Custom Fields:</b><br>" +
              customFieldTitles.map(field =>
                `<b>${field.title}:</b> ${field.value}`
              ).join("<br>");
          }

          const msgBody = {
            contact_masters_id: inquiriesdata.contact_master_id,
            a_application_login_id: inquiriesdata.a_application_login_id,
            company_master_id: inquiriesdata.company_master_id || null,
            description: `
            <b> Inquiries</b><br>
            <b> Contact Name:</b> ${contactnameall || "N/A"}<br>
            <b> Product Category Name:</b> ${productcategory || "N/A"}<br>
            <b> Product Name: </b> ${product || "N/A"}<br>
            <b> Required Quantity:</b> ${inquiriesdata.qty || "N/A"}<br>
            <b> Requirement Type:</b>${requirementType || "N/A"}<br>
            <b> Description:</b> ${inquiriesdata.description || "N/A"}<br>
            ${customFieldsHTML}
            `,
            message_side: 1,
            message_type_id: 0,
            application_login_name: username || "N/A",
          };
          // Create the message in the database
          const msg = await sequelize.models.contact_message_histories.create(
            msgBody
          );
          const updateReadIds = await sequelize.models.contact_masters.update({
            is_read_by_a_application_login_id: inquiriesdata.a_application_login_id
          },
            {
              where: {
                id: inquiriesdata.contact_master_id,
              }
            })
          return resSuccess({
            ack_msg: "Inquiry processed successfully.",
            data: { inquiry: createdItem, message: msg },
          });
        } catch (error) {
          console.log("Error processing inquiries:", error.message);
          return resError({
            ack_msg: "Failed to process inquiry.",
            developer_msg: `Error: ${error.message}`,
          });
        }
      }

      if (req.body.table === "contact_message_histories") {
        const assigned_team_member =
          await sequelize.models.contact_masters.findOne({
            where: {
              id: parsedData.contact_masters_id,
              isDelete: 0,
            },
            attributes: ["assinged_to_work_a_application_id", "person_name"],
          });
        const usernameLiteral = async (a_application_login_id) => {
          if (!a_application_login_id) return "Someone";
          const user = await loginModel.findOne({
            where: { id: a_application_login_id, isDelete: "0" },
            attributes: ["username"],
          });
          return user?.username || "Someone";
        };
        const approverUsername = await usernameLiteral(
          parsedData.a_application_login_id
        );

        const updateReadIds = await sequelize.models.contact_masters.update({
          is_read_by_a_application_login_id: parsedData.a_application_login_id
        },
          {
            where: {
              id: parsedData.contact_masters_id,
            }
          })

        if (
          assigned_team_member &&
          assigned_team_member.assinged_to_work_a_application_id
        ) {
          const assignedIds =
            assigned_team_member.assinged_to_work_a_application_id
              .split(",")
              .map((id) => id.trim());
          for (const id of assignedIds) {
            if (id === String(parsedData.a_application_login_id)) {
              continue;
            }
            try {
              const assignedContact = await loginModel.findOne({
                where: {
                  id: id,
                  isDelete: 0,
                },
                attributes: [
                  "web_refresh_token",
                  "android_refresh_token",
                  "ios_refresh_token",
                ],
              });
              if (assignedContact) {
                const tokens = [
                  assignedContact.web_refresh_token,
                  assignedContact.android_refresh_token,
                  assignedContact.ios_refresh_token,
                ].filter((token) => token); // Filter out null/undefined tokens
                if (tokens.length > 0) {
                  await sendMultipleNotification({
                    deviceTokens: tokens,
                    title: `${approverUsername} send a message in ${assigned_team_member.person_name} `,
                    body: ``,
                  });
                } else {
                  console.log(`No valid tokens found for ID ${id}`);
                }
              } else {
                console.log(`No contact found for ID ${id}`);
              }
            } catch (error) {
              console.log(
                `Notification failed for ID ${id} (non-critical):`,
                error.message
              );
            }
          }
        } else {
          console.log("No contact data or assigned IDs found");
        }
      }
      if (table === "account_transactions") {
        const contactdata = await sequelize.models.contact_masters.findOne({
          where: { id: parsedData.contact_masters_id, isDelete: 0 },
          attributes: ["person_name", "assinged_to_work_a_application_id"],
        });
        const company = await getCompanyByLoginId(
          parsedData.a_application_login_id
        );

        if (company.company_flag != 1) {
          if (!contactdata || !contactdata.assinged_to_work_a_application_id) {
            return resError({
              ack_msg: "This contact has not been assigned to you",
            });
          }
        }

        const assignedToWorkAppIds = contactdata.assinged_to_work_a_application_id
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));

        const assignedMemberTokens = await loginModel.findAll({
          where: {
            id: {
              [Op.in]: assignedToWorkAppIds, // Use Sequelize's IN operator to query multiple IDs
            },
            isDelete: 0,
          },
          attributes: [
            "web_refresh_token",
            "android_refresh_token",
            "ios_refresh_token",
          ],
        });
        // Fetch username of the member who added the transaction
        const assignedMemberTo = await loginModel.findOne({
          where: {
            id: parsedData.a_application_login_id,
            isDelete: 0,
          },
          attributes: ["username"],
        });
        // Collect all tokens and remove duplicates
        const allTokens = assignedMemberTokens
          .flatMap((tokenObj) => [
            tokenObj.web_refresh_token,
            tokenObj.android_refresh_token,
            tokenObj.ios_refresh_token,
          ])
          .filter((token) => token && token.trim() !== "");
        const uniqueTokens = [...new Set(allTokens)];
        // Send notifications if tokens are found
        if (uniqueTokens.length > 0) {
          try {
            await sendMultipleNotification({
              deviceTokens: uniqueTokens,
              title: `New Account Transaction Added by ${assignedMemberTo.username}
        in ${contactdata.person_name}`,
              body: "",
            });

          } catch (notificationError) {
            console.log(
              "Notification failed (non-critical):",
              notificationError.message
            );
          }
        } else {
          console.log("No device tokens found for assigned team members.");
        }
      }
      return resSuccess({
        ack_msg: "Data created successfully.",
        data: createdItem,
      });
    }
  } catch (error) {
    console.log("Error in createCommon:", error);
    return resBadRequest({
      developer_msg: `error ${error}`,
    });
  }
};

export const updateCommon = async (req) => {
  let { table, where, data } = req.body;
  try {
    if (!table || !where || !data) {
      return resError({
        ack_msg: "Table, where condition, and data are required.",
        developer_msg: "Required field",
      });
    }

    const whereObj = JSON.parse(where);

    sequelize.models.categories = categoryModel(req.tenantDB);
    sequelize.models.product_groups = productGroupModel(req.tenantDB);
    sequelize.models.warehouses = wareHouseModel(req.tenantDB);
    sequelize.models.task_categories = taskCategoryModel(req.tenantDB);
    sequelize.models.bill_of_materials_masters = billOfMaterialsModel(req.tenantDB);
    sequelize.models.payment_types = paymentTypeModel(req.tenantDB);
    sequelize.models.expense_type_masters = expenseTypeModel(req.tenantDB);
    sequelize.models.visit_type_masters = visitTypeModel(req.tenantDB);
    sequelize.models.leave_type_masters = leaveTypeModel(req.tenantDB);
    sequelize.models.leaves = leavesModel(req.tenantDB);
    sequelize.models.visits = visitsModel(req.tenantDB);
    sequelize.models.expenses = expensesModel(req.tenantDB);
    sequelize.models.contact_masters = contactModel(req.tenantDB);
    sequelize.models.holidays = holidayModel(req.tenantDB);
    sequelize.models.lock_controls = lockcontrolModel(req.tenantDB);
    sequelize.models.adjustment_types = AdjustmentTypes(req.tenantDB);
    sequelize.models.day_conversions = dayConversionModel(req.tenantDB);
    sequelize.models.route_planners = routePlannerModel(req.tenantDB);
    sequelize.models.products = productModel(req.tenantDB);
    sequelize.models.pricelist_masters = priceListMastersModel(req.tenantDB);
    sequelize.models.price_lists = priceListModel(req.tenantDB);
    sequelize.models.source_types = sourceTypesModel(req.tenantDB);
    sequelize.models.lable_masters = labelModel(req.tenantDB);
    sequelize.models.warehouses = wareHouseModel(req.tenantDB);
    sequelize.models.custom_field_form_masters = customFieldFormModel(
      req.tenantDB
    );
    sequelize.models.stage_status_masters = stagestatusModel(req.tenantDB);
    sequelize.models.task_templete_masters = taskTemplateModel(req.tenantDB);

    sequelize.models.personal_notes = personalNotesModel(req.tenantDB);
    sequelize.models.contact_message_histories = contactMessageHistory(
      req.tenantDB
    );
    sequelize.models.task_message_histories = taskMessageHistroyModel(
      req.tenantDB
    );
    sequelize.models.account_transactions = accountTransactionsModel(
      req.tenantDB
    );
    sequelize.models.employee_account_transactions = employeeAccountTransactionsModel(
      req.tenantDB
    );
    sequelize.models.reminder_messages = reminderMessagesModel(req.tenantDB);
    sequelize.models.inquiries = inquiryModel(req.tenantDB);
    sequelize.models.carts = cartModel(req.tenantDB);
    sequelize.models.cart_items = cartItemModel(req.tenantDB);
    sequelize.models.cart_vs_serial_numbers = cartSerialNumberModel(req.tenantDB);
    sequelize.models.target_vs_incentives = targetVsIncentiveModel(
      req.tenantDB
    );
    sequelize.models.a_countries = countryModel(req.tenantDB);
    sequelize.models.a_states = stateModel(req.tenantDB);
    sequelize.models.a_cities = cityModel(req.tenantDB);
    sequelize.models.a_areas = areaModel(req.tenantDB);
    sequelize.models.departments = departmentModel(req.tenantDB);
    sequelize.models.task_managements = taskManagementModel(req.tenantDB);
    sequelize.models.machine_managements = machineManagementModel(req.tenantDB);
    sequelize.models.task_templete_datasources = taskTemplateDatasource(req.tenantDB);
    sequelize.models.custom_field_form_datavalues = customFieldDatavaluesModel(req.tenantDB);
    sequelize.models.wrkflw_auto_assignment_of_contacts = wrkflwAutoAssignmentContactModel(req.tenantDB);
    sequelize.models.product_unit_masters = productUnitMasterModel(req.tenantDB);
    sequelize.models.employee_payrolls = employeePayrollModel(req.tenantDB);
    sequelize.models.process_masters = processMastersModel(req.tenantDB);
    sequelize.models.tax_masters = taxModel(req.tenantDB);


    const parsedData = JSON.parse(data);

    let duplicationCheckFields = {};

    if (table === "contact_masters") {
      if (parsedData.mobile_number) {
        parsedData.raw_mobile_number = parsedData.mobile_number;
        parsedData.mobile_number = normalizeToTenDigit(parsedData.mobile_number);
        data = JSON.stringify(parsedData);
      }
      const contact_mobile_number = parsedData.mobile_number;
      if (contact_mobile_number) {
        const findCompanyId = await getCompanyByLoginId(
          req.headers["x-tenant-id"]
        );
        const companyData = await companyModel.findOne({
          where: { id: findCompanyId.company_masters_id, isDelete: 0 },
          attributes: ["is_contact_validation"],
        });
        if (companyData?.is_contact_validation == 1) {
          const contactDuplication =
            await sequelize.models.contact_masters.findOne({
              where: {
                id: { [Op.ne]: whereObj.id },
                mobile_number: contact_mobile_number,
                isDelete: 0,
              },
              attributes: ["id"],
            });
          if (contactDuplication != null) {
            return resError({
              ack_msg: "Duplicate Mobile Number Found",
              developer_msg: "Duplicate Mobile Number Found",
            });
          }
        }
      }

      if (isValid(parsedData.client_code)) {
        const contact_client_code = parsedData.client_code;
        if (contact_client_code) {
          const contactDuplication =
            await sequelize.models.contact_masters.findOne({
              where: {
                id: { [Op.ne]: whereObj.id },
                client_code: contact_client_code,
                isDelete: 0,
              },
              attributes: ["id"],
            });
          if (contactDuplication != null) {
            return resError({
              ack_msg: "This client code already exists",
              developer_msg: "This client code already exists",
            });
          }
        }
      }
    }
    if (table === "a_states") {
      if (parsedData.isDelete != 1) {
        duplicationCheckFields = {
          state_name: parsedData.state_name,
          country_id: parsedData.country_id,
          id: { [Op.ne]: parsedData.id },
          isDelete: "0",
        };
      } else {
        const cities = await sequelize.models.a_cities.findAll({
          where: {
            state_id: whereObj.id,
          },
        });

        if (cities.length > 0) {
          return resError({
            ack_msg: "City Is Available in this State please delete it first",
          });
        }
      }
    } else if (table === "a_cities") {
      if (parsedData.isDelete != 1) {
        duplicationCheckFields = {
          state_id: parsedData.state_id,
          country_id: parsedData.country_id,
          id: { [Op.ne]: parsedData.id },
          city_name: parsedData.city_name,
          isDelete: "0",
        };
      } else {
        const areas = await sequelize.models.a_areas.findAll({
          where: {
            city_id: whereObj.id,
          },
        });
        if (areas.length > 0) {
          return resError({
            ack_msg: "Areas Is Available in this City please delete it first",
          });
        }
      }
    } else if (table === "a_areas") {
      duplicationCheckFields = {
        area_name: parsedData.area_name,
        country_id: parsedData.country_id,
        state_id: parsedData.state_id,
        id: { [Op.ne]: parsedData.id },
        city_id: parsedData.city_id,
        isDelete: "0",
      };
    } else if (table == "a_countries") {
      if (parsedData.isDelete != 1) {
        duplicationCheckFields = {
          country_name: parsedData.country_name,
          country_code: parsedData.country_code,
          isDelete: "0",
        };
      } else {
        const stateData = await sequelize.models.a_states.findAll({
          where: {
            country_id: whereObj.id,
          },
        });
        if (stateData.length > 0) {
          return resError({
            ack_msg:
              "State Is Available in this Country please delete it first",
          });
        }
      }
    }

    if (
      ["a_states", "a_cities", "a_areas", "a_countries"].includes(table) &&
      parsedData.isDelete != 1
    ) {
      const isDuplicate = await checkDuplicationCommon(
        table,
        duplicationCheckFields,
        req.tenantDB
      );
      if (isDuplicate) {
        return resError({
          ack_msg: "This value is already available in System",
          developer_msg: "Duplicate record found.",
        });
      }
    }

    if (table == "custom_field_form_masters" && parsedData.isDelete == 1 && req.body.columnNameForDelete != undefined) {
      try {
        const referanceColumn = await sequelize.models.custom_field_form_masters.findOne({
          where: {
            id: whereObj.id
          },
          attributes: ["form_type", "reference_column_name"],
          raw: true
        })

        const updateColumn = {
          [req.body.columnNameForDelete]: " "
        };

        const deleteCustomform = await sequelize.models.custom_field_form_masters.update({
          isDelete: 1
        }, {
          where: {
            id: whereObj.id
          }
        })

        const deleteCustomformDatavalue = await sequelize.models.custom_field_form_datavalues.update({
          isDelete: 1
        }, {
          where: {
            custom_field_master_id: whereObj.id
          }
        })

        if (referanceColumn.form_type == 1) {
          const contactColumnCheck = await sequelize.models.contact_masters.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });

          if (contactColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 2) {
          const inquiryColumnCheck = await sequelize.models.inquiries.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });

          if (inquiryColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 3) {
          const visitColumnCheck = await sequelize.models.visits.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });

          if (visitColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 4) {
          const productColumnCheck = await sequelize.models.products.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });
          const cartitemColumnCheck = await sequelize.models.cart_items.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });

          if (productColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 5) {
          const cartColumnCheck = await sequelize.models.carts.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
              type: 1
            }
          });

          if (cartColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 6) {
          const cartColumnCheck = await sequelize.models.carts.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
              type: 2
            }
          });

          if (cartColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 7) {
          const cartColumnCheck = await sequelize.models.carts.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
              type: 3
            }
          });

          if (cartColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 8) {
          const cartColumnCheck = await sequelize.models.carts.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
              type: 4
            }
          });

          if (cartColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 9) {
          const cartColumnCheck = await sequelize.models.carts.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
              type: 5
            }
          });

          if (cartColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 14) {
          const taskColumnCheck = await sequelize.models.task_managements.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });

          if (taskColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 15) {
          const supportTicketColumnCheck = await sequelize.models.task_managements.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
            }
          });

          if (supportTicketColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else if (referanceColumn.form_type == 16) {
          const cartColumnCheck = await sequelize.models.carts.update(updateColumn, {
            where: {
              id: { [Op.gt]: 0 },
              type: 12
            }
          });

          if (cartColumnCheck) {
            return resSuccess({
              ack_msg: "Custom form field and data is deleted successfully"
            })
          }
        }
        else {
          return resError({
            developer_msg: "referanceColumn.form_type is not match please try another field"
          })
        }

      }
      catch (e) {
        return resError({
          ack_msg: "Please Try Again"
        })
      }
    }

    if (table === "contact_masters" && parsedData.assinged_to_work_a_application_id) {
      const assignedIds = parsedData.assinged_to_work_a_application_id
        .split(",")
        .map((id) => id.trim());

      const assignedTokenData = await loginModel.findAll({
        where: {
          id: assignedIds,
          isDelete: 0,
        },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
          "reporting_member",
          "username",
        ],
      });

      let allTokens = [];

      for (const tokenData of assignedTokenData) {
        allTokens.push(
          tokenData.web_refresh_token,
          tokenData.android_refresh_token,
          tokenData.ios_refresh_token
        );

        const reportingMemberId = tokenData.reporting_member;
        if (reportingMemberId) {
          const reportingMemberData = await loginModel.findOne({
            where: { id: reportingMemberId, isDelete: 0 },
            attributes: [
              "web_refresh_token",
              "android_refresh_token",
              "ios_refresh_token",
            ],
          });

          if (reportingMemberData) {
            allTokens.push(
              reportingMemberData.web_refresh_token,
              reportingMemberData.android_refresh_token,
              reportingMemberData.ios_refresh_token
            );
          }
        }
      }

      const uniqueTokens = [
        ...new Set(allTokens.filter((token) => token && token.trim() !== "")),
      ];

      if (uniqueTokens.length > 0) {
        // Deep has been assigned leads to Arjun.
        try {
          await sendMultipleNotification({
            deviceTokens: uniqueTokens,
            title: "A New Member has been Assigned to this Contact",
          });

        } catch (notificationError) {
          console.log(
            "Notification failed (non-critical):",
            notificationError.message
          );
        }
      } else {
        console.log(
          "No device tokens found for assigned users or their reporting members."
        );
      }
    }

    if (table === "contact_masters" && parsedData.contact_status) {
      try {
        // Wrapped in an IIFE so the early "nothing to notify" exits below
        // only skip this notification step, not the whole updateCommon
        // response (a bare `return` here previously aborted the entire
        // function with no response body whenever the contact had no
        // assigned owner - e.g. any status change on an unassigned contact).
        await (async () => {
          const assignedIds = Array.isArray(whereObj.id)
            ? whereObj.id
            : [whereObj.id];
          const contactData = await sequelize.models.contact_masters.findAll({
            where: { id: assignedIds },
            attributes: ["a_application_login_id"],
          });

          if (!contactData.length) {
            return;
          }

          const loginIds = contactData
            .map((contact) => contact.a_application_login_id)
            .filter((id) => id);

          if (!loginIds.length) {
            return;
          }

          const assignedTokenData = await loginModel.findAll({
            where: {
              id: loginIds,
              isDelete: 0,
            },
            attributes: [
              "web_refresh_token",
              "android_refresh_token",
              "ios_refresh_token",
              "reporting_member",
            ],
          });

          if (!assignedTokenData.length) {
            return;
          }

          const allTokens = [];
          const reportingMemberIds = new Set();

          for (const tokenData of assignedTokenData) {
            allTokens.push(
              tokenData.web_refresh_token,
              tokenData.android_refresh_token,
              tokenData.ios_refresh_token
            );
            if (tokenData.reporting_member) {
              reportingMemberIds.add(tokenData.reporting_member);
            }
          }

          if (reportingMemberIds.size > 0) {
            const reportingMemberData = await loginModel.findAll({
              where: {
                id: Array.from(reportingMemberIds),
                isDelete: 0,
              },
              attributes: [
                "web_refresh_token",
                "android_refresh_token",
                "ios_refresh_token",
              ],
            });

            for (const reportingMember of reportingMemberData) {
              allTokens.push(
                reportingMember.web_refresh_token,
                reportingMember.android_refresh_token,
                reportingMember.ios_refresh_token
              );
            }
          }

          const uniqueTokens = [
            ...new Set(allTokens.filter((token) => token && token.trim() !== "")),
          ];

          if (uniqueTokens.length > 0) {
            await sendMultipleNotification({
              deviceTokens: uniqueTokens,
              title: "Contact status updated successfully",
            });

          } else {
            console.log(
              "No valid device tokens found for assigned users or their reporting members."
            );
          }
        })();
      } catch (error) {
        console.log("Error processing notifications:", error.message);
      }
    }

    let whereClause12;
    if (
      table === "source_types" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "lable_masters" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "stage_status_masters" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "expense_type_masters" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "visit_type_masters" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "leave_type_masters" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "departments" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "task_categories" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "a_countries" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "a_states" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "a_cities" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (
      table === "a_areas" &&
      parsedData.isDelete === "1" &&
      typeof whereObj.id === "string" &&
      whereObj.id.includes(",")
    ) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id.split(",").map(Number),
      };
    } else if (whereObj.id) {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.id,
      };
    } else if (whereObj.reference_id) {
      whereClause12 = {
        isDelete: 0,
        reference_id: whereObj.reference_id,
      };
    } else {
      whereClause12 = {
        isDelete: 0,
        id: whereObj.reference_id,
      };
    }

    if (table === "reminder_messages") {
      if (!whereClause12) {
        console.log("whereClause12 is undefined or invalid");
        return resBadRequest({
          ack_msg: "Invalid update target",
          developer_msg: "whereClause12 is undefined or invalid",
        });
      }

      const reminderMessages = await sequelize.models.reminder_messages.findAll({
        where: {
          ...whereClause12,
        },
      });

      const assignedIds = reminderMessages.map(
        (reminder) => reminder.assigned_to
      );
      const reportingIds = reminderMessages
        .filter((reminder) => reminder.a_application_login_id)
        .map((reminder) => reminder.a_application_login_id);
      const allIds = [...new Set([...assignedIds, ...reportingIds])];

      const allTokens = await loginModel.findAll({
        where: {
          id: allIds,
          isDelete: 0,
        },
        attributes: [
          "id",
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
          "username",
          "reporting_member",
        ],
      });

      const tokenMap = new Map(allTokens.map((token) => [token.id, token]));

      let iterationCount = 0;
      const maxIterations = 1000;

      for (const reminder of reminderMessages) {
        if (iterationCount >= maxIterations) {
          console.log("Max iterations reached, breaking loop");
          break;
        }
        iterationCount++;
        console.log(`Processing reminder ID: ${reminder.id}`);

        // Skip completed reminders for non-deletion updates
        if (parsedData.isDelete !== "1" && reminder.is_completed === 1) {
          console.log(`Skipping completed reminder ID: ${reminder.id}`);
          continue;
        }

        const assignedMemberTokens = tokenMap.get(reminder.assigned_to) || {};
        const assignedMemberTo =
          tokenMap.get(reminder.a_application_login_id) || {};

        let reportingMemberTokens = [];
        if (assignedMemberTo?.reporting_member) {
          reportingMemberTokens = [
            tokenMap.get(assignedMemberTo.reporting_member) || {},
          ];
        }

        const allTokens = [...[assignedMemberTokens], ...reportingMemberTokens]
          .flatMap((tokenObj) => [
            tokenObj.web_refresh_token,
            tokenObj.android_refresh_token,
            tokenObj.ios_refresh_token,
          ])
          .filter((token) => token && token.trim() !== "");

        const uniqueTokens = [...new Set(allTokens)];

        if (uniqueTokens.length > 0) {
          try {
            // Fetch contact name from contact_masters using contact_masters_id
            const contact = await sequelize.models.contact_masters.findOne({
              where: {
                id: reminder.contact_masters_id,
                isDelete: 0, // Ensure the contact is not deleted
              },
              attributes: ["person_name"],
            });

            // Construct the notification title based on whether it's a deletion
            const contactName = contact?.person_name || "";
            let notificationTitle;
            if (parsedData.isDelete === "1") {
              notificationTitle = contactName
                ? `Reminder #${whereObj.id} of ${contactName} has been deleted`
                : `Reminder #${whereObj.id} has been deleted`;
            } else {
              notificationTitle = contactName
                ? `${assignedMemberTo?.username || "Someone"} has completed #${whereObj.id
                } reminder of ${contactName}`
                : `${assignedMemberTo?.username || "Someone"} has completed #${whereObj.id
                } reminder`;
            }

            await sendMultipleNotification({
              deviceTokens: uniqueTokens,
              title: notificationTitle,
            });
          } catch (notificationError) {
            console.log(
              "Notification failed for reminder ID:",
              reminder.id,
              notificationError.message
            );
          }
        } else {
          console.log(
            "No device tokens found for assigned team members or reporting member for reminder ID:",
            reminder.id
          );
        }
      }
    }

    let updateData = JSON.parse(data);

    if (table === "a_application_logins") {
      if (updateData.employee_id) {
        const employeeIDDuplication =
          await loginModel.findOne({
            where: {
              id: { [Op.ne]: whereObj.id },
              employee_id: updateData.employee_id,
              isDelete: 0,
            },
            attributes: ["employee_id"],
          });
        if (employeeIDDuplication != null) {
          return resError({
            ack_msg: "Duplicate Employee ID Found",
            developer_msg: "Duplicate Employee ID Found",
          });
        }
      }
      if (Array.isArray(updateData.expense_types)) {
        updateData.expense_types = updateData.expense_types
          .filter(id => id != null && id !== '')
          .map(id => String(id).trim())
          .join(',');
      }

      // Week Off Days (comma separated IDs)
      if (Array.isArray(updateData.week_off_days)) {
        updateData.week_off_days = updateData.week_off_days
          .filter(id => id != null && id !== '')
          .map(id => String(id).trim())
          .join(',');
      }
    }

    const [rowsUpdated, updatedRows] = await sequelize.models[table].update(
      updateData,
      {
        where: whereClause12,
        returning: true,
      }
    );
    if (table === "contact_masters" && parsedData.contact_status) {
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "contact_masters",
          reference_id: whereObj.id,
          status_id: parsedData.contact_status,
          a_application_login_id: req.headers["x-tenant-id"]
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    }

    if (table === "inquiries" && parsedData.contact_status) {
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "inquiries",
          reference_id: whereObj.id,
          status_id: parsedData.contact_status,
          a_application_login_id: req.headers["x-tenant-id"]
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    }

    if (table === "carts" && parsedData.cart_status) {
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      const updatedRowsDataFetch = await sequelize.models.carts.findOne({
        where: {
          isDelete: 0,
          id: whereObj.id
        },
        raw: true,
        attributes: ["type"]
      })

      await insertStagesAndStatusLogs(req,
        {
          reference_table: "carts",
          reference_id: whereObj.id,
          status_id: parsedData.cart_status,
          a_application_login_id: req.headers["x-tenant-id"],
          inside_table_type: updatedRowsDataFetch.type
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    }

    if (table === "task_managements" && parsedData.status) {

      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "task_managements",
          reference_id: whereObj.id,
          status_id: parsedData.status,
          a_application_login_id: req.headers["x-tenant-id"]
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    }
    if (table === "task_managements" && parsedData.external_status) {

      /* Status Log Entry Added BY Keval -> 30-03-2026 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "task_managements",
          reference_id: whereObj.id,
          status_id: parsedData.external_status,
          a_application_login_id: req.headers["x-tenant-id"]
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    }

    if (table === "task_managements" && parsedData.status) {
      const taskData = await sequelize.models.task_managements.findOne({
        where: { id: whereObj.id, isDelete: 0 }
      });
      const statusName = await sequelize.models.stage_status_masters.findOne({
        where: {
          id: parsedData.status,
          isDelete: 0,
        },
        attributes: ["id", "name"],
      });
      const loginName = await loginModel.findOne({
        where: {
          id: req.headers["x-tenant-id"],
          isDelete: 0,
        },
        attributes: ["username"],
      });
      const message = "Task #" + whereObj.id + "'s status has been changed to " + (statusName?.name || parsedData.status) + " by " + loginName.username;
      await sequelize.models.task_message_histories.create({
        description: message,
        message_side: 1,
        a_application_login_id: req.headers["x-tenant-id"],
        task_id: whereObj.id,
        application_login_name: loginName.username,
        entry_flag: 0,
        message_type_id: 0,
        is_reminder: 0
      });
      if (taskData) {

        if (parsedData.status == "-6" && isValid(taskData.dataValues.grouped_task_unque_key)) {
          const record = await sequelize.models.task_managements.findOne({
            where: {
              isDelete: 0,
              id: { [Op.ne]: whereObj.id },
              status: { [Op.ne]: '-6' },
              grouped_task_unque_key: taskData.dataValues.grouped_task_unque_key,
              template_seq_no: {
                [Op.gte]: taskData.dataValues.template_seq_no
              }
            },
            order: [["template_seq_no", "ASC"]]
          });

          if (record) {
            await record.update({
              is_not_visible: 0
            });
          }
        }

        const teamMembers = taskData.dataValues.assigned_team_member;
        const assignedMembersString = teamMembers
          ? String(teamMembers)
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id)
            .join(",")
          : "";
        if (assignedMembersString) {
          const assignedMemberIds = assignedMembersString.split(",").map((id) => id.trim());

          // Fetch usernames and tokens for all assigned members
          const assignedMembers = await loginModel.findAll({
            where: {
              id: assignedMemberIds,
              isDelete: 0,
            },
            attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
          });

          // Collect all device tokens
          const allTokens = assignedMembers
            .flatMap((member) => [
              member.web_refresh_token,
              member.android_refresh_token,
              member.ios_refresh_token,
            ])
            .filter((token) => token && token.trim() !== "");

          const uniqueTokens = [...new Set(allTokens)];
          if (uniqueTokens.length > 0) {
            try {
              // Get the assigner's username (assuming a_application_login_id is the assigner)
              const assigner = await loginModel.findOne({
                where: {
                  id: req.headers["x-tenant-id"],
                  isDelete: 0,
                },
                attributes: ["username"],
              });

              const assignerName = assigner?.username || "Someone";
              // Send notifications to all assigned members
              await sendMultipleNotification({
                deviceTokens: uniqueTokens,
                title: `Task #${whereObj.id}'s status has been changed to ${statusName?.name || parsedData.status} by ${loginName.username}`,
                body: `Task: ${taskData.dataValues.task_title}`,
              });
            } catch (notificationError) {
              console.log("Notification failed (non-critical):", { notificationError });
            }
          } else {
            console.log("No device tokens found for assigned team members.");
          }
        }
      }
    } else if (table === "task_managements" && parsedData.assigned_team_member) {
      const taskData = await sequelize.models.task_managements.findOne({
        where: { id: whereObj.id, isDelete: 0 }
      });
      const loginName = await loginModel.findOne({
        where: {
          id: req.headers["x-tenant-id"],
          isDelete: 0,
        },
        attributes: ["username"],
      });
      if (taskData) {
        const teamMembers = parsedData.assigned_team_member;
        const assignedMembersString = teamMembers
          ? String(teamMembers)
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id)
            .join(",")
          : "";
        if (assignedMembersString) {
          const assignedMemberIds = assignedMembersString.split(",").map((id) => id.trim());

          // Fetch usernames and tokens for all assigned members
          const assignedMembers = await loginModel.findAll({
            where: {
              id: assignedMemberIds,
              isDelete: 0,
            },
            attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
          });

          // Collect all device tokens
          const allTokens = assignedMembers
            .flatMap((member) => [
              member.web_refresh_token,
              member.android_refresh_token,
              member.ios_refresh_token,
            ])
            .filter((token) => token && token.trim() !== "");

          const uniqueTokens = [...new Set(allTokens)];
          if (uniqueTokens.length > 0) {
            try {
              // Get the assigner's username (assuming a_application_login_id is the assigner)
              const assigner = await loginModel.findOne({
                where: {
                  id: req.headers["x-tenant-id"],
                  isDelete: 0,
                },
                attributes: ["username"],
              });

              const assignerName = assigner?.username || "Someone";
              // Send notifications to all assigned members
              await sendMultipleNotification({
                deviceTokens: uniqueTokens,
                title: `${loginName.username} assigned team member(s) to Task #${whereObj.id}`,
                body: `Task: ${taskData.dataValues.task_title}`,
              });
            } catch (notificationError) {
              console.log("Notification failed (non-critical):", { notificationError });
            }
          } else {
            console.log("No device tokens found for assigned team members.");
          }
        }
      }
    } else if (table === "task_managements" && parsedData.external_status) {
      const taskData = await sequelize.models.task_managements.findOne({
        where: { id: whereObj.id, isDelete: 0 }
      });
      const statusName = await sequelize.models.stage_status_masters.findOne({
        where: {
          id: parsedData.external_status,
          isDelete: 0,
          visibility: 1,
        },
        attributes: ["id", "name"],
      });
      const loginName = await loginModel.findOne({
        where: {
          id: req.headers["x-tenant-id"],
          isDelete: 0,
        },
        attributes: ["username"],
      });

      const message = "Task #" + whereObj.id + "'s status has been changed to " + (statusName?.name || parsedData.external_status) + " by " + loginName.username;
      await sequelize.models.task_message_histories.create({
        description: message,
        message_side: 2,
        a_application_login_id: req.headers["x-tenant-id"],
        task_id: whereObj.id,
        application_login_name: loginName.username,
        entry_flag: 0,
        message_type_id: 0,
        is_reminder: 0
      });
      if (taskData) {

        if (parsedData.status == "-6" && isValid(taskData.dataValues.grouped_task_unque_key)) {
          const record = await sequelize.models.task_managements.findOne({
            where: {
              isDelete: 0,
              id: { [Op.ne]: whereObj.id },
              status: { [Op.ne]: '-6' },
              grouped_task_unque_key: taskData.dataValues.grouped_task_unque_key,
              template_seq_no: {
                [Op.gte]: taskData.dataValues.template_seq_no
              }
            },
            order: [["template_seq_no", "ASC"]]
          });

          if (record) {
            await record.update({
              is_not_visible: 0
            });
          }
        }

        const teamMembers = taskData.dataValues.assigned_team_member;
        const assignedMembersString = teamMembers
          ? String(teamMembers)
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id)
            .join(",")
          : "";
        if (assignedMembersString) {
          const assignedMemberIds = assignedMembersString.split(",").map((id) => id.trim());

          // Fetch usernames and tokens for all assigned members
          const assignedMembers = await loginModel.findAll({
            where: {
              id: assignedMemberIds,
              isDelete: 0,
            },
            attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
          });

          // Collect all device tokens
          const allTokens = assignedMembers
            .flatMap((member) => [
              member.web_refresh_token,
              member.android_refresh_token,
              member.ios_refresh_token,
            ])
            .filter((token) => token && token.trim() !== "");

          const uniqueTokens = [...new Set(allTokens)];
          if (uniqueTokens.length > 0) {
            try {
              // Get the assigner's username (assuming a_application_login_id is the assigner)
              const assigner = await loginModel.findOne({
                where: {
                  id: req.headers["x-tenant-id"],
                  isDelete: 0,
                },
                attributes: ["username"],
              });

              const assignerName = assigner?.username || "Someone";
              // Send notifications to all assigned members
              await sendMultipleNotification({
                deviceTokens: uniqueTokens,
                title: `Task #${whereObj.id}'s status has been changed to ${statusName?.name || parsedData.external_status} by ${loginName.username}`,
                body: `Task: ${taskData.dataValues.task_title}`,
              });
            } catch (notificationError) {
              console.log("Notification failed (non-critical):", { notificationError });
            }
          } else {
            console.log("No device tokens found for assigned team members.");
          }
        }
      }
    }

    if (rowsUpdated === 0) {
      return resError({
        ack_msg: "No records updated",
        developer_msg: "Data not match",
      });
    }

    if (req.body.request_flag === "CreateCompanyNotExists") {
      const token = jwt.sign(
        {
          a_application_login_id: Number(req.body.a_application_login_id),
        },
        JWT_TOKEN_SIGNATURE,
        { expiresIn: JWT_TOKEN_EXPIRES_TIME }
      );
      return resSuccess({
        ack_msg: "Data updated successfully.",
        data: { item: updatedRows, token },
      });
    } else {
      return resSuccess({
        data: updatedRows,
        ack_msg: "Data updated successfully.",
      });
    }
  } catch (e) {
    console.error("updateCommon error", e);
    return resBadRequest({
      developer_msg: `error ${e}`,
    });
  }
};

export const authCheck = async (req) => {
  return resSuccess({
    ack_msg: "You Are Verfied"
  })
};

export const getAllMainCommon = async (req) => {
  let table, columns, where, order, request_flag;

  if (req.body) {
    ({ table, columns, where, order, request_flag } = req.body);
  } else {
    ({ table, columns, where, order, request_flag } = req);
  }
  try {
    let queryOptions = {
      attributes: columns.split(",").map((column) => column.trim()),
    };
    if (request_flag === 0) {
      const whereConditions = await Promise.all(
        where.map(async (condition) => {
          const [column, value] = condition.split("=");
          if (column.trim() === "a_application_login_id") {
            const [firstValue] = value.split("||");
            const findCompanyId = await getCompanyByLoginId(firstValue.trim());

            if (findCompanyId && findCompanyId.company_masters_id) {

              return {
                company_masters_id: findCompanyId.company_masters_id,
              };
            }
          }
          if (value.includes("||")) {
            return {
              [column.trim()]: {
                [Op.or]: value.split("||").map((orValue) => orValue.trim()),
              },
            };
          } else {
            return { [column.trim()]: value.trim() };
          }
        })
      );

      queryOptions = {
        ...queryOptions,
        where: {
          [Op.and]: whereConditions,
        },
      };
    } else {
      if (where) {
        const whereObj = JSON.parse(where);
        let findCompanyId = null;

        const activeCompanyHeader = req?.headers?.["x-company-id"];

        if (table === "company_masters" && activeCompanyHeader && !whereObj.qr_code) {
          queryOptions.where = {
            ...whereObj,
            id: Number(activeCompanyHeader),
          };
          delete queryOptions.where.a_application_login_id;
        } else {
          if (whereObj.a_application_login_id) {
            if (table === "company_masters" && activeCompanyHeader && !whereObj.qr_code) {
              queryOptions.where = {
                ...whereObj,
                id: Number(activeCompanyHeader),
              };
              delete queryOptions.where.a_application_login_id;
            } else {
              findCompanyId = await getCompanyByLoginId(
                whereObj.a_application_login_id
              );
            }
          }

          if (queryOptions.where) {
            // Already set above for company_masters with activeCompanyHeader
          } else if (request_flag === 2 && findCompanyId?.company_masters_id) {
            queryOptions.where = {
              id: findCompanyId.company_masters_id,
            };
          } else if (findCompanyId?.company_masters_id) {
            queryOptions.where = {
              ...whereObj,
              id: findCompanyId.company_masters_id,
            };
          } else {
            queryOptions.where = whereObj;
          }
        }
      }

      if (order) {
        const orderObj = JSON.parse(order);
        const orderBy = [
          [...Object.keys(orderObj), ...Object.values(orderObj)],
        ];
        queryOptions.order = orderBy;
      }
    }

    sequelize.models.company_masters = companyModel;
    const result = await sequelize.models[table].findAll(queryOptions);
    if (!result || result.length === 0) {
      return resError({
        ack_msg: "No Data Found",
        developer_msg: "Record(s) not found",
      });
    }

    if (table === "company_masters" && result.length > 0) {
      const mainRecord = result[0];
      const childData = typeof mainRecord.toJSON === "function" ? mainRecord.toJSON() : mainRecord;
      let parentCompId = childData.parent_company_id;
      if (!parentCompId && childData.id) {
        const dbCheck = await companyModel.findOne({
          where: { id: childData.id, isDelete: 0 },
          attributes: ["parent_company_id"],
          raw: true,
        });
        parentCompId = dbCheck?.parent_company_id;
      }

      if (parentCompId) {
        const parentRecord = await companyModel.findOne({
          where: { id: parentCompId, isDelete: 0 },
          attributes: queryOptions.attributes,
        });
        if (parentRecord) {
          const parentData = typeof parentRecord.toJSON === "function" ? parentRecord.toJSON() : parentRecord;
          const mergedValues = { ...parentData };
          for (const key of Object.keys(childData)) {
            const val = childData[key];
            if (val !== null && val !== "" && val !== undefined) {
              mergedValues[key] = val;
            }
          }
          result[0] = mergedValues;
        }
      }
    }

    return resSuccess({
      data: result,
    });
  } catch (e) {
    console.log("getAllMainCommon error", e)
    return resBadRequest({ developer_msg: `Error ${e}` });
  }
};

export const createMainCommon = async (req) => {
  try {
    let table, data;
    if (req.body) {
      table = req.body.table;
      data = req.body.data;
    } else {
      table = req.table;
      data = req.data;
    }

    if (!table || !data) {
      return resError({
        ack_msg: "Table and data are required.",
        developer_msg: "Required fields are missing.",
      });
    }
    const parsedData = JSON.parse(data);
    if (!sequelize.models[table]) {
      return resError({
        ack_msg: `Invalid table name. `,
        developer_msg: `Table '${table}' not found in models.`,
      });
    }

    if (
      table !== "company_masters" &&
      table !== "company_vs_application_logins" &&
      req.body.request_flag !== "CreateCompanyNotExists"
    ) {
      if (parsedData.a_application_login_id) {
        const findCompanyId = await getCompanyByLoginId(
          parsedData.a_application_login_id
        );
        parsedData.company_masters_id = findCompanyId.company_masters_id;
      }
    }

    const createdItem = await sequelize.models[table].create(parsedData);

    if (!createdItem) {
      return resError({
        ack_msg: "Failed to create record.",
        developer_msg: "Database error occurred.",
      });
    }

    if (req.body.request_flag === "msg" && parsedData.message_side === 1) {
      let contact_masters_id = parsedData.contact_masters_id;
      // const requestData = {
      //   table: "contact_masters",
      //   columns: "id,mobile_number",
      //   where: `{\"isDelete\":\"0\",\"id\":\"${contact_masters_id}\,"}`,
      // };
      const requestData = {
        table: "contact_masters",
        columns: "id,mobile_number",
        where: {
          isDelete: "0",
          id: contact_masters_id,
        },
      };
      const getContactById = await rp_getValue(requestData);
      let contact_master_number =
        WHATSAPP_SEND_ADD_PRE_NUMBER + `${getContactById.data}`;
      let contact_history_message = parsedData.description;
      const whatsappReqestFlag = "msg";
      addContactByWhatsApps(
        req,
        whatsappReqestFlag,
        contact_master_number,
        contact_history_message,
        parsedData.a_application_login_id
      );
    }

    if (req.body.request_flag === "CreateCompanyNotExists") {
      const token = jwt.sign(
        {
          a_application_login_id: createdItem.dataValues.a_application_login_id,
        },
        JWT_TOKEN_SIGNATURE,
        { expiresIn: JWT_TOKEN_EXPIRES_TIME }
      );
      return resSuccess({
        data: { item: createdItem, token },
      });
    } else {
    }
    return resSuccess({
      data: createdItem,
    });
  } catch (error) {
    console.log("Error in createCommon:", error);
    return resBadRequest({
      developer_msg: `error ${error}`,
    });
  }
};

export const updateMainCommon = async (req) => {
  const { table, where, data } = req.body;

  try {
    if (!table || !where || !data) {
      return resError({
        ack_msg: "Table, where condition, and data are required.",
        developer_msg: "Required filed",
      });
    }

    const whereObj = JSON.parse(where);
    const updateData = JSON.parse(data);
    const [rowsUpdated, updatedRows] = await sequelize.models[table].update(
      updateData,
      {
        where: whereObj,
        returning: true,
      }
    );

    if (rowsUpdated === 0) {
      return resError({
        ack_msg: "No records updated",
        developer_msg: "Data not match",
      });
    }
    if (
      table === "company_vs_application_logins" &&
      updateData.isDelete === "1"
    ) {
      const notifications = await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          company_masters_id: whereObj.company_masters_id,
        },
        attributes: ["a_application_login_id"],
      });
      const assignedIds = notifications.map((notification) =>
        notification.a_application_login_id.toString()
      );

      if (assignedIds.length > 0) {
        const tokenData = await loginModel.findAll({
          where: {
            id: assignedIds,
            isDelete: 0,
          },
          attributes: [
            "web_refresh_token",
            "android_refresh_token",
            "ios_refresh_token",
          ],
        });
        const allTokens = tokenData.flatMap((data) => [
          data.web_refresh_token,
          data.android_refresh_token,
          data.ios_refresh_token,
        ]);
        const uniqueTokens = [
          ...new Set(allTokens.filter((token) => token && token.trim() !== "")),
        ];

        if (uniqueTokens.length > 0) {
          try {
            await sendMultipleNotification({
              deviceTokens: uniqueTokens,
              title: "Team Member Leave",
              body: "A team member has been removed from the company.",
            });
          } catch (notificationError) {
            console.log(
              "Notification failed (non-critical):",
              notificationError.message
            );
          }
        } else {
          console.log("No valid device tokens found for assigned users.");
        }
      } else {
        console.log("No active team members found for the company.");
      }
    }
    if (req.body.request_flag === "CreateCompanyNotExists") {
      const token = jwt.sign(
        {
          a_application_login_id: Number(req.body.a_application_login_id),
        },
        JWT_TOKEN_SIGNATURE,
        { expiresIn: JWT_TOKEN_EXPIRES_TIME }
      );
      return resSuccess({
        data: { item: updatedRows, token },
      });
    } else {
      return resSuccess({
        data: updatedRows,
      });
    }
  } catch (e) {
    console.log("updateMainCommon error", e);

    return resBadRequest({
      developer_msg: `error ${e}`,
    });
  }
};

export const rp_getValue = async (req) => {
  let { table, columns, where, order } = req;
  try {
    let queryOptions = {
      attributes: columns.split(",").map((column) => column.trim()),
    };
    if (where) {
      const whereObj = JSON.parse(where);
      queryOptions.where = whereObj;
    }

    if (order) {
      const orderObj = JSON.parse(order);
      const orderBy = [[...Object.keys(orderObj), ...Object.values(orderObj)]];
      queryOptions.order = orderBy;
    }
    const result = await sequelize.models[table].findAll(queryOptions);

    if (!result || result.length === 0) {
      return resError({
        ack_msg: "Record(s) not found",
        developer_msg: "Data not match",
      });
    }
    return resSuccess({
      data: result[0].dataValues.mobile_number,
    });
  } catch (e) {
    console.log("rp_getValue error", e)
    return resBadRequest();
  }
};

// Map operator strings to Sequelize operators
const operatorMap = {
  // Comparison
  eq: Op.eq,
  ne: Op.ne,
  gt: Op.gt,
  gte: Op.gte,
  lt: Op.lt,
  lte: Op.lte,
  like: Op.like,
  notLike: Op.notLike,
  startsWith: Op.startsWith,
  endsWith: Op.endsWith,
  substring: Op.substring,
  in: Op.in,
  notIn: Op.notIn,
  between: Op.between,
  notBetween: Op.notBetween,
  is: Op.is,
  not: Op.not,
  regexp: Op.regexp,
  notRegexp: Op.notRegexp,

  // Logical
  and: Op.and,
  or: Op.or,
  any: Op.any,
  all: Op.all,
};

const parseWhere = (obj, model) => {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Object.keys(obj).length === 0) {
    return {};
  }

  const validFields = Object.keys(model.rawAttributes);
  const parsed = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    const value = obj[key];

    if (operatorMap[key]) {
      if (key === 'in' && !Array.isArray(value)) {
        throw new Error(`Operator "${key}" requires an array value`);
      }
      parsed[operatorMap[key]] = parseWhere(value, model);
    } else if (typeof value === "object" && value !== null) {
      parsed[key] = parseWhere(value, model);
    } else {
      if (!validFields.includes(key) && !operatorMap[key]) {
        throw new Error(`Invalid field: ${key}`);
      }

      if (typeof value === 'string') {
        parsed[key] = value.replace(/['";]/g, ''); // Basic sanitization
      } else {
        parsed[key] = value;
      }
      parsed[key] = value;
    }
  }
  return parsed;
};

/**
 * @commonGetCount
 * @param '{
  "table": "employees",
  "where": "{\"status\": \"active\", \"age\": {\"gt\": 25}, \"department_id\": {\"in\": [1,2,3]}}"
}'
 */

export const commonGetCount = async (req) => {
  let { table, where } = req.body;

  try {
    const modelRegistry = req.models;

    const model = modelRegistry[table];

    if (!model) {
      return resError({
        ack_msg: "Invalid table name",
        developer_msg: `Model "${table}" not found in sequelize.models`,
      });
    }
    let queryOptions = {};
    if (where) {
      try {
        const whereObj = JSON.parse(where);
        if (typeof whereObj !== 'object' || Array.isArray(whereObj) || whereObj === null) {
          return resError({
            ack_msg: "Invalid where clause",
            developer_msg: "Where clause must be a valid JSON object",
          });
        }
        queryOptions.where = parseWhere(whereObj, model);
      } catch (e) {
        return resError({
          ack_msg: "Invalid where clause",
          developer_msg: "Failed to parse where clause: " + e.message,
        });
      }
    }
    // queryOptions.logging = true;
    const count = await model.count(queryOptions);
    return resSuccess({ data: { count } });
  } catch (e) {
    console.error("commonGetCount error:", {
      table,
      error: e.message,
      stack: e.stack,
    });
    return resError({
      ack_msg: "Internal server error",
      developer_msg: `Database query failed: ${e.message}`,
    });
  }
};

export const getCompanyByLoginId = async (a_application_login_id) => {
  try {
    const store = requestContext.getStore();
    const loginId = a_application_login_id || store?.tenantId || store?.a_application_login_id;

    if (store && store.companyId) {
      const activeCompanyId = Number(store.companyId);

      if (loginId) {
        // 1. Direct mapping check
        const directMapping = await companyVsApplicationLoginModel.findOne({
          where: {
            a_application_login_id: loginId,
            company_masters_id: activeCompanyId,
            isDelete: 0
          },
          attributes: ["id", "company_masters_id", "a_application_login_id", "company_flag"]
        });

        if (directMapping) {
          return directMapping.dataValues;
        }

        // 2. Parent company inheritance check (owner or employee mapped to parent company)
        const childCompany = await companyModel.findOne({
          where: { id: activeCompanyId, isDelete: 0 },
          attributes: ["parent_company_id"]
        });

        if (childCompany && childCompany.dataValues?.parent_company_id) {
          const parentMapping = await companyVsApplicationLoginModel.findOne({
            where: {
              a_application_login_id: loginId,
              company_masters_id: childCompany.dataValues.parent_company_id,
              isDelete: 0
            },
            attributes: ["id", "company_flag"]
          });

          if (parentMapping) {
            return {
              id: parentMapping.dataValues.id,
              company_masters_id: activeCompanyId,
              a_application_login_id: Number(loginId),
              company_flag: parentMapping.dataValues.company_flag
            };
          }
        }
      }

      return {
        id: 0,
        company_masters_id: activeCompanyId,
        a_application_login_id: loginId ? Number(loginId) : undefined,
        company_flag: 2
      };
    }

    if (loginId) {
      // Default fallback: use the most recently added mapping (highest id) for this login.
      // ORDER BY id DESC ensures consistent and deterministic workspace resolution
      // when no active requestContext exists (e.g., mainCommonGet which has no auth middleware).
      const companyByLoginIdResult = await companyVsApplicationLoginModel.findOne({
        where: { a_application_login_id: loginId, isDelete: 0 },
        attributes: ["id", "company_masters_id", "a_application_login_id", "company_flag"],
        order: [["id", "DESC"]],
      });

      if (companyByLoginIdResult) {
        return companyByLoginIdResult.dataValues;
      }
    }

    throw new Error("No company mapping found for this login ID");
  } catch (error) {
    console.error("Error in getCompanyByLoginId:", error);
    const store = requestContext.getStore();
    return {
      id: 0,
      company_masters_id: store?.companyId ? Number(store.companyId) : 0,
      a_application_login_id: a_application_login_id ? Number(a_application_login_id) : undefined,
      company_flag: 2
    };
  }
};

export const getCompanyDetailByLoginId = async (a_application_login_id) => {
  try {
    const compMapping = await getCompanyByLoginId(a_application_login_id);
    const companyByLoginIdResultDetail = await companyModel.findOne({
      where: {
        id: compMapping.company_masters_id,
        isDelete: 0,
      },
    });

    if (!companyByLoginIdResultDetail) {
      throw new Error("No company details found");
    }

    return companyByLoginIdResultDetail.dataValues;
  } catch (error) {
    console.error("Error in getCompanyDetailByLoginId:", error);
    return resBadRequest({
      developer_msg: error.message || error,
    });
  }
};

export const getLoginDetailById = async (a_application_login_id) => {
  try {
    const loginByIdResult = await loginModel.findOne({
      where: { id: a_application_login_id, isDelete: 0 },
    });

    return loginByIdResult.dataValues;
  } catch (error) {
    return resBadRequest({
      developer_msg: error,
    });
  }
};

export const createAccountTransaction = async ({
  mode,
  type,
  amount,
  referenceId,
  referenceTable,
  remarkDetails,
  paymentDateTime,
  approvedBy,
  contactMasterId,
  applicationLoginId,
  companyMasterId,
  miracle_account_legder,
  amount_type,
  req,
}) => {

  try {
    const { type_name, invoiceNum, invoiceDate, customerName } = remarkDetails;
    const remark = `<p>${type_name ? `${type_name}<br>` : ""}Inv No.: ${invoiceNum}<br>Inv Date : ${invoiceDate || ""
      }<br>Contact Name : ${customerName}</p>`;
    const transactionData = {
      mode,
      type,
      amount,
      reference_id: referenceId,
      reference_table: referenceTable,
      remark,
      payment_date_time: paymentDateTime,
      approve_date_time: paymentDateTime,
      created_date_time: paymentDateTime,
      approve_by_a_application_login_id: approvedBy,
      contact_masters_id: contactMasterId,
      a_application_login_id: applicationLoginId,
      company_masters_id: companyMasterId,
      miracle_account_ledger: miracle_account_legder,
      amount_type: amount_type,
    };

    // return transactionData;
    const accountHistoryMSG = accountTransactionsModel(req.tenantDB);
    return await accountHistoryMSG.create(transactionData);
  } catch (error) {
    console.log("Error creating account transaction:", error);
    return resBadRequest({
      developer_msg: `Error ${error}`,
      ack_msg: "Error creating account transaction",
    });
  }
};

export const loginHistories = async ({ a_application_login_id }) => {
  const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
  try {
    const loginBody = {
      a_application_login_id: a_application_login_id,
      login_date_time: formattedDate,
      ipaddress: "",
      created_date_time: formattedDate,
    };

    await applicationLoginHistoriesModel.create(
      loginBody
    );
  } catch {
    return resBadRequest({
      developer_msg: `Error `,
      ack_msg: "Error creating account transaction",
    });
  }
};

export const insertStagesAndStatusLogs = async (req, detail) => {
  try {
    if (!isValid(detail)) return {};

    const { reference_table, reference_id, status_id, a_application_login_id, inside_table_type } = detail;
    console.log("detaildetaildetail", detail);

    const tenantDB = req.tenantDB;
    console.log("tenantDBtenantDBtenantDB", tenantDB);

    const StatusLog = statusAndStagesLogsModel(tenantDB);
    const StageStatus = stagestatusModel(tenantDB);

    const config = statusLogsMessageConfig[reference_table];
    if (!config) {
      console.warn("No message config found for table:", reference_table);
      return {};
    }

    const dynamicTitilesObjectAppliedTable = ["carts"]
    if (dynamicTitilesObjectAppliedTable.includes(reference_table)) {
      if (reference_table == "carts") {
        const findCompanyId = await getCompanyByLoginId(
          a_application_login_id
        );
        const columns = await companyModel.findOne({
          where: {
            isDelete: 0,
            id: findCompanyId.company_masters_id
          },
          raw: true,
          attributes: [
            "invoice_title",
            "order_title",
            "return_sales_invoice_title",
            "quotation_title",
            "purchase_title",
            "return_purchase_invoice_title",
            "purchase_order_title",
            "inward_title",
            "dispatch_title"
          ]
        });

        const setObject = {
          invoice_title: 3,
          order_title: 2,
          return_sales_invoice_title: 6,
          quotation_title: 1,
          purchase_title: 4,
          return_purchase_invoice_title: 7,
          // workorder_title: 1,
          purchase_order_title: 5,
          inward_title: 8,
          dispatch_title: 9
        };

        const defaultValues = {
          invoice_title: "Invoice",
          order_title: "Order",
          return_sales_invoice_title: "Return Sales Invoice",
          quotation_title: "Quotation",
          purchase_title: "Purchase",
          return_purchase_invoice_title: "Return Purchase Invoice",
          // workorder_title: "Work Order",
          purchase_order_title: "Purchase Order",
          inward_title: "Inward",
          dispatch_title: "Dispatch"
        };

        const finalObject = {};

        for (const [key, value] of Object.entries(columns)) {
          const mappedNumber = setObject[key];
          if (!mappedNumber) continue;

          const finalValue =
            value && String(value).trim() !== ""
              ? value
              : defaultValues[key];

          finalObject[mappedNumber] = finalValue;
        }
        config.title = finalObject;
      }
    }


    // Get last logs
    const lastEntry = await StatusLog.findOne({
      where: { isDelete: 0, reference_table, reference_id },
      order: [["updated_date_time", "DESC"]],
      raw: true,
    });

    const currentStatus = await StageStatus.findOne({
      where: { isDelete: 0, id: status_id },
      attributes: ["name"],
      raw: true,
    });

    // dynamic model getter
    const module = config.fields ? await import(`../models/${config.modelPath}.js`) : null;
    const modelInstance = config.fields ? module[config.model](tenantDB) : null;

    // Fetch record fields defined in config
    const record = config.fields ? await modelInstance.findOne({
      where: { isDelete: 0, id: reference_id },
      attributes: config.fields,
      raw: true,
    }) : { reference_id };

    const entityText = config.formatEntity(record);

    let information = "";

    if (!lastEntry) {
      // First log
      information = `${config.title !== null && typeof config.title === 'object' ? config.title[inside_table_type] : config.title} ${entityText} was created with initial status ${currentStatus.name}.`;
    } else {
      const previousStatus = await StageStatus.findOne({
        where: { isDelete: 0, id: lastEntry.status_id },
        attributes: ["name"],
        raw: true,
      });

      information = `${config.title !== null && typeof config.title === 'object' ? config.title[inside_table_type] : config.title} ${entityText} status changed from ${previousStatus.name} to ${currentStatus.name}.`;
    }

    await StatusLog.create({
      reference_table,
      reference_id,
      information,
      status_id,
      previous_status_id: lastEntry?.status_id || 0,
      updated_by: a_application_login_id,
      updated_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
    });

  } catch (error) {
    console.error("insertStagesAndStatusLogs error", error);
    return {};
  }
};

export const bulkMailSender = async (req) => {
  try {
    const { desr, sub, list, bcc } = req.body || {};
    if (!isValid(list)) {
      return resError({
        ack_msg: "Mail List Not found",
      });
    }

    const mail_list = list.split(",") || [];

    if (!isValid(mail_list)) {
      return resError({
        ack_msg: "Mail List is not valid",
      });
    }
    let attachement;
    let filePath;
    let fileName;
    if (req.file) {
      attachement = req.file;

      filePath = attachement.path;
      fileName = path.basename(filePath);
    }


    const sendMail = await Promise.all(
      mail_list.map(async (v) => {
        const mail_id = isValidEmail(v) ? v.trim().toLowerCase() : false;
        if (!mail_id) {
          return;
        }

        let stats;
        let pdfBuffer;
        let pdfBufferValue;
        if (filePath) {
          stats = await fs.promises.stat(filePath);
          pdfBuffer = fs.readFileSync(filePath);

          pdfBufferValue = {
            type: 'pdf',
            buffer: pdfBuffer,
            filename: `${fileName}.pdf`,
            contentType: 'application/pdf',
            contentLength: stats.size,
            filePath: filePath
          };
        }

        const transporter = nodemailer.createTransport({
          host: MAIL_SETTING_HOST_NAME,
          port: 465,
          secure: true,
          auth: {
            user: MAIL_SETTING_HOST_USER_NAME,
            pass: MAIL_SETTING_HOST_USER_PASSWORD,
          },
        });

        try {
          await transporter.verify();

          const mailOptionsAdmin = {
            from: MAIL_SETTING_HOST_USER_NAME,
            to: mail_id,
            subject: sub,
            html: desr
          };

          if (isValid(bcc)) {
            mailOptionsAdmin.bcc = bcc;
          }

          if (pdfBufferValue) {
            mailOptionsAdmin.attachments = [
              {
                filename: 'deskflow-crm',
                content: pdfBufferValue.buffer,
                contentType: pdfBufferValue.contentType,
              },
            ];
          }


          const info = await transporter.sendMail(mailOptionsAdmin);
          if (info.accepted && info.accepted.length > 0) {
            return {
              ack_msg: "Email sent successfully",
              data: {
                messageId: info.messageId,
                accepted: info.accepted,
                success: true,
              }
            };
          }

          return {
            ack_msg: "Email was rejected by server",
            data: {
              success: false,
              rejected: info.rejected
            }
          };
        } catch (err) {
          console.log("Error with email transport or sending:", err);
        }
      })
    );

    return resSuccess({
      ack_msg: "mail send successfully",
      data: { sendMail }
    })
  } catch (error) {
    console.log("bulkMailSender Error", error);
    return resBadRequest({
      developer_msg: `Error ${error} `,
      ack_msg: "Error send mail",
    });
  }
};