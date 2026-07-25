import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { employeeAccountTransactionsModel } from "../../../models/activities/employeeAccountTransactionModel.js";
import { paymentTypeModel } from "../../../models/activities/paymentTypeModel.js";
import { applicationLoginTypeRightModel } from "../../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { getCompanyByLoginId, getLoginDetailById } from "../../../services/commonServices.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resBadRequest, resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const getEmployeeAccountTranctionReport = async (req, res) => {
    try {
        const {
            a_application_login_id,
            selected_dates,
            selectedTeamMembers,
            ul,
            ll,
            credit_debit_flag,
        } = req.body;

        const offset = Number(ul) || 0;
        const limit = Number(ll) || undefined; // undefined = no limit

        // ────────────────────────────────────────────────
        // Company & Rights
        // ────────────────────────────────────────────────
        const companyInfo = await getCompanyByLoginId(a_application_login_id);
        if (!companyInfo) {
            return resError({ ack_msg: "Company not found" });
        }
        const companyId = companyInfo.company_masters_id;

        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: companyId,
            a_application_login_id,
            page_id: PAGE_ID.EMP_ACCOUNT_HISTORY,
            tenentId: req.tenantDB
        });

        // ────────────────────────────────────────────────
        // Date range validation & formatting
        // ────────────────────────────────────────────────
        if (!Array.isArray(selected_dates) || selected_dates.length !== 2) {
            return resError({
                ack_msg: "Invalid Input",
                developer_msg: "selected_dates must be an array of two dates"
            });
        }

        const startDate = moment(selected_dates[0]).startOf('day').format('YYYY-MM-DD');
        const endDate = moment(selected_dates[1]).endOf('day').format('YYYY-MM-DD');

        if (!startDate || !endDate) {
            return resError({
                ack_msg: "Invalid Input",
                developer_msg: "Invalid date format in selected_dates"
            });
        }

        // ────────────────────────────────────────────────
        // Base WHERE clause
        // ────────────────────────────────────────────────
        let whereClause = {
            isDelete: 0,
            company_masters_id: companyId,
            [Op.and]: [
                Sequelize.literal(`DATE(created_date_time) >= '${startDate}'`),
                Sequelize.literal(`DATE(created_date_time) <= '${endDate}'`),
            ],
        };

        // Team member filter (only if allowed by rights)
        if (selectedTeamMembers?.length > 0) {
            if (showAllData) {
                whereClause.a_application_login_id = { [Op.in]: selectedTeamMembers };
            }
            // else: ignore team filter if not admin (personal data only)
        }

        // Credit/Debit filter
        if (credit_debit_flag === 1) {
            whereClause.type = 1;
        } else if (credit_debit_flag === 2) {
            whereClause.type = 2;
        }

        // Personal data restriction
        if (!showAllData && showPersonalData) {
            whereClause.a_application_login_id = a_application_login_id;
        }

        // ────────────────────────────────────────────────
        // Fetch currency
        // ────────────────────────────────────────────────
        const company = await companyModel.findOne({
            where: { id: companyId, isDelete: 0 },
            attributes: ['currency_id'],
            raw: true
        });

        const currency = await currencyModel.findOne({
            where: { id: company?.currency_id, isDelete: 0 },
            attributes: ['symbol', "short_name"],
            raw: true
        });

        const currencySymbol = currency?.symbol || '';

        // ────────────────────────────────────────────────
        // Fetch payment types (modes)
        // ────────────────────────────────────────────────
        const acc_payment_type = paymentTypeModel(req.tenantDB);
        const paymentTypes = await acc_payment_type.findAll({
            where: { isDelete: 0 },
            attributes: ["id", "payment_type_name"],
            raw: true
        });

        const paymentTypeMap = new Map(
            paymentTypes.map(pt => [Number(pt.id), pt.payment_type_name?.trim() || "Unknown"])
        );

        // Hardcoded transaction types (Credit/Debit)
        const transactionTypes = {
            "1": "Credit",
            "2": "Debit"
        };

        // ────────────────────────────────────────────────
        // Fetch transactions
        // ────────────────────────────────────────────────
        const accountModel = employeeAccountTransactionsModel(req.tenantDB);
        let accountData = await accountModel.findAll({
            where: whereClause,
            offset,
            limit,
            raw: true,
            order: [['created_date_time', 'DESC']] // ← added common default sort
        });

        // ────────────────────────────────────────────────
        // Fetch all active employees (for filtering + lookup)
        // ────────────────────────────────────────────────
        const companyVsApplicationLoginResult =
            await companyVsApplicationLoginModel.findAll({
                where: {
                    isDelete: 0,
                    company_masters_id: companyId,
                },
            });

        const employeeIds = companyVsApplicationLoginResult?.map(
            (item) => item.a_application_login_id
        );

        let employees;

        if (companyVsApplicationLoginResult) {
            employees = await loginModel.findAll({
                where: {
                    id: employeeIds,
                    isDelete: "0",
                },
                attributes: ['id', 'username', 'recovery_mobile'],
                raw: true
            });
        }

        const employeeMap = new Map(employees.map(e => [String(e.id), e])) || [];

        // Filter transactions to only those with valid/existing employee
        accountData = accountData.filter(acc => employeeMap?.has(String(acc.team_id))) || accountData;

        // ────────────────────────────────────────────────
        // Enrich data
        // ────────────────────────────────────────────────
        const accounts = await Promise.all(accountData.map(async (acc) => {
            const employee = employeeMap.get(String(acc.team_id)) || {};

            // Usernames (approved by + created by)
            let approved_name = null;
            let created_name = null;

            if (acc.approve_by_a_application_login_id) {
                const approver = await getLoginDetailById(acc.approve_by_a_application_login_id);
                approved_name = approver?.username || `ID ${acc.approve_by_a_application_login_id}`;
            }

            if (acc.a_application_login_id) {
                const creator = await getLoginDetailById(acc.a_application_login_id);
                created_name = creator?.username || `ID ${acc.a_application_login_id}`;
            }

            const amountNum = Number(acc.amount) || 0;
            const absAmount = Math.abs(amountNum).toFixed(2);

            return {
                ...acc,
                acc_series: acc.id,
                typeItem: transactionTypes[String(acc.type)] || "Unknown",
                modeItem: paymentTypeMap.get(Number(acc.mode)) || "Unknown",
                approved_name,
                created_name,
                username: employee.username || "Deleted Employee",
                recovery_mobile: employee.recovery_mobile || "",
                amountwithcurrency: amountNum ? `${currencySymbol} ${absAmount}` : `${currencySymbol} 0.00`,
                amountwithoutcurrency: amountNum ? `${absAmount}` : `0.00`,
                payment_date_time: acc.payment_date_time
                    ? moment(acc.payment_date_time).format('DD-MM-YYYY HH:mm:ss')
                    : ""
            };
        }));

        return resSuccess({
            data: {
                data: accounts,
                currency_name: currency?.short_name || ""
            },
            ack_msg: "All Account transactions fetched successfully",
            developer_msg: "success",
        });

    } catch (e) {
        console.error("getAllAccountTransactionsReport error:", e);
        return resError({
            developer_msg: e.message || "Internal server error",
        });
    }
};

