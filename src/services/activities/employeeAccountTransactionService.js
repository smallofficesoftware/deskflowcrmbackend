import Sequelize from "sequelize";
import {
    formatDateAndTimeCreateDateTime,
    resBadRequest,
    resSuccess,
    sanitizeObjectOfNull
} from "../../utils/sharedFunctions.js";
// import { formatDateTimeSendDataBase } from "../utils/dateTime.js";
import ejs from "ejs";
import fs from "fs";
import path from "path";
import pdf from "pdf-creator-node";
import { Op } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { employeeAccountTransactionsModel } from "../../models/activities/employeeAccountTransactionModel.js";
import { paymentTypeModel } from "../../models/activities/paymentTypeModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import { printSettingModel } from "../../models/company_setup/printSettingModel.js";
import currencyModel from "../../models/configuration/currencyModel.js";
import { __dirnameConstant, PDF_LINK_EXTENDED_EMP_Account_TRANSACTION } from '../../utils/appConstants.js';
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { getCompanyByLoginId, getCompanyDetailByLoginId } from "../commonServices.js";



function AccountTransactionformatDateAndTime(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function AccountTransactionformatNumber(num) {
    if (num === null || num === undefined) return '';
    return Number(num).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

function AccountTransactionescapeHtml(string) {
    if (!string) return '';
    return String(string);
}

function AccountTransactionremarkToHtml(remark) {
    if (remark === undefined || remark === null) return '';
    const str = String(remark);
    const escaped = AccountTransactionescapeHtml(str);
    return escaped.replace(/\r\n|\n/g, '<br/>');
}

function AccountTransactionnumberToWordsCurrency(amount) {
    if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '';
    const num = Number(Math.abs(Number(amount))).toFixed(2);
    const [intPartStr, decPartStr] = String(num).split('.');
    const intPart = parseInt(intPartStr, 10);
    const paise = parseInt(decPartStr || '0', 10);

    const words = convertNumberToWords(intPart);
    const rupeeWord = intPart === 1 ? 'rupee' : 'rupees';
    const paiseWords = paise ? `${convertNumberToWords(paise)} paise` : '';
    const sign = Number(amount) < 0 ? 'minus ' : '';
    const joined = paiseWords ? `${words} ${rupeeWord} and ${paiseWords} only` : `${words} ${rupeeWord} only`;
    return sign + capitalizeFirst(joined);
}

function AccountTransactionconvertNumberToWords(num) {
    if (num === 0) return 'zero';
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    function twoDigit(n) {
        if (n < 20) return ones[n];
        const t = Math.floor(n / 10);
        const o = n % 10;
        return tens[t] + (o ? ' ' + ones[o] : '');
    }

    function threeDigit(n) {
        const h = Math.floor(n / 100);
        const rem = n % 100;
        return (h ? ones[h] + ' hundred' + (rem ? ' ' : '') : '') + (rem ? twoDigit(rem) : '');
    }

    let result = '';
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    const hundredPart = num;

    if (crore) result += (convertSegment(crore) + ' crore ');
    if (lakh) result += (convertSegment(lakh) + ' lakh ');
    if (thousand) result += (convertSegment(thousand) + ' thousand ');
    if (hundredPart) result += (threeDigit(hundredPart) + ' ');

    return result.trim();
}

function AccountTransactionconvertSegment(n) {
    if (n < 100) return (n < 20 ? (['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'][n]) : (['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][Math.floor(n / 10)] + (n % 10 ? ' ' + ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][n % 10] : '')));
    return threeDigitLocal(n);
}

function AccountTransactionthreeDigitLocal(n) {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const h = Math.floor(n / 100);
    const rem = n % 100;
    return (h ? ones[h] + ' hundred' + (rem ? ' ' : '') : '') + (rem ? (rem < 20 ? ones[rem] : tens[Math.floor(rem / 10)] + (rem % 10 ? ' ' + ones[rem % 10] : '')) : '');
}

function AccountTransactioncapitalizeFirst(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export const getAllEmployeeAccountTransactions = async (req, res) => {
    try {
        let { ul, ll } = req.body;
        let {
            a_application_login_id,
            team_id,
            searchTerm,
            startDate,
            endDate,
            creditFilter,
            debitFilter,
            orderBy = "DESC",
        } = req.body;
        const { qr_code } = req.query;
        const employee_id = req.query.employee_id || req.params.employee_id;

        // --------------------------------------------------------
        // 1. PUBLIC API MODE: a_application_login_id missing → use qr_code
        // --------------------------------------------------------
        if (!a_application_login_id) {
            if (!qr_code) {
                return resBadRequest({
                    developer_msg: "qr_code is required for public API",
                    ack_msg: "Invalid access"
                });
            }

            const companyData = await companyModel.findOne({
                where: { qr_code, isDelete: 0 },
                attributes: ["id", "a_application_login_id"],
            });

            if (!companyData) {
                return resBadRequest({
                    developer_msg: "Invalid QR Code",
                    ack_msg: "Company not found"
                });
            }

            a_application_login_id = companyData.a_application_login_id;
            req.headers["x-tenant-id"] = companyData.a_application_login_id;

            await new Promise((resolve, reject) => {
                tenantMiddleware(req, res, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }

        // --------------------------------------------------------
        // 2. Get company ID by login
        // --------------------------------------------------------
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        // --------------------------------------------------------
        // 3. USER RIGHTS (only when internal API)
        // --------------------------------------------------------
        let showAllData = false;
        let showPersonalData = false;

        if (!qr_code) {
            const rights = await getUserRights({
                company_masters_id: findCompanyId.company_masters_id,
                a_application_login_id,
                page_id: PAGE_ID.ACCOUNT_HISTORY,
                tenentId: req.tenantDB
            });

            showAllData = rights.showAllData;
            showPersonalData = rights.showPersonalData;
        }

        // --------------------------------------------------------
        // 4. WHERE CLAUSE
        // --------------------------------------------------------
        let whereClause = {
            company_masters_id: findCompanyId.company_masters_id,
            isDelete: "0",
        };

        // Public API SHOULD ONLY show data for that one login
        if (qr_code) {
            whereClause.a_application_login_id = a_application_login_id;
        }
        // Internal personal rights
        else if (showPersonalData && !showAllData) {
            whereClause.team_id = a_application_login_id;
        }

        if (team_id && showAllData) {
            whereClause.team_id = team_id;
        }

        if (searchTerm) {
            whereClause[Op.or] = [
                { remark: { [Op.like]: `%${searchTerm}%` } },
            ];
        }

        if (startDate && endDate) {
            whereClause[Op.and] = whereClause[Op.and] || [];
            whereClause[Op.and].push(
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
                    { [Op.gte]: startDate }
                ),
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
                    { [Op.lte]: endDate }
                )
            );
        }

        // --------------------------------------------------------
        // NEW: CREDIT / DEBIT FILTER LOGIC
        // --------------------------------------------------------
        if (creditFilter == 1 && debitFilter != 2) {
            // Only Credit
            whereClause.type = 1;
        } else if (debitFilter == 2 && creditFilter != 1) {
            // Only Debit
            whereClause.type = 2;
        }
        // If both or neither → show all (no extra filter)

        // --------------------------------------------------------
        // 5. Query Transactions
        // --------------------------------------------------------
        const aTModel = employeeAccountTransactionsModel(req.tenantDB);
        const acc_payment_type = paymentTypeModel(req.tenantDB);
        const sortDir =
            String(orderBy || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

        const queryOptions = {
            where: whereClause,
            order: [["created_date_time", sortDir]],
        };

        if (ll !== undefined && ul !== undefined) {
            queryOptions.limit = Number(ll);
            queryOptions.offset = Number(ul);
        }

        const accountTransactionResult = await aTModel.findAll(queryOptions);

        const paymentTypes = await acc_payment_type.findAll({
            where: { isDelete: 0 },
            attributes: ["id", "payment_type_name"],   // assuming column is called "name"
            raw: true,
        });

        const paymentTypeMap = new Map(
            paymentTypes.map(pt => [Number(pt.id), pt.payment_type_name || "Unknown"])
        );

        // --------------------------------------------------------
        // 6. BALANCE CALCULATIONS (fixed)
        // --------------------------------------------------------
        let totalAmountCredit = 0;
        let totalAmountDebit = 0;

        accountTransactionResult.forEach((item) => {
            if (item.approve_by_a_application_login_id !== 0) {
                if (Number(item.type) === 1) totalAmountCredit += item.amount || 0;
                if (Number(item.type) === 2) totalAmountDebit += item.amount || 0;
            }
        });

        const closingBalance = totalAmountCredit - totalAmountDebit;

        // --------------------------------------------------------
        // 7. SANITIZE + JOIN USER NAMES
        // --------------------------------------------------------

        let activeTeamList;
        let activeTeamMap;
        if (accountTransactionResult) {
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
        const accountTransactions = await Promise.all(
            accountTransactionResult.map(async (row) => {
                const json = sanitizeObjectOfNull(row.toJSON());
                const approvedByUser = activeTeamMap.get(Number(json.approve_by_a_application_login_id)) || null;
                const createdByUser = activeTeamMap.get(Number(json.a_application_login_id)) || null;
                const paymentTypeName = paymentTypeMap.get(Number(json.mode)) || null;
                return {
                    ...json,
                    approve_by_a_application_login_name: approvedByUser || null,
                    a_application_login_name: createdByUser || null,
                    payment_type_name: paymentTypeName,
                    created_date_time: formatDateAndTimeCreateDateTime(json.created_date_time),
                    payment_date_time: formatDateAndTimeCreateDateTime(json.payment_date_time),
                };
            })
        );

        // --------------------------------------------------------
        // 8. RESPONSE
        // --------------------------------------------------------
        let employeeDetails;
        if (employee_id) {
            employeeDetails = await loginModel.findOne({
                where: {
                    id: employee_id,
                    isDelete: 0,
                },
                attributes: ["id", "username", "recovery_mobile", "recovery_email"]
            });
            if (!employeeDetails) {
                employeeDetails = null;
            }
        }

        return resSuccess({
            data: {
                item: accountTransactions,
                closingBalance,
                employeeDetails
            },
        });

    } catch (e) {
        console.error(e);
        return resBadRequest({
            developer_msg: e.message,
        });
    }
};

export const createEmployeeAccountTransaction = async (req, res) => {
    try {
        const {
            team_id,
            a_application_login_id,
            amount,
            type,
            mode,
            remark,
            payment_date_time,
            auto_reverse_entry
        } = req.body;

        // Validation
        if (!team_id || !a_application_login_id || !amount) {
            return resError({
                ack_msg: "team_id, a_application_login_id and amount are required"
            });
        }

        const tenantDB = req.tenantDB;
        const EmployeeTransaction = employeeAccountTransactionsModel(tenantDB);

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        // ====================== RIGHTS CHECK ======================
        let isApproveRight = false;

        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(tenantDB);

        const userRightsList = await applicationLoginTypeRightModelIntance.findOne({
            where: {
                company_masters_id: findCompanyId.company_masters_id,
                a_application_login_id: a_application_login_id,
                isDelete: 0,
                page_id: PAGE_ID.EMP_ACCOUNT_HISTORY,
            },
            attributes: ["a_page_id_rights_jason"],
        });

        if (userRightsList?.a_page_id_rights_jason) {
            try {
                const rights = JSON.parse(userRightsList.a_page_id_rights_jason);

                // Check if user has "approve" rights (you can adjust the key name if different)
                if (rights.approve == 1) {
                    isApproveRight = true;
                }
            } catch (err) {
                logger.error("Rights JSON parse error:", err);
            }
        }

        const now = new Date();

        const baseData = {
            team_id,
            a_application_login_id,
            amount,
            mode: mode || 6,
            remark: remark || "",
            payment_date_time: payment_date_time,
            company_masters_id: findCompanyId.company_masters_id,
            approve_by_a_application_login_id: 0,
            approve_date_time: ""
        };
        if (isApproveRight) {
            baseData.approve_by_a_application_login_id = a_application_login_id;
            baseData.approve_date_time = now;
        }

        let createdItems = [];

        // === Normal Entry ===
        const firstEntry = await EmployeeTransaction.create({
            ...baseData,
            type: Number(type)
        });

        createdItems.push(firstEntry);

        // === Auto Create Opposite Type Entry ===
        if (auto_reverse_entry === 1) {
            const oppositeType = Number(type) === 1 ? 2 : 1;

            const secondEntry = await EmployeeTransaction.create({
                ...baseData,
                type: oppositeType
            });

            createdItems.push(secondEntry);
        }
        return resSuccess({
            ack_msg: "Employee account transaction created successfully.",
            data: createdItems
        });

    } catch (error) {
        logger.error("Error in createEmployeeAccountTransaction:", error);
        return resBadRequest({
            ack_msg: "Failed to create employee account transaction",
            developer_msg: error.message
        });
    }
};

export const updateEmployeeAccountTransaction = async (req, res) => {
    const t = await req.tenantDB.transaction();
    try {
        const {
            approveId,
            a_application_login_id,
            created_date_time,
            approve_by_a_application_login_id,
        } = req.body;

        if (
            !approveId ||
            !a_application_login_id ||
            !created_date_time ||
            !approve_by_a_application_login_id
        ) {
            return resBadRequest({ ack_msg: "Missing required fields" });
        }

        console.log("[updateEmployeeAccountTransaction] Starting approval", {
            approveId,
            requester: a_application_login_id,
            approver: approve_by_a_application_login_id,
        });

        const employeeATModel = employeeAccountTransactionsModel(req.tenantDB);
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyId) {
            console.warn("[updateEmployeeAccountTransaction] Company not found", { loginId: a_application_login_id });
            return resError({ ack_msg: "Company not found for login ID" });
        }

        const acc_payment_type = paymentTypeModel(req.tenantDB);

        const approveIds = Array.isArray(approveId) ? approveId : [approveId];
        console.log("[updateEmployeeAccountTransaction] Approving IDs:", approveIds);

        // 1. Fetch transactions to approve (tenant DB)
        const records = await employeeATModel.findAll({
            where: {
                id: approveIds,
                [Op.or]: [
                    { a_application_login_id },
                    { company_masters_id: findCompanyId.company_masters_id },
                ],
                isDelete: 0,
            },
            transaction: t,
        });

        if (!records.length) {
            console.warn("[updateEmployeeAccountTransaction] No valid records found", { ids: approveIds });
            return resError({ ack_msg: "No valid records found or access denied" });
        }

        // 2. Perform approval
        await employeeATModel.update(
            {
                approve_by_a_application_login_id,
                approve_date_time: created_date_time,
            },
            {
                where: { id: approveIds },
                transaction: t,
            }
        );

        // 3. Re-fetch updated records
        const updatedTransactions = await employeeATModel.findAll({
            where: { id: approveIds },
            transaction: t,
        });

        console.log(`[updateEmployeeAccountTransaction] Approved ${updatedTransactions.length} transactions`);

        const now = new Date();
        const formattedDateTime = now.toISOString().slice(0, 19).replace("T", " ");

        // Payment types map
        const paymentTypes = await acc_payment_type.findAll({
            where: { isDelete: 0 },
            attributes: ["id", "payment_type_name"],
            raw: true,
            transaction: t,
        });

        const paymentTypeMap = new Map(
            paymentTypes.map(pt => [Number(pt.id), pt.payment_type_name?.trim() || "Unknown"])
        );

        // Username helper – IMPORTANT: NO tenant transaction!
        const usernameLiteral = async (loginId) => {
            if (!loginId) return null;
            try {
                const user = await loginModel.findOne({
                    where: { id: loginId, isDelete: 0 },
                    attributes: ["username"],
                    // transaction: t,  ← REMOVE THIS LINE – use global connection
                });
                return user?.username || null;
            } catch (err) {
                console.error("[usernameLiteral] Failed to fetch user", { loginId, error: err.message });
                return null;
            }
        };

        const approverUsername = await usernameLiteral(approve_by_a_application_login_id) || "System";

        for (const transaction of updatedTransactions) {
            const creatorUsername = await usernameLiteral(transaction.a_application_login_id) || "Unknown";

            const transactionTypeLabel =
                transaction.type === 1 ? "Credit" :
                    transaction.type === 2 ? "Debit" : "Transaction";

            const paymentTypeName = paymentTypeMap.get(Number(transaction.mode)) || "Unknown";

            // Use the person who created the transaction as reference (most logical)
            const employeeName = creatorUsername || "Team Member";

            console.log("[updateEmployeeAccountTransaction] Processed transaction", {
                id: transaction.id,
                amount: transaction.amount,
                type: transactionTypeLabel,
                creator: creatorUsername,
            });

            // ────────────────────────────────────────────────
            // Notification – only if you have assigned supervisors logic
            // Currently commented – enable when you have the correct field
            // ────────────────────────────────────────────────
            /*
            // Example: if you have a field like "supervisor_id" or "assigned_to"
            if (transaction.supervisor_id) {
                const supervisor = await loginModel.findOne({
                    where: { id: transaction.supervisor_id, isDelete: 0 },
                    attributes: ["web_refresh_token", "android_refresh_token", "ios_refresh_token"],
                });
                if (supervisor && supervisor.web_refresh_token) {
                    await sendMultipleNotification({
                        deviceTokens: [supervisor.web_refresh_token].filter(Boolean),
                        title: `Employee Transaction #${transaction.id} Approved`,
                        body: `${approverUsername} approved ${transactionTypeLabel} of ₹${transaction.amount} via ${paymentTypeName} by ${employeeName}.`,
                    });
                }
            }
            */
        }

        await t.commit();

        console.log("[updateEmployeeAccountTransaction] Success – committed");

        return resSuccess({
            ack_msg: "Employee Transactions Approved Successfully",
            data: updatedTransactions.map(t => t.toJSON()),
        });

    } catch (error) {
        console.error("[updateEmployeeAccountTransaction] Critical error:", {
            message: error.message,
            stack: error.stack,
        });

        try {
            await t.rollback();
            console.log("[updateEmployeeAccountTransaction] Transaction rolled back");
        } catch (rollbackErr) {
            console.error("[updateEmployeeAccountTransaction] Rollback failed:", rollbackErr.message);
        }

        return resBadRequest({
            developer_msg: error.message || String(error),
        });
    }
};

export const allAccountTransactionOfEmployeePDF = async (req, res) => {
    try {
        const { a_application_login_id, team_id, startDate, endDate, creaditFilter, debitFilter } = req.body;
        if (!a_application_login_id || !team_id) {
            return resBadRequest({
                ack_msg: "Missing a_application_login_id or team_id",
            });
        }
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        if (!findCompanyId) {
            return resBadRequest({ ack_msg: "Company not found for this login ID" });
        }
        const AccountTransactionModel = employeeAccountTransactionsModel(req.tenantDB);
        const companyData = await companyModel.findOne({
            where: {
                id: findCompanyId.company_masters_id,
                isDelete: "0",
            },
            attributes: ["id", "company_name", "address", "company_contact", "company_email", "gst_number", "footer_img", "currency_id", "company_logo", "a_application_login_id"],
        });
        const currency = await currencyModel.findOne({
            where: { id: companyData?.currency_id, isDelete: 0 },
            attributes: ["id", "symbol"],
        });

        const employeeData = await loginModel.findOne({
            where: {
                id: team_id,
                isDelete: 0,
            },
            attributes: [
                "id",
                "username",
                "recovery_mobile",
                "recovery_email",
            ],
            raw: true,
        });

        const whereClause = {
            isDelete: 0,
            company_masters_id: findCompanyId.company_masters_id,
            team_id: team_id,
            approve_by_a_application_login_id: { [Op.ne]: 0 }
        };

        // Sirf tab date condition add karo jab startDate aur endDate valid hain
        if (startDate && endDate) {
            // Ensure dates are in YYYY-MM-DD format (or convert if needed)
            whereClause[Op.and] = [
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
                    { [Op.gte]: startDate }
                ),
                Sequelize.where(
                    Sequelize.fn("DATE", Sequelize.col("payment_date_time")),
                    { [Op.lte]: endDate }
                ),
            ];
        }
        // Agar dates nahi hain → koi date filter nahi lagega → all transactions aayengi

        // NEW: Credit / Debit Filter Logic
        if (creaditFilter == 1 && debitFilter != 2) {
            // Only Credit transactions
            whereClause.type = 1;
        } else if (debitFilter == 2 && creaditFilter != 1) {
            // Only Debit transactions
            whereClause.type = 2;
        }
        const transactions = await AccountTransactionModel.findAll({
            where: whereClause,
            order: [["created_date_time", "ASC"]],
            raw: true,
        });
        let running = 0;
        const rowsWithBalance = transactions.map((tx) => {
            const amt = Number(tx.amount || 0);
            if (Number(tx.type) === 1) running += amt;
            if (Number(tx.type) === 2) running -= amt;
            return {
                id: tx.id,
                payment_date: new Date(tx.payment_date_time).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
                remark: tx.remark,
                credit: tx.type === 1 ? amt.toLocaleString("en-IN") : "-",
                debit: tx.type === 2 ? amt.toLocaleString("en-IN") : "-",
                balance: running.toLocaleString("en-IN"),
            };
        });

        const totalCredit = transactions.filter(t => t.type === 1).reduce((s, t) => s + Number(t.amount || 0), 0).toLocaleString("en-IN");
        const totalDebit = transactions.filter(t => t.type === 2).reduce((s, t) => s + Number(t.amount || 0), 0).toLocaleString("en-IN");
        const lastRowBalance = rowsWithBalance.length > 0 ? rowsWithBalance[rowsWithBalance.length - 1].balance : "0";

        const fromDate = rowsWithBalance.length > 0 ? rowsWithBalance[0].payment_date : "";
        const toDate = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

        let dynamicPrintView = 1;
        const htmlTemplate = fs.readFileSync(
            path.join(
                __dirnameConstant,
                `../views/account/allAccountTransactionofEmployeeV${dynamicPrintView}.ejs`
            ),
            "utf-8"
        );

        const printSettingModels = printSettingModel(req.tenantDB);

        const printSettings = await printSettingModels.findOne({
            where: {
                type: 12,
                print_version: 1,
                isDelete: 0
            },
            attributes: ["setting_details"]
        });

        const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");

        const renderedHtml = await ejs.render(htmlTemplate,
            {
                companyData,
                employeeData,
                rowsWithBalance,
                totalCredit,
                totalDebit,
                lastRowBalance,
                fromDate,
                toDate,
                backendUrl: process.env.BACKEND_OF_SMALL_OFFICE_CRM_END_POINT || "",
                settingDetails: settingDetails,
            });

        const uploadDir = path.resolve(
            __dirnameConstant,
            `../../media-folder/empAccountTransaction/${companyData.id.toString()}`
        );

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }


        const options = {
            format: "A4",
            orientation: "portrait",
            border: "15mm",
            footer: {
                height: "5mm",
                contents: {
                    default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`,
                },
            },
        };

        const filePath = path.join(uploadDir, `emp_account_statement_${Date.now()}.pdf`);

        const pdfPath = `${companyData.id.toString()}/emp_account_statement_${Date.now()}.pdf`;


        const document = {
            html: renderedHtml,
            data: {},
            path: filePath,
            type: "",
        };

        const fileLinkPath = PDF_LINK_EXTENDED_EMP_Account_TRANSACTION + pdfPath;

        await pdf.create(document, options);

        if (!fs.existsSync(filePath)) {
            console.error("PDF file was not created at:", filePath);
            return resBadRequest({ ack_msg: "Failed to generate PDF file" });
        }

        return resSuccess({
            ack_msg: "Pdf generated",
            data: { fileLinkPath, sessionName: `a${a_application_login_id}_c${companyData.id}`, mobile_number: employeeData.recovery_mobile },
        });
    } catch (error) {
        console.error(error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
}

export const employeeAccountTransactionById = async (req) => {
    try {
        let { id, a_application_login_id } = req.body;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        let whereClause = {
            id: id,
            company_masters_id: findCompanyId.company_masters_id,
        };

        const aTModel = employeeAccountTransactionsModel(req.tenantDB);
        const PaymentTypeModel = paymentTypeModel(req.tenantDB);


        const accountTransactionResult = await aTModel.findAll({
            where: whereClause,
            order: [["created_date_time", "DESC"]],
        });

        const companyModels = companyModel;

        const companyDetails = await companyModels.findOne({
            where: {
                id: findCompanyId.company_masters_id,
            },
        });

        const totalAmountCredit = accountTransactionResult.reduce(
            (sum, item) =>
                item.approve_by_a_application_login_id !== 0
                    ? Number(item.type) === 1
                        ? sum + (item.amount || 0)
                        : sum
                    : sum,
            0
        );
        const totalAmountDebit = accountTransactionResult.reduce(
            (sum, item) =>
                sum + item.approve_by_a_application_login_id !== 0
                    ? Number(item.type) === 2
                        ? sum + (item.amount || 0)
                        : sum
                    : sum,
            0
        );

        const closingBalance = totalAmountDebit * -1 + totalAmountCredit;

        if (accountTransactionResult) {
            const accountTransactions = await Promise.all(
                accountTransactionResult.map(async (item) => {
                    const sanitized = sanitizeObjectOfNull(item.toJSON());

                    const employee_name = await loginModel.findOne({
                        where: {
                            id: sanitized.team_id,
                        },
                        attributes: ["username", "recovery_email", "recovery_mobile"],
                    });
                    let payment_type_name = null;
                    if (sanitized.mode) {
                        const paymentType = await PaymentTypeModel.findOne({
                            where: { id: sanitized.mode },
                            attributes: ["payment_type_name"],
                        });
                        payment_type_name = paymentType?.payment_type_name || null;
                    }

                    return {
                        ...sanitized,
                        created_date_time: formatDateAndTimeCreateDateTime(
                            sanitized.created_date_time
                        ),
                        payment_date_time: formatDateAndTimeCreateDateTime(
                            sanitized.payment_date_time
                        ),
                        employee_name,
                        payment_type_name
                    };
                })
            );

            return resSuccess({
                data: { item: accountTransactions, closingBalance, companyDetails },
            });
        } else {
            return resError({
                ack_msg: "No AccountTransaction",
                developer_msg: "Data not found",
            });
        }
    } catch (e) {
        console.error(e);

        return resBadRequest({
            developer_msg: e,
        });
    }
};

export const employeePDFaccountv1 = async (req, res) => {
    try {
        const accountTransactionId = req.body.accountTransactionId;
        const AccountTransactionModel = employeeAccountTransactionsModel(req.tenantDB);
        const PaymentTypeModel = paymentTypeModel(req.tenantDB);

        const accountTransaction = await AccountTransactionModel.findOne({
            where: { id: accountTransactionId, isDelete: 0 },
        });
        if (!accountTransaction) {
            return resError({
                ack_msg: "Account Transaction not found.",
                developer_msg: "No account transaction found with the provided ID.",
            });
        }
        const employeeDetails = await loginModel.findOne({
            where: { id: accountTransaction.team_id, isDelete: 0 },
        });

        const companyDetail = await getCompanyDetailByLoginId(
            accountTransaction.a_application_login_id
        );

        let payment_type_name = null;
        if (accountTransaction.mode) {
            const paymentType = await PaymentTypeModel.findOne({
                where: { id: accountTransaction.mode },
                attributes: ["payment_type_name"],
            });
            payment_type_name = paymentType?.payment_type_name || null;
        }

        let dynamicPrintView = 1;
        const htmlTemplate = fs.readFileSync(
            path.join(
                __dirnameConstant,
                `../views/account/employeeAccountPDFv${dynamicPrintView}.ejs`
            ),
            "utf-8"
        );

        const printSettingModels = printSettingModel(req.tenantDB);

        const printSettings = await printSettingModels.findOne({
            where: {
                type: 12,
                print_version: 1,
                isDelete: 0
            },
            attributes: ["setting_details"]
        });

        const settingDetails = JSON.parse(printSettings?.dataValues?.setting_details || "{}");


        const renderedHtml = ejs.render(htmlTemplate, {
            companyDetails: companyDetail,
            accountTransactions: accountTransaction,
            title: accountTransaction.type === 1 ? "Credit Account Transaction" : "Debit Account Transaction",
            employeeDetails: employeeDetails,
            payment_type_name,
            currencySymbol: "₹",
            formatNumber: AccountTransactionformatNumber,
            formatDateAndTime: AccountTransactionformatDateAndTime,
            numberToWordsCurrency: AccountTransactionnumberToWordsCurrency,
            remarkToHtml: AccountTransactionremarkToHtml,
            settingDetails: settingDetails
        });
        const uploadDir = path.resolve(
            __dirnameConstant,
            `../../media-folder/empAccountTransaction/${companyDetail.id.toString()}`
        );
        const filePath = path.join(uploadDir, `emp_account_transaction_${Date.now()}.pdf`);
        const pdfPath = `emp_account_transaction_${Date.now()}.pdf`;
        const fileLinkPath = PDF_LINK_EXTENDED_EMP_Account_TRANSACTION + companyDetail.id.toString() + "/" + pdfPath;
        const document = {
            html: renderedHtml,
            data: {},
            path: filePath,
            type: "",
        };
        const options = {
            format: "A5",
            orientation: "portrait",
            border: "10mm",
            footer: {
                height: "5mm",
                contents: {
                    default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`, // page numbers
                },
            },
        };
        await pdf.create(document, options);
        return resSuccess({
            ack_msg: "Pdf generated",
            data: { fileLinkPath, mobile_number: employeeDetails.recovery_mobile, sessionName: `a${accountTransaction.a_application_login_id}_c${companyDetail.id}` },
        });
        // return resError({
        //   ack_msg: "Something went wrong.",
        //   developer_msg: "Order Id not found.",
        // });
    } catch (error) {
        console.error(error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};