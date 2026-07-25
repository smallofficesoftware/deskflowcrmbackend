import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { col, fn, Op, where } from "sequelize";
import { employeeAccountTransactionsModel } from "../../models/activities/employeeAccountTransactionModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { expensesModel } from "../../models/hr/expensesModel.js";
import { expenseTypeModel } from "../../models/hr/expenseTypeModel.js";
import { EXPENSE_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import {
  formatDateAndTimeCreateDateTime,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";


export const getAllExpenseMaster = async (req) => {
  try {
    let { ul, ll, a_application_login_id, created_date_time, request_flag, checked_id, searchTerm, startDate, endDate, expense_types, expense_status } = req.body;

    const expenseTypeMaster = expensesModel(req.tenantDB);

    const companyFlagData = await companyVsApplicationLoginModel.findOne({
      where: {
        [Sequelize.Op.or]: [
          a_application_login_id && { a_application_login_id },
          checked_id && { a_application_login_id: checked_id },
        ].filter(Boolean),
      },
      attributes: ["company_flag"],
    });


    const companyFlag = companyFlagData ? companyFlagData.company_flag : null;

    // 🔹 OLD company logic removed completely

    // --------------------------------------------
    // WHERE CLAUSE
    // --------------------------------------------
    let whereClause = {
      [Op.or]: [{ a_application_login_id }],
      isDelete: "0"
    };

    if (searchTerm && searchTerm.trim() !== "") {
      const searchValue = `%${searchTerm.trim()}%`;

      whereClause[Op.or] = [
        { remark: { [Op.like]: searchValue } },
        { status_remark: { [Op.like]: searchValue } },
        { amount: { [Op.like]: searchValue } },
        { pass_amount: { [Op.like]: searchValue } }
      ];
    }

    if (request_flag == 3) {
      whereClause = {
        a_application_login_id,
        [Op.or]: [
          where(fn("DATE", col("created_date_time")), created_date_time),
        ],
        isDelete: "0",
      };
    }

    if (startDate && endDate) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("expense_date")),
          {
            [Op.gte]: startDate,
          }
        ),
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("expense_date")),
          {
            [Op.lte]: endDate,
          }
        )
      );
    }

    if (expense_types && expense_types.length > 0) {
      whereClause.expense_type_id = {
        [Op.in]: expense_types,
      }
    }

    if (expense_status && expense_status.length > 0) {
      whereClause.expense_status = {
        [Op.in]: expense_status,
      }
    }

    // --------------------------------------------
    // FETCH EXPENSE LIST
    // --------------------------------------------
    const expenseTypeMasterData = await expenseTypeMaster.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
      attributes: {
        include: [
          [
            Sequelize.literal(
              `(SELECT expense_name FROM expense_type_masters WHERE expense_type_masters.id = expenses.expense_type_id AND expense_type_masters.isDelete = 0 LIMIT 1)`
            ),
            "expense_name",
          ],
          [
            Sequelize.literal(
              `(SELECT color FROM expense_type_masters WHERE expense_type_masters.id = expenses.expense_type_id AND expense_type_masters.isDelete = 0 LIMIT 1)`
            ),
            "color",
          ],
        ],
      },
    });

    if (!expenseTypeMasterData) {
      return resError({
        ack_msg: "No Expense Data",
        developer_msg: "Data not found",
      });
    }

    // ---------------------------------------------------
    // MAP DATA + ADD created_by_username USING loginModel
    // ---------------------------------------------------
    const sanitizedContacts = await Promise.all(
      expenseTypeMasterData.map(async (expenseItem) => {
        const sanitized = sanitizeObjectOfNull(expenseItem.toJSON());

        // 🔹 New logic: Find username of created_by
        let created_by_username = "";
        if (sanitized.created_by) {
          const userData = await loginModel.findOne({
            where: { id: sanitized.created_by },
            attributes: ["username"]
          });

          created_by_username = userData ? userData.username : "";
        }
        return {
          ...sanitized,
          // image: sanitized.image ? EXPENSE_IMG_LINK_EXTENDED + sanitized.image : "",
          image: sanitized.image
            ? `${EXPENSE_IMG_LINK_EXTENDED}/${sanitized.image}`
            : null,
          created_date_time: sanitized.created_date_time
            ? formatDateAndTimeCreateDateTime(sanitized.created_date_time)
            : "",
          companyFlag,
          created_by_username,
        };
      })
    );

    return resSuccess({
      data: { item: sanitizedContacts },
    });

  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};