export const getEmployeeAccountOutstandingReport = async (req, res) => {
    try {
        const {
            ul,
            ll,
            a_application_login_id,
            globalSearch = "",
            selected_dates,
            selectedTeamMembers,
            Flag
        } = req.body;

        const offset = ul;
        const limit = ll;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const employeeAccountTransactionsModelInstance = employeeAccountTransactionsModel(req.tenantDB);

        /* -------------------- GLOBAL SEARCH -------------------- */
        let employeeSearchCondition = {};
        const search = globalSearch.trim();

        if (search) {
            const employeeColumns = Object.keys(
                loginModel.rawAttributes
            ).filter((col) => {
                const attr = loginModel.rawAttributes[col];
                return ["STRING", "TEXT", "CHAR", "VARCHAR"].includes(attr.type.key);
            });

            employeeSearchCondition = {
                [Op.or]: employeeColumns.map((col) => ({
                    [col]: { [Op.like]: `%${search}%` },
                })),
            };
        }

        /* -------------------- DATE CONDITION -------------------- */
        const endDate = moment(selected_dates?.[1]).format("YYYY-MM-DD");

        const dateCondition = Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("approve_date_time")),
            Op.lte,
            endDate
        );

        /* -------------------- USER RIGHTS -------------------- */
        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
        const userRightsList = await applicationLoginTypeRightModelIntance.findOne({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                a_application_login_id,
                isDelete: 0,
                page_id: PAGE_ID.EMP_ACCOUNT_HISTORY,
            },
            attributes: ["a_page_id_rights_jason"],
        });

        let whereClause = {};
        if (userRightsList?.a_page_id_rights_jason) {
            try {
                const rights = JSON.parse(userRightsList.a_page_id_rights_jason);
                if (rights.all_data == 1) {
                    whereClause.company_masters_id = findCompanyId.company_masters_id;
                } else if (rights.personal == 1) {
                    whereClause.a_application_login_id = a_application_login_id;
                }
            } catch (err) {
                console.error("Rights JSON error:", err);
            }
        }

        /* -------------------- TEAM MEMBER FILTER -------------------- */
        if (selectedTeamMembers?.length > 0) {
            whereClause.team_id = {
                [Op.in]: selectedTeamMembers,
            }
        }

        /* -------------------- FETCH ALL TRANSACTIONS FOR AGGREGATION -------------------- */
        // First, get ALL transactions (no limit) to calculate outstanding amounts
        const allTransactions = await employeeAccountTransactionsModelInstance.findAll({
            where: {
                ...whereClause,
                isDelete: 0,
                [Op.and]: [dateCondition],
                approve_by_a_application_login_id: {
                    [Op.ne]: 0
                },
            },
            attributes: [
                "team_id",
                "type",
                [Sequelize.fn("SUM", Sequelize.col("amount")), "total_amount"],
            ],
            group: ["team_id", "type"],
            raw: true,
            subQuery: false, // Ensures group works properly
        });

        /* -------------------- AGGREGATE OUTSTANDING BY EMPLOYEE -------------------- */
        // Calculate outstanding amount per employee
        const outstandingByEmployee = {};

        allTransactions.forEach((txn) => {
            const empId = txn.team_id;
            const amount = parseFloat(txn.total_amount || 0);

            if (!outstandingByEmployee[empId]) {
                outstandingByEmployee[empId] = { credit: 0, debit: 0 };
            }

            if (txn.type === 1) {
                outstandingByEmployee[empId].credit += amount;
            } else if (txn.type === 2) {
                outstandingByEmployee[empId].debit += amount;
            }
        });

        /* -------------------- GET UNIQUE EMPOLYEE IDS TO FETCH DETAILS -------------------- */
        const empIds = Object.keys(outstandingByEmployee).map(Number).filter(Boolean);

        if (empIds.length === 0) {
            return resSuccess({
                data: [],
                ack_msg: "No data found",
            });
        }

        // Fetch all employee details in one query
        const allEmployees = await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: empIds,
                },
                isDelete: 0,
                ...employeeSearchCondition,
            },
            attributes: [
                "id",
                [
                    Sequelize.fn(
                        "CONCAT",
                        Sequelize.col("username"),
                        " - ",
                        Sequelize.col("recovery_mobile")
                    ),
                    "employee_name",
                ],
            ],
            raw: true,
        });

        /* -------------------- CURRENCY -------------------- */
        const companyCurrency = await companyModel.findOne({
            where: { id: findCompanyId.company_masters_id, isDelete: 0 },
            attributes: ["currency_id"],
        });

        const currency = await currencyModel.findOne({
            where: { id: companyCurrency?.currency_id, isDelete: 0 },
            attributes: ["symbol"],
        });

        const symbol = currency?.symbol || "";

        /* -------------------- BUILD RESULTS WITH FILTERING -------------------- */
        let results = [];

        allEmployees.forEach((emp) => {
            const outstanding = outstandingByEmployee[emp.id];
            const totalCredit = outstanding.credit;
            const totalDebit = outstanding.debit;
            const outstandingAmount = totalDebit - totalCredit;

            // Apply filtering
            if (outstandingAmount === 0) return; // Skip zero outstanding
            if (Flag === "Payable" && outstandingAmount >= 0) return; // Skip if filtering for payable
            if (Flag === "Receivable" && outstandingAmount < 0) return; // Skip if filtering for receivable

            results.push({
                employee_name: emp.employee_name,
                total_credit: `${totalCredit.toFixed(2)}`,
                total_debit: `${totalDebit.toFixed(2)}`,
                total_outstanding_amount: `${Math.abs(outstandingAmount).toFixed(2)}`,
                outstanding_type: outstandingAmount >= 0 ? "Receivable" : "Payable",
            });
        });

        /* -------------------- APPLY PAGINATION -------------------- */
        // NOW apply limit/offset on filtered results
        const totalRecords = results.length;
        const paginatedResults = results.slice(offset, offset + limit);

        return resSuccess({
            data: paginatedResults,
            ack_msg: "Data fetched successfully",
            total: totalRecords,
            offset,
            limit,
        });
    } catch (error) {
        console.error("getEmployeeAccountOutstandingReport Error:", error);
        return resBadRequest({
            ack_msg: error.message || "Something went wrong",
        });
    }
};