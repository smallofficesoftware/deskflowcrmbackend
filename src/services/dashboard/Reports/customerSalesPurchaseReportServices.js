import { Op } from "sequelize";
import sequelize from "../../../config/sequelize.js";
import { cartModel } from "../../../models/activities/cartsModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import companyModel from "../../../models/company_setup/companyModel.js";
import currencyModel from "../../../models/configuration/currencyModel.js";
import { stateModel } from "../../../models/masters/stateModel.js";
import {
    resBadRequest,
    resSuccess
} from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const getCustomerSalesPurchaseReport = async (req) => {
    try {
        const selectedDates = req.body.selectedDates || [];
        const selectedTeamMembers = req.body.selectedTeamMembers || [];
        const { globalSearch = "", ul = 0, ll = 50, a_application_login_id, selectedContactId } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;

        // Fetch company currency symbol
        const companyCurrency = await companyModel.findOne({
            where: {
                id: companyId,
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

        const currencySymbol = currency?.symbol || "₹";

        // Date range filter for invoices (created_date_time)
        let dateFilter = {};
        if (selectedDates && selectedDates.length === 2) {
            const startDate = new Date(selectedDates[0]);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(selectedDates[1]);
            endDate.setHours(23, 59, 59, 999);

            dateFilter = {
                created_date_time: {
                    [Op.between]: [startDate, endDate],
                },
            };
        }

        const ContactModel = contactModel(req.tenantDB);
        const CartsModel = cartModel(req.tenantDB);
        const StateModel = stateModel(req.tenantDB);

        // Filter by customer if selected
        let cartWhere = {
            isDelete: 0,
            company_masters_id: companyId,
            type: { [Op.in]: [3, 5] },
            to_customer_id: { [Op.ne]: null },
            ...dateFilter,
        };

        if (selectedContactId) {
            cartWhere.to_customer_id = selectedContactId;
        }

        // 1. Single aggregated GROUP BY query for all sales (3) and purchase (4) invoices
        const cartAggregates = await CartsModel.findAll({
            attributes: [
                "to_customer_id",
                "type",
                [sequelize.fn("SUM", sequelize.col("grand_total")), "totalAmount"],
            ],
            where: cartWhere,
            group: ["to_customer_id", "type"],
            raw: true,
        });

        if (!cartAggregates || cartAggregates.length === 0) {
            return resSuccess({
                data: {
                    item: [],
                    totalRecords: 0,
                    summary: {
                        totalCustomers: 0,
                        totalSales: 0,
                        totalPurchase: 0,
                        netBalance: 0,
                        currency_symbol: currencySymbol,
                    },
                },
            });
        }

        // Build customer totals map: customerId -> { totalSales, totalPurchase }
        const customerTotalsMap = new Map();
        cartAggregates.forEach((row) => {
            const custId = row.to_customer_id;
            if (!customerTotalsMap.has(custId)) {
                customerTotalsMap.set(custId, { totalSales: 0, totalPurchase: 0 });
            }
            const data = customerTotalsMap.get(custId);
            const amount = parseFloat(row.totalAmount || 0);
            if (row.type === 3) {
                data.totalSales += amount;
            } else if (row.type === 5 || row.type === 4) {
                data.totalPurchase += amount;
            }
        });

        // 2. Fetch details for only the relevant customers with invoice records
        const relevantCustomerIds = Array.from(customerTotalsMap.keys());

        let contactWhere = {
            id: { [Op.in]: relevantCustomerIds },
            company_masters_id: companyId,
            isDelete: 0,
        };

        if (selectedTeamMembers && selectedTeamMembers.length > 0) {
            contactWhere.a_application_login_id = {
                [Op.in]: selectedTeamMembers,
            };
        }

        // Fetch states for mapping
        const states = await StateModel.findAll({
            attributes: ["id", "state_name"],
            raw: true,
        });
        const stateMap = new Map(states.map((s) => [String(s.id), s.state_name]));

        const contacts = await ContactModel.findAll({
            where: contactWhere,
            attributes: ["id", "person_name", "company_name", "client_code", "state", "gst_number"],
            raw: true,
        });

        // 3. Map items fast in memory
        const validItems = contacts
            .map((contact) => {
                const totals = customerTotalsMap.get(contact.id) || { totalSales: 0, totalPurchase: 0 };
                const totalSales = totals.totalSales;
                const totalPurchase = totals.totalPurchase;

                if (totalSales === 0 && totalPurchase === 0) return null;

                const netBalance = Number((totalSales - totalPurchase).toFixed(2));

                let relationship = "-";
                if (netBalance < 0) {
                    relationship = "Net Creditor";
                } else if (netBalance > 0) {
                    relationship = "Net Debtor";
                }

                const customerCode = contact.client_code || "";
                const customerName =
                    contact.company_name || contact.person_name || "Unknown Customer";
                const stateName =
                    stateMap.get(String(contact.state)) || contact.state || "-";
                const gstin = contact.gst_number || "-";

                return {
                    id: contact.id,
                    customer_code: customerCode,
                    customer_name: customerName,
                    state: stateName,
                    gstin: gstin,
                    total_sales: totalSales,
                    total_purchase: totalPurchase,
                    net_balance: netBalance,
                    relationship: relationship,
                    currency_symbol: currencySymbol,
                };
            })
            .filter(Boolean);

        // Calculate Summary Totals
        const totalCustomers = validItems.length;
        const totalSalesSum = validItems.reduce((acc, item) => acc + item.total_sales, 0);
        const totalPurchaseSum = validItems.reduce((acc, item) => acc + item.total_purchase, 0);
        const netBalanceSum = Number((totalSalesSum - totalPurchaseSum).toFixed(2));

        // Global Search Filter
        let filteredItems = validItems;
        if (globalSearch && globalSearch.trim()) {
            const searchTerm = globalSearch.trim().toLowerCase();
            filteredItems = validItems.filter(
                (item) =>
                    item.customer_code.toLowerCase().includes(searchTerm) ||
                    item.customer_name.toLowerCase().includes(searchTerm) ||
                    item.state.toLowerCase().includes(searchTerm) ||
                    item.gstin.toLowerCase().includes(searchTerm) ||
                    item.relationship.toLowerCase().includes(searchTerm)
            );
        }

        const paginatedItems = filteredItems.slice(ul, ul + ll);

        return resSuccess({
            data: {
                item: paginatedItems,
                totalRecords: filteredItems.length,
                summary: {
                    totalCustomers,
                    totalSales: totalSalesSum,
                    totalPurchase: totalPurchaseSum,
                    netBalance: netBalanceSum,
                    currency_symbol: currencySymbol,
                },
            },
        });
    } catch (e) {
        console.error("getCustomerSalesPurchaseReport Service Error:", e);
        return resBadRequest({ developer_msg: `Error: ${e.message || e}` });
    }
};