export const expenseMasterCreate = async (req) => {
  const currentDate = new Date();
  const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");
  try {
    const {
      expense_type_id,
      amount,
      remark,
      expense_status,
      kilometers,
      expense_date,
      a_application_login_id,
      created_by,
      longitude,
      latitude,
      address
    } = req.body || {};

    const expenseImg = req.file;
    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);
    const expenseTypeMaster = expensesModel(req.tenantDB);
    const expenseTypeMasterModel = expenseTypeModel(req.tenantDB);

    if (!findCompanyId) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Company not found for the given login ID",
      });
    }

    let directoryPath;
    let convertPath = "";
    let mediaName = "";
    if (expenseImg) {
      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "expense-images",
        findCompanyId.company_masters_id.toString()
      );

      await fs.mkdirp(directoryPath);
      const filePath = expenseImg.path;
      const fileName = path.basename(filePath);
      const destinationPath = path.join(directoryPath, fileName);

      await fs.move(filePath, destinationPath);

      convertPath =
        findCompanyId.company_masters_id.toString() + "/" + fileName;
      mediaName = expenseImg.originalname || fileName;
    }

    const expenseType = await expenseTypeMasterModel.findOne({
      where: {
        id: expense_type_id,
        isDelete: 0,
      },
      attributes: ["min_time", "max_time"],
    });

    if (!expenseType) {
      return resError({
        ack_msg: "Invalid expense type",
        developer_msg: "Expense type not found",
      });
    }

    if (expenseType.min_time && expenseType.max_time &&
      !(expenseType.min_time === "00:00:00" && expenseType.max_time === "00:00:00")) {
      const currentTime = moment().format("HH:mm");

      const minTime = moment(expenseType.min_time, "HH:mm");
      const maxTime = moment(expenseType.max_time, "HH:mm");
      const now = moment(currentTime, "HH:mm");

      if (now.isBefore(minTime) || now.isAfter(maxTime)) {
        return resError({
          ack_msg: `Expense can be created/updated only between ${expenseType.min_time} and ${expenseType.max_time}`,
          developer_msg: `Expense can be created/updated only between ${expenseType.min_time} and ${expenseType.max_time}`,
        });
      }
    }


    const newExpenseData = await expenseTypeMaster.create({
      expense_type_id: expense_type_id,
      amount: amount,
      remark: remark,
      expense_status: expense_status,
      kilometers: kilometers,
      expense_date: expense_date || formattedDate,
      image: convertPath,
      a_application_login_id: a_application_login_id,
      company_masters_id: findCompanyId?.company_masters_id || "",
      created_date_time: formattedDate,
      created_by: created_by,
      latitude: latitude ? latitude : "",
      longitude: longitude ? longitude : "",
      address: address ? address : "",
    });

    if (newExpenseData) {
      const ownerTokenData = await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          company_masters_id: findCompanyId.company_masters_id,
          company_flag: 1,
        },
        attributes: ["a_application_login_id"],
      });

      // Get tokens for each owner a_application_login_id
      const allLoginIds = ownerTokenData.map(
        (item) => item.a_application_login_id
      );

      const findTokens = await loginModel.findAll({
        where: {
          id: allLoginIds,
          isDelete: 0,
        },
        attributes: [
          "android_refresh_token",
          "web_refresh_token",
          "ios_refresh_token",
        ],
      });

      const tokens = findTokens
        .flatMap((tokenObj) => {
          const {
            android_refresh_token,
            web_refresh_token,
            ios_refresh_token,
          } = tokenObj.dataValues;
          return [android_refresh_token, web_refresh_token, ios_refresh_token];
        })
        .filter((token) => token && token.trim() !== "");

      if (tokens.length > 0) {
        try {
          await sendMultipleNotification({
            deviceTokens: tokens,
            title: "Expensed created",
            body: remark || "Expensed created",
          });
        } catch (notificationError) {
          console.error(
            "Notification failed (non-critical):",
            notificationError.message
          );
        }
      } else {
        console.log("No device tokens found for owners.");
      }
    } else {
      console.log("Permission denied: team_expense_entry is not 1");
    }

    if (newExpenseData) {
      return resSuccess({
        data: { item: newExpenseData },
        ack_msg: "Expense created successfully",
      });
    } else {
      return resError({
        ack_msg: "Failed to create expense",
        developer_msg: "Unable to create expense due to unknown error",
      });
    }
  } catch (error) {
    console.log("expenseMasterCreate Error", error)
    return resBadRequest({
      ack_msg: "Error",
      developer_msg: `${error.message}`,
    });
  }
};
export const expenseMasterUpdate = async (req) => {
  try {
    const {
      expense_type_id,
      amount,
      remark,
      expense_status,
      kilometers,
      expense_date,
      a_application_login_id,
      expense_id,
      status_remark,
      pass_amount,
      created_by,
      team_id
    } = req.body;


    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const expenseImg = req.file;

    if (pass_amount > amount) {
      return resError({
        ack_msg: "pass amount cannot be greater than amount",
        developer_msg: "pass amount cannot be greater than amount",
      });
    }

    const expenseTypeMaster = expensesModel(req.tenantDB);
    const expenseTypMasterModel = expenseTypeModel(req.tenantDB);


    let directoryPath;

    const existingExpense = await expenseTypeMaster.findOne({
      where: { id: expense_id },
    });


    let convertPath = existingExpense?.image || ""; // Use existing image if no new image is uploaded
    let mediaName = "";
    if (expenseImg) {
      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "expense-images",
        findCompanyId.company_masters_id.toString()
      );

      await fs.mkdirp(directoryPath); // Create directory if it doesn't exist
      const filePath = expenseImg.path;
      const fileName = path.basename(filePath);
      const destinationPath = path.join(directoryPath, fileName);

      // Move the new image file to the correct directory
      await fs.move(filePath, destinationPath);

      // Delete the old image if it exists
      if (existingExpense && existingExpense.image) {
        const oldImagePath = path.join(
          process.cwd(),
          "media-folder",
          "expense-images",
          existingExpense.image
        );
        await fs.remove(oldImagePath);
      }

      // Set new image path
      convertPath =
        findCompanyId.company_masters_id.toString() + "/" + fileName;
      mediaName = expenseImg.originalname || fileName;
    }

    if (expense_type_id) {
      const expenseType = await expenseTypMasterModel.findOne({
        where: {
          id: expense_type_id,
          isDelete: 0,
        },
        attributes: ["min_time", "max_time"],
      });


      if (!expenseType) {
        return resError({
          ack_msg: "Invalid expense type",
          developer_msg: "Expense type not found",
        });
      }

      if (expenseType.min_time && expenseType.max_time &&
        !(expenseType.min_time === "00:00:00" && expenseType.max_time === "00:00:00")) {
        const currentTime = moment().format("HH:mm");

        const minTime = moment(expenseType.min_time, "HH:mm");
        const maxTime = moment(expenseType.max_time, "HH:mm");
        const now = moment(currentTime, "HH:mm");

        if (now.isBefore(minTime) || now.isAfter(maxTime)) {
          return resError({
            ack_msg: `Expense can be created/updated only between ${expenseType.min_time} and ${expenseType.max_time}`,
            developer_msg: `Expense can be created/updated only between ${expenseType.min_time} and ${expenseType.max_time}`,
          });
        }
      }
    }


    const whereClause = {
      isDelete: 0,
      id: expense_id,
    };

    const updateExpenseResult = await expenseTypeMaster.update(
      {
        expense_type_id: expense_type_id,
        amount: amount,
        remark: remark,
        kilometers: kilometers,
        expense_date: expense_date,
        expense_status: expense_status,
        image: convertPath,
        status_remark: status_remark,
        pass_amount: pass_amount,
      },
      {
        where: whereClause,
      }
    );



    if (updateExpenseResult && expense_status == 2) {
      const employeeAccountTransactions = employeeAccountTransactionsModel(req.tenantDB);

      await employeeAccountTransactions.create({
        team_id: team_id,
        a_application_login_id: a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        type: 2,
        mode: -1,
        amount: pass_amount,
        payment_date_time: new Date().toISOString(),
        approve_date_time: new Date().toISOString(),
        approve_by_a_application_login_id: a_application_login_id,
        remark: status_remark,
      });

    }

    if (updateExpenseResult) {
      const teamTokenData = await expenseTypeMaster.findAll({
        where: {
          id: expense_id,
          isDelete: 0,
        },
        attributes: ["a_application_login_id"],
      });

      const allLoginIds = teamTokenData.map(
        (item) => item.a_application_login_id
      );

      const findTokens = await loginModel.findAll({
        where: {
          id: allLoginIds,
          isDelete: 0,
        },
        attributes: [
          "android_refresh_token",
          "web_refresh_token",
          "ios_refresh_token",
        ],
      });

      const tokens = findTokens
        .flatMap((tokenObj) => {
          const {
            android_refresh_token,
            web_refresh_token,
            ios_refresh_token,
          } = tokenObj.dataValues;
          return [android_refresh_token, web_refresh_token, ios_refresh_token];
        })
        .filter((token) => token && token.trim() !== "");

      if (tokens.length > 0) {
        try {
          await sendMultipleNotification({
            deviceTokens: tokens,
            title: `Expensed  ${expense_status == 2 ? "Approved" : "Rejected"}`,
            // body: remark || "A new visit has been created",
          });
        } catch (notificationError) {
          console.error(
            "Notification failed (non-critical):",
            notificationError.message
          );
        }
      } else {
        console.log("No device tokens found for owners.");
      }
    } else {
      console.log("Permission denied: team_expense_entry is not 1");
    }
    if (updateExpenseResult) {
      return resSuccess({
        data: { item: updateExpenseResult },
        ack_msg: "Expense Update Successfully",
      });
    } else {
      return resError({
        ack_msg: "",
        developer_msg: "Expanse data is not found!",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: " ",
      developer_msg: `${error.message}`,
    });
  }
};

export const expenseMainMasterCreate = async (req) => {
  const currentDate = new Date();
  const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");
  try {
    const {
      expense_name,
      color,
      a_application_login_id,
      expense_subtype,
      min_time,
      max_time,
      min_amount,
      max_amount,
      fix_amount,
      amount_per_km,
      compulsory_image
    } = req.body || {};

    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);

    if (!findCompanyId) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Company not found for the given login ID",
      });
    }

    const expenseTypeMaster = expenseTypeModel(req.tenantDB);

    // ─── Time formatting with default ────────────────────────────────────────
    const formattedMinTime = min_time
      ? (moment(min_time, ["HH:mm", "HH:mm:ss"], true).isValid()
        ? moment(min_time, ["HH:mm", "HH:mm:ss"], true).format("HH:mm:ss")
        : "00:00:00")
      : "00:00:00";

    const formattedMaxTime = max_time
      ? (moment(max_time, ["HH:mm", "HH:mm:ss"], true).isValid()
        ? moment(max_time, ["HH:mm", "HH:mm:ss"], true).format("HH:mm:ss")
        : "00:00:00")
      : "00:00:00";


    const newExpenseData = await expenseTypeMaster.create({
      a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      created_date_time: formattedDate,
      expense_name,
      color: color || "#999999",
      expense_subtype,
      min_time: formattedMinTime,
      max_time: formattedMaxTime,
      min_amount: min_amount || 0,
      max_amount: max_amount || 0,
      fix_amount: fix_amount || 0,
      amount_per_km: amount_per_km || 0,
      compulsory_image,
    });

    if (newExpenseData) {
      return resSuccess({
        data: { item: newExpenseData },
        ack_msg: "Expense Type created successfully",
      });
    } else {
      return resError({
        ack_msg: "Failed to create expense type",
        developer_msg: "Unable to create expense due to unknown error",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error",
      developer_msg: `${error.message}`,
    });
  }
};

export const expenseMainMasterUpdate = async (req) => {
  const currentDate = new Date();
  const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");
  try {
    const {
      id,
      expense_name,
      color,
      a_application_login_id,
      expense_subtype,
      min_time,
      max_time,
      min_amount,
      max_amount,
      fix_amount,
      amount_per_km,
      compulsory_image
    } = req.body || {};

    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);
    if (!id) {
      return resError({
        ack_msg: "Expense type ID is required",
        developer_msg: "Missing 'id' field in request body",
      });
    }
    if (!findCompanyId) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Company not found for the given login ID",
      });
    }

    const expenseTypeMaster = expenseTypeModel(req.tenantDB);

    const formattedMinTime = min_time ? moment(min_time, "HH:mm").format("HH:mm:ss") : null;
    const formattedMaxTime = max_time ? moment(max_time, "HH:mm").format("HH:mm:ss") : null;

    const whereClause = {
      isDelete: 0,
      id: id,
      company_masters_id: findCompanyId.company_masters_id,
    };

    const updatedExpenseData = await expenseTypeMaster.update({
      a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      created_date_time: formattedDate,
      expense_name,
      color: color || "#999999",
      expense_subtype,
      min_time: formattedMinTime,
      max_time: formattedMaxTime,
      min_amount: min_amount || 0,
      max_amount: max_amount || 0,
      fix_amount: fix_amount || 0,
      amount_per_km: amount_per_km || 0,
      compulsory_image,
    }, {
      where: whereClause
    });

    if (updatedExpenseData) {
      return resSuccess({
        data: { item: updatedExpenseData },
        ack_msg: "Expense Type Updated successfully",
      });
    } else {
      return resError({
        ack_msg: "Failed to update expense type",
        developer_msg: "Unable to update expense type due to unknown error",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error",
      developer_msg: `${error.message}`,
    });
  }
};

export const expenseMainMasterGet = async (req) => {
  try {
    let { a_application_login_id, request_flag } = req.body;


    const expenseTypeMaster = expenseTypeModel(req.tenantDB);

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (!findCompanyId) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Company not found for the given login ID",
      });
    }

    const user = await loginModel.findOne({
      where: {
        id: a_application_login_id,
        isDelete: 0,
      },
      attributes: [
        "expense_types",
      ],
      raw: true,
    });

    let allowedExpenseTypeIds = [];

    if (user.expense_types && user.expense_types.trim() !== '') {
      allowedExpenseTypeIds = user.expense_types
        .split(',')
        .map(id => id.trim())
        .filter(id => id !== '' && !isNaN(Number(id)))
        .map(Number); // convert to numbers
    }

    let validIds = [];

    if (allowedExpenseTypeIds.length > 0) {
      const existingExpenseTypes = await expenseTypeMaster.findAll({
        where: {
          id: { [Op.in]: allowedExpenseTypeIds },
          isDelete: 0,
          company_masters_id: findCompanyId.company_masters_id,
        },
        attributes: ["id"],
        raw: true,
      });

      validIds = existingExpenseTypes.map((e) => e.id);
    }

    if (allowedExpenseTypeIds.length !== validIds.length) {
      const cleanedExpenseTypes = validIds.join(",");

      await loginModel.update(
        { expense_types: cleanedExpenseTypes },
        { where: { id: a_application_login_id } }
      );
    }

    const whereCondition = {
      isDelete: "0",
      company_masters_id: findCompanyId.company_masters_id,
    };


    // If user has specific allowed types → filter by them
    if (Number(request_flag) === 0 && validIds.length > 0) {
      whereCondition.id = {
        [Op.in]: validIds,
      };
    }

    const expenseTypeMasterData = await expenseTypeMaster.findAll({
      where: whereCondition,
      order: [["id", "DESC"]],
    });

    if (!expenseTypeMasterData) {
      return resError({
        ack_msg: "No Expense Data",
        developer_msg: "Data not found",
      });
    }

    return resSuccess({
      data: expenseTypeMasterData,
    });

  } catch (e) {
    return resBadRequest({ developer_msg: `error ${e}` });
  }
};
