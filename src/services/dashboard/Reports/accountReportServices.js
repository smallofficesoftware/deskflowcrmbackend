import Sequelize from "sequelize";
import {
    resBadRequest,
    resError,
    resSuccess,
} from "../../../utils/sharedFunctions.js";
// import { formatDateTimeSendDataBase } from "../utils/dateTime.js";
import moment from "moment";
import { Op } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { accountTransactionsModel } from "../../../models/activities/accountTransactionsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { paymentTypeModel } from "../../../models/activities/paymentTypeModel.js";
import { applicationLoginTypeRightModel } from "../../../models/application_login/applicationLoginTypeRightModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { getCompanyByLoginId, getLoginDetailById } from "../../commonServices.js";


export const getAccountOutstandingReport = async (req, res) => {
    try {
        const {
            ul,
            ll,
            a_application_login_id,
            globalSearch = "",
            selected_dates,
            selectedContactId,
            referenceWiseContact,
            Flag
        } = req.body;

        const offset = ul;
        const limit = ll;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const AccountTransactionModel = accountTransactionsModel(req.tenantDB);
        const ContactMasterModel = contactModel(req.tenantDB);

        /* -------------------- GLOBAL SEARCH -------------------- */
        let contactSearchCondition = {};
        const search = globalSearch.trim();

        if (search) {
            const contactColumns = Object.keys(
                ContactMasterModel.rawAttributes
            ).filter((col) => {
                const attr = ContactMasterModel.rawAttributes[col];
                return ["STRING", "TEXT", "CHAR", "VARCHAR"].includes(attr.type.key);
            });

            contactSearchCondition = {
                [Op.or]: contactColumns.map((col) => ({
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
                page_id: PAGE_ID.ACCOUNTOUTSTANDING_REPORT,
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

        /* -------------------- CONTACT FILTER -------------------- */
        if (selectedContactId && referenceWiseContact == 1) {
            whereClause.contact_masters_id = selectedContactId;
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

            const contactIds = findreffrancewiseContact.map((item) => item.id);
            whereClause.contact_masters_id = {
                [Op.in]: contactIds,
            };
        }

        /* -------------------- FETCH ALL TRANSACTIONS FOR AGGREGATION -------------------- */
        // First, get ALL transactions (no limit) to calculate outstanding amounts
        const allTransactions = await AccountTransactionModel.findAll({
            where: {
                ...whereClause,
                isDelete: 0,
                [Op.and]: [dateCondition],
                approve_by_a_application_login_id: {
                    [Op.ne]: 0
                },
            },
            attributes: [
                "contact_masters_id",
                "type",
                [Sequelize.fn("SUM", Sequelize.col("amount")), "total_amount"],
            ],
            group: ["contact_masters_id", "type"],
            raw: true,
            subQuery: false, // Ensures group works properly
        });

        /* -------------------- AGGREGATE OUTSTANDING BY CONTACT -------------------- */
        // Calculate outstanding amount per contact
        const outstandingByContact = {};

        allTransactions.forEach((txn) => {
            const contactId = txn.contact_masters_id;
            const amount = parseFloat(txn.total_amount || 0);

            if (!outstandingByContact[contactId]) {
                outstandingByContact[contactId] = { credit: 0, debit: 0 };
            }

            if (txn.type === 1) {
                outstandingByContact[contactId].credit += amount;
            } else if (txn.type === 2) {
                outstandingByContact[contactId].debit += amount;
            }
        });

        /* -------------------- GET UNIQUE CONTACT IDS TO FETCH DETAILS -------------------- */
        const contactIds = Object.keys(outstandingByContact).map(Number);

        if (contactIds.length === 0) {
            return resSuccess({
                data: [],
                ack_msg: "No data found",
            });
        }

        // Fetch all contact details in one query
        const allContacts = await ContactMasterModel.findAll({
            where: {
                id: {
                    [Op.in]: contactIds,
                },
                isDelete: 0,
                ...contactSearchCondition,
            },
            attributes: [
                "id",
                [
                    Sequelize.fn(
                        "CONCAT",
                        Sequelize.col("company_name"),
                        " (",
                        Sequelize.col("person_name"),
                        ") - ",
                        Sequelize.col("mobile_number")
                    ),
                    "contact_name",
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

        allContacts.forEach((contact) => {
            const outstanding = outstandingByContact[contact.id];
            const totalCredit = outstanding.credit;
            const totalDebit = outstanding.debit;
            const outstandingAmount = totalDebit - totalCredit;

            // Apply filtering
            if (outstandingAmount === 0) return; // Skip zero outstanding
            if (Flag === "Payable" && outstandingAmount >= 0) return; // Skip if filtering for payable
            if (Flag === "Receivable" && outstandingAmount < 0) return; // Skip if filtering for receivable

            results.push({
                contact_name: contact.contact_name,
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
        console.error("Outstanding Report Error:", error);
        return resBadRequest({
            ack_msg: error.message || "Something went wrong",
        });
    }
};




export const getAllAccountTranstionsReport = async (req, res) => {
    try {
        const {
            a_application_login_id,
            selected_dates,
            selectedTeamMembers,
            ul,
            ll,
            credit_debit_flag,
            globalSearch,
            selectedContactId,
            referenceWiseContact,
            selectedPaymentType,
            selectedPaymentBy
        } = req.body;

        const searchTerm = (globalSearch || "").trim();

        const offset = Number(ul) || 0;
        const limit = Number(ll) || undefined; // undefined = no limit

        // ────────────────────────────────────────────────
        // Full-text search across string/text columns
        // ────────────────────────────────────────────────
        let fullTextSearchCondition = {};
        if (searchTerm) {
            const model = accountTransactionsModel(req.tenantDB);
            const stringColumns = Object.keys(model.rawAttributes).filter(col => {
                const typeKey = model.rawAttributes[col]?.type?.key;
                return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(typeKey);
            });

            const like = `%${searchTerm}%`;
            fullTextSearchCondition = {
                [Op.or]: stringColumns.map(col => ({ [col]: { [Op.like]: like } }))
            };
        }

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
            page_id: PAGE_ID.ACCOUNT_HISTORY,
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
            ...fullTextSearchCondition
        };

        // Team member filter (only if allowed by rights)
        if (selectedTeamMembers?.length > 0) {
            if (showAllData) {
                whereClause.a_application_login_id = { [Op.in]: selectedTeamMembers };
            }
            // else: ignore team filter if not admin (personal data only)
        }


        if (credit_debit_flag === 1) {
            whereClause.type = 1;
        } else if (credit_debit_flag === 2) {
            whereClause.type = 2;
        }

        // Credit/Debit filter
        if (selectedPaymentType === 1) {
            whereClause.type = 1;
        } else if (selectedPaymentType === 2) {
            whereClause.type = 2;
        }

        // ────────────────────────────────────────────────
        // PaymentBy Filter
        // ────────────────────────────────────────────────
        if (Array.isArray(selectedPaymentBy) && selectedPaymentBy.length > 0) {
            const hasBlank = selectedPaymentBy.includes(-6666);
            const normalPaymentBys = selectedPaymentBy.filter((id) => id !== -6666);

            if (hasBlank && normalPaymentBys.length > 0) {
                whereClause.mode = {
                    [Op.or]: [
                        { [Op.in]: normalPaymentBys },
                        { [Op.is]: null },
                        { [Op.eq]: 0 },
                        { [Op.eq]: "" },
                    ],
                };
            } else if (hasBlank) {
                whereClause.mode = {
                    [Op.or]: [
                        { [Op.is]: null },
                        { [Op.eq]: 0 },
                        { [Op.eq]: "" },
                    ],
                };
            } else {
                whereClause.mode = {
                    [Op.in]: normalPaymentBys,
                };
            }
        }

        // Personal data restriction
        if (!showAllData && showPersonalData) {
            whereClause.a_application_login_id = a_application_login_id;
        }
        if (selectedContactId && referenceWiseContact == 1) {

            whereClause.contact_masters_id = selectedContactId;

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

            const contactIds = findreffrancewiseContact.map(
                (item) => item.id
            );

            whereClause.contact_masters_id = {
                [Op.in]: contactIds,
            };
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
        const accountModel = accountTransactionsModel(req.tenantDB);
        let accountData = await accountModel.findAll({
            where: whereClause,
            offset,
            limit,
            raw: true,
            order: [['created_date_time', 'DESC']] // ← added common default sort
        });

        // ────────────────────────────────────────────────
        // Fetch all active contacts (for filtering + lookup)
        // ────────────────────────────────────────────────
        const contactModels = contactModel(req.tenantDB);
        const contacts = await contactModels.findAll({
            where: {
                company_masters_id: companyId,
                isDelete: 0
            },
            attributes: ['id', 'person_name', 'mobile_number', 'company_name'],
            raw: true
        });

        const contactMap = new Map(contacts.map(c => [String(c.id), c]));

        // Filter transactions to only those with valid/existing contacts
        accountData = accountData.filter(acc => contactMap.has(String(acc.contact_masters_id)));

        // ────────────────────────────────────────────────
        // Enrich data
        // ────────────────────────────────────────────────
        const accounts = await Promise.all(accountData.map(async (acc) => {
            const contact = contactMap.get(String(acc.contact_masters_id)) || {};

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
                contact_name: contact.person_name || "Deleted Contact",
                contact_mobileNumber: contact.mobile_number || "",
                contact_companyName: contact.company_name || "",
                amountwithcurrency: amountNum ? `${currencySymbol} ${absAmount}` : `${currencySymbol} 0.00`,
                amountwithoutcurrency: amountNum ? `${absAmount}` : `0.00`,
                payment_date_time: acc.payment_date_time
                    ? moment(acc.payment_date_time).format('DD-MM-YYYY HH:mm:ss')
                    : ""
            };
        }));

        // ────────────────────────────────────────────────
        // FINAL FILTER: globalSearch on enriched fields
        // ────────────────────────────────────────────────
        let finalAccounts = accounts;

        if (searchTerm) {
            finalAccounts = accounts.filter(acc => {
                const searchableFields = [
                    acc.created_name,
                    acc.approved_name,
                    acc.contact_name,
                    acc.contact_mobileNumber,
                    acc.contact_companyName,
                    acc.modeItem,
                    acc.remark,           // optional: also search in remark
                ].filter(Boolean); // remove null/undefined

                return searchableFields.some(field =>
                    field.toString().toLowerCase().includes(searchTerm)
                );
            });
        }

        return resSuccess({
            data: {
                data: finalAccounts,
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
