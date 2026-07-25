import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { expensesModel } from "../../../models/hr/expensesModel.js";
import { getCompanyByLoginId } from "../../../services/commonServices.js";
import { BACKEND_OF_SMALL_OFFICE_CRM_END_POINT } from "../../../utils/appConstants.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const detailedExpenseGet = async (req) => {
    try {
        const selectedDates = req.body.selectedDates || [];
        const selectedTeamMembers = req.body.selectedTeamMembers;
        const selectedExpenseTypes = req.body.selectedExpenseTypes;
        const selectedExpenseStatus = req.body.selectedExpenseStatus;
        const offset = req.body.ul;
        const limit = req.body.ll;

        const globalSearch = req.body.globalSearch?.trim() || "";


        const startDate = new Date(selectedDates[0]);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(selectedDates[1]);
        endDate.setHours(23, 59, 59, 999);

        const expenseModels = await expensesModel(req.tenantDB);

        let fullTextSearchCondition = {};
        if (globalSearch) {
            const cartColumns = Object.keys(expenseModels.rawAttributes)
                .filter(col => {
                    const attr = expenseModels.rawAttributes[col];
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
            page_id: PAGE_ID.EXPENSES,
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

        if (selectedExpenseTypes && selectedExpenseTypes.length > 0) {
            whereClause.expense_type_id = {
                [Op.in]: selectedExpenseTypes,
            }
        }

        if (selectedExpenseStatus && selectedExpenseStatus.length > 0) {
            whereClause.expense_status = {
                [Op.in]: selectedExpenseStatus,
            }
        }

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

        const expenseData = await expenseModels.findAll({
            where: {
                ...whereClause,
                isDelete: 0,
                ...dateFilter,
                ...fullTextSearchCondition,
            },
            attributes: [
                "id", "amount", "pass_amount", "expense_date", "expense_type_id", "expense_status", "a_application_login_id", "image", "remark", "created_date_time", "status_remark", "kilometers",
                [
                    Sequelize.literal(`(
                                            SELECT expense_type_masters.expense_name
                                            FROM expense_type_masters
                                            WHERE expense_type_masters.id = expenses.expense_type_id
                                              AND expense_type_masters.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "expense_name"
                ],
                [
                    Sequelize.literal(`(
                                            SELECT expense_type_masters.color
                                            FROM expense_type_masters
                                            WHERE expense_type_masters.id = expenses.expense_type_id
                                              AND expense_type_masters.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "color"
                ],
            ],
            order: [["id", "DESC"]],
            offset,
            limit,
            raw: true,
        });

        let loginWhere = {
            isDelete: 0,
        };

        loginWhere.id = {
            [Op.in]: expenseData.map((exp) => exp.a_application_login_id),
        }

        const loginUsers =
            await loginModel.findAll({
                where: loginWhere,
                attributes: ["id", "username"],
                raw: true,
            });

        const companyFlagData = await companyVsApplicationLoginModel.findOne({
            where: {
                a_application_login_id: req.body.a_application_login_id,
            },
            attributes: ["company_flag"],
        });

        const companyFlag = companyFlagData ? companyFlagData.company_flag : null;

        expenseData?.forEach((exp) => {
            const exp_image = exp.image
                ? `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/expenseImg/${exp.image}`
                : null;

            exp.image = exp_image;

            const amount = exp.amount
                ? `${currency?.symbol || ""} ${exp.amount}`
                : "0";

            const pass_amount = exp.pass_amount
                ? `${currency?.symbol || ""} ${exp.pass_amount}`
                : "0";

            exp.amount = amount;
            exp.pass_amount = pass_amount;

            exp.created_by_username = loginUsers.find((emp) => emp.id == exp.a_application_login_id).username;

            exp.companyFlag = companyFlag;
        })

        return resSuccess({
            data: { item: expenseData },
            ack_msg: "Successfully get Data",
        });
    } catch (e) {
        console.log("detailedExpenseGet Error: ", e)
        return resError({
            ack_msg: "Error Found In Catch",
            developer_msg: `${e}`,
        });
    }
};