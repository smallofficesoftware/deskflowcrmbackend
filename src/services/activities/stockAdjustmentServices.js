import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { buildSearchQuery } from "../../helpers/searchAlgoV1.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { wareHouseModel } from "../../models/other_settings/wareHouseModel.js";
import { getFinancialYear, getFinancialYearRangeWise, isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

const checkStockAvailability = async (req, stockDetail, stockItem) => {
    if (stockDetail.stock_adjustment_type != 3) {
        return { status: true };
    }
    const cartItemModelInstance = cartItemModel(req.tenantDB);

    const stock_list = await Promise.all(
        stockItem.map(async (product) => {
            const whereClauseOpen = {
                isDelete: 0,
                item_product_id: product.product_id,
                cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
                cart_number: { [Op.ne]: null, [Op.not]: "" },
                stock_type: { [Op.ne]: 0 },
                [Op.and]: [
                    {
                        [Op.or]: [
                            {
                                cart_type: 4,
                                reference_type: { [Op.ne]: 8 },
                            },
                            {
                                cart_type: 3,
                                reference_type: { [Op.ne]: 9 },
                            },

                            {
                                cart_type: { [Op.in]: [6, 7, 8, 9, 10, 11] },
                            },
                        ],
                    },
                ],
            };

            const findOpeningQty = await cartItemModelInstance.findAll({
                where: whereClauseOpen,
            });
            const OpenQty = findOpeningQty.reduce((total, item) => {
                if ((item.cart_type == 4 && item.reference_type != 8) || item.cart_type == 6 || item.cart_type == 8 || item.cart_type == 10) {
                    return total + item.item_qty;
                } else if ((item.cart_type == 3 && item.reference_type != 9) || item.cart_type == 7 || item.cart_type == 9 || item.cart_type == 11) {
                    return total - item.item_qty;
                }
            }, 0);

            return {
                current_stock: OpenQty,
                item_id: product.product_id
            }
        })
    );

    const stockMap = new Map(
        stock_list.map((item) => [Number(item.item_id), Number(item.current_stock)])
    );

    const errors = [];

    stockItem.forEach((item) => {
        const availableStock = stockMap.get(Number(item.product_id)) ?? 0;

        if (availableStock <= 0) {
            errors.push(`${item.product_name} is out of stock`);
        } else if (availableStock < Number(item.qty)) {
            errors.push(
                `${item.product_name} has only ${availableStock}, requested ${item.qty}`
            );
        }
    });

    if (errors.length) {
        return { status: false, errors };
    }
    return { status: true };
}

export const inserStockAdjustment = async (req) => {
    try {
        const { a_application_login_id, stockDetail, stockItem } = req.body;

        if (!isValid(a_application_login_id)) {
            return resError({ ack_msg: "Something went wrong" });
        }

        if (!isValid(stockDetail.stock_adjustment_type)) {
            return resError({ ack_msg: "Stock adjustment type not find" });
        }
        const response = await checkStockAvailability(req, stockDetail, stockItem);

        if (!response?.status) {
            return resError({ ack_msg: response?.errors.join("\n") });
        }

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const companyId = findCompanyId.company_masters_id;

        const cartModelInstance = cartModel(req.tenantDB);
        const cartItemModelInstance = cartItemModel(req.tenantDB);

        const seriesDetail = await getStockSeriesNumber(
            req,
            stockDetail.stock_date,
            companyId
        );

        const totalQty = stockItem.reduce(
            (sum, v) => sum + Math.abs(parseFloat(v.qty) || 0),
            0
        );

        const baseCartPayload = {
            cart_date: stockDetail.stock_date,
            cart_status: 1,
            stock_type: 1,
            a_application_login_id,
            company_masters_id: companyId,
            cart_remark: stockDetail.stock_remark,
            total_qty: totalQty,
            update_Date_time: moment(stockDetail.stock_date).format("YYYY-MM-DD") + " " + moment().format("HH:mm:ss"),
        };

        let STOCK_INSERTED_ID = null;
        const createCartWithItems = async (type, warehouseKey, extraFields) => {
            const cart = await cartModelInstance.create({
                ...baseCartPayload,
                ...extraFields,
            });

            if (!cart) return null;
            STOCK_INSERTED_ID = cart.dataValues.id;
            await Promise.all(
                stockItem.map((v) =>
                    cartItemModelInstance.create({
                        cart_id: cart.dataValues.id,
                        cart_type: type,
                        stock_type: 1,
                        a_application_login_id,
                        company_masters_id: companyId,
                        item_category_id: v.category_id,
                        item_category_name: v.category_name,
                        item_product_code: v.product_code,
                        item_product_description: v.remark,
                        item_product_id: v.product_id,
                        item_product_name: v.product_name,
                        item_qty: Math.abs(v.qty),
                        item_warehouse_id: v[warehouseKey],
                        cart_date: stockDetail.stock_date,
                        cart_number: extraFields.cart_number,
                    })
                )
            );

            return cart;
        };

        const type = stockDetail.stock_adjustment_type;

        if (type == 1) {
            // OUT (11)
            await createCartWithItems(11, "warehouse_from", {
                type: 11,
                cart_number: seriesDetail.outward_series,
                sr_by_number: seriesDetail.maxSrByNo,
                sr_by_prifix: seriesDetail.outward_prefix
            });

            // IN (10)
            await createCartWithItems(10, "warehouse_to", {
                type: 10,
                cart_number: seriesDetail.inward_series,
                sr_by_number: seriesDetail.maxSrByNo,
                sr_by_prifix: seriesDetail.inward_prefix
            });
        } else if (type == 2) {
            // ONLY IN
            await createCartWithItems(10, "warehouse_from", {
                type: 10,
                cart_number: seriesDetail.inward_series,
                sr_by_number: seriesDetail.maxSrByNo,
                sr_by_prifix: seriesDetail.inward_prefix
            });
        } else if (type == 3) {
            // ONLY OUT
            await createCartWithItems(11, "warehouse_from", {
                type: 11,
                cart_number: seriesDetail.outward_series,
                sr_by_number: seriesDetail.maxSrByNo,
                sr_by_prifix: seriesDetail.outward_prefix
            });
        }
        return resSuccess({
            ack_msg: type == 1 ? "Stock transfer updated successfully" : "Stock adjustment updated successfully",
            data: { inserted_id: STOCK_INSERTED_ID }
        });
    } catch (error) {
        console.log("inserStockAdjustment Error", error);

        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};


const getStockSeriesNumber = async (req, date, company_id) => {
    const cartModelInstance = cartModel(req.tenantDB);
    const financialYearDetail = getFinancialYearRangeWise(date);
    const start_date = financialYearDetail?.start_date || null;
    const end_date = financialYearDetail?.end_date || null;

    if (!start_date || !end_date) {
        throw new Error("Invalid financial year details");
    }
    let where = {
        isDelete: 0,
        type: { [Op.in]: [10, 11] },
    };
    const start = `${start_date} 00:00:00`;
    const end = `${end_date} 23:59:59`;
    where.update_Date_time = {
        [Op.gte]: start,
        [Op.lte]: end,
    };

    const maxSrByNoResult = await cartModelInstance.max("sr_by_number", { where });
    let maxSrByNo = maxSrByNoResult ? maxSrByNoResult + 1 : 1;
    const inward_prefix_1 = "I";
    const outward_prefix_1 = "O";
    let inward_prefix = `ST`;
    let outward_prefix = `ST`;
    const inward_series = `${inward_prefix}/${String(maxSrByNo).padStart(2, "0")}/${inward_prefix_1}/${getFinancialYear(date)}`;
    const outward_series = `${outward_prefix}/${String(maxSrByNo).padStart(2, "0")}/${outward_prefix_1}/${getFinancialYear(date)}`;
    inward_prefix = `ST/${inward_prefix_1}`;
    outward_prefix = `ST/${outward_prefix_1}`;
    return { maxSrByNo, inward_series, outward_series, inward_prefix, outward_prefix }
}

export const getStockAdjustment = async (req) => {
    try {
        const { ul, ll, a_application_login_id, searchTerm } = req.body;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        const cartModelInstance = cartModel(req.tenantDB);
        let whereClause = {
            isDelete: "0",
            type: { [Op.in]: [10, 11] }
        };
        let relevanceOrder;
        if (isValid(searchTerm) && searchTerm != 'undefined') {
            const searchableColumns = [
                'cart_number',
                'cart_remark'
            ];
            const { searchClause, relevanceSearchOrder } = buildSearchQuery(
                searchTerm,
                searchableColumns
            );

            relevanceOrder = relevanceSearchOrder;

            whereClause = {
                ...whereClause,
                [Op.and]: [
                    ...(whereClause[Op.and] || []),
                    { searchClause },
                ],
            };
        }
        const order = [];
        if (relevanceOrder && relevanceOrder.length > 0) {
            order.push(...relevanceOrder);
        }
        order.push(['sr_by_number', 'DESC']);
        const resultDb = await cartModelInstance.findAll({
            where: whereClause,
            limit: Number(ll) || 100000,
            offset: Number(ul) || 0,
            order,
            raw: true
        });
        if (!resultDb) {
            return resError({
                ack_msg: "No stock detail found",
                developer_msg: "Data not found",
            });
        }
        let activeTeamList;
        let activeTeamMap;
        if (resultDb) {
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
        const result = resultDb.map((v) => {
            return {
                ...v,
                created_date_time: moment(v.created_date_time).format("YYYY-MM-DD hh:mm A"),
                created_by_name: activeTeamMap.get(Number(v.a_application_login_id)) || "",
                cart_date: moment(v.cart_date).format("DD-MM-YYYY"),
            }
        })
        return resSuccess({
            data: { item: result },
        });
    } catch (error) {
        console.log("getStockAdjustment Error", error);

        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
}

export const deleteStockAdjustment = async (req) => {
    try {
        const { stock_adjustment_id, a_application_login_id } = req.body;
        if (!stock_adjustment_id) {
            return resError({
                ack_msg: "Invalid request",
                developer_msg: "id not found",
            });
        }
        const cartModelInstance = cartModel(req.tenantDB);
        const cartItemModelInstance = cartItemModel(req.tenantDB);

        const isCartUpdate = await cartModelInstance.update({ isDelete: 1 }, { where: { id: stock_adjustment_id, type: { [Op.in]: [10, 11] } } });
        const isCartItemUpdate = await cartItemModelInstance.update({ isDelete: 1 }, { where: { cart_id: stock_adjustment_id, cart_type: { [Op.in]: [10, 11] } } });
        if (isCartUpdate && isCartItemUpdate) {
            return resSuccess({
                data: { ack_msg: "Stock adjustment deleted successfully" },
            });
        } else {
            return resError({
                ack_msg: "Stock adjustment not deleted",
                developer_msg: "database error",
            });
        }
    } catch (error) {
        console.log("deleteStockAdjustment Error", error);

        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
}

export const warehouseWiseItemStock = async (req) => {
    try {
        const { product_id } = req.body;
        if (!product_id) {
            return resError({
                ack_msg: "Invalid request",
                developer_msg: "id not found",
            });
        }
        const wareHouseModelInstance = wareHouseModel(req.tenantDB);
        const cartItemModelInstance = cartItemModel(req.tenantDB);

        const wareHouseGetDb = await wareHouseModelInstance.findAll({ where: { isDelete: 0 }, attributes: ["id", "warehouse_name"] });
        const dataArray = [];
        await Promise.all(
            wareHouseGetDb.map(async (v) => {
                const whereClauseOpen = {
                    isDelete: 0,
                    item_product_id: product_id,
                    cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
                    cart_number: { [Op.ne]: null, [Op.not]: "" },
                    stock_type: { [Op.ne]: 0 },
                    item_warehouse_id: v.id,
                    [Op.and]: [
                        {
                            [Op.or]: [
                                // cart_type = 4 AND reference_type != 8
                                {
                                    cart_type: 4,
                                    reference_type: { [Op.ne]: 8 },
                                },
                                {
                                    cart_type: 3,
                                    reference_type: { [Op.ne]: 9 },
                                },

                                {
                                    cart_type: { [Op.in]: [4, 3, 6, 7, 8, 9, 10, 11] },
                                },
                            ],
                        },
                    ],
                };

                const findOpeningQty = await cartItemModelInstance.findAll({
                    where: whereClauseOpen,
                });

                const OpenQty = findOpeningQty.reduce((total, item) => {
                    if ((item.cart_type == 4 && item.reference_type != 8) || item.cart_type == 6 || item.cart_type == 8 || item.cart_type == 10) {
                        return total + item.item_qty;
                    } else if ((item.cart_type == 3 && item.reference_type != 9) || item.cart_type == 7 || item.cart_type == 9 || item.cart_type == 11) {
                        return total - item.item_qty;
                    }
                }, 0);
                dataArray.push({ warehouse: v.warehouse_name, stock: OpenQty, warehouse_id: v.id })
            })
        )
        return resSuccess({
            data: { data: dataArray },
        });
    } catch (error) {
        console.log("warehouseWiseItemStock Error", error);

        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
}

export const getAllStockData = async (req) => {
    try {
        const { stock_id, a_application_login_id } = req.body;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const cartModelInstance = cartModel(req.tenantDB);
        const resultDb = await cartModelInstance.findOne({
            where: { isDelete: "0", id: stock_id },
            attributes: [
                "cart_number",
                "cart_date",
                "a_application_login_id",
                "created_date_time",
                "cart_remark"
            ],
            raw: true
        });
        if (!resultDb) {
            return resError({
                ack_msg: "No stock detail found",
                developer_msg: "Data not found",
            });
        }

        let activeTeamList;
        let activeTeamMap;
        if (resultDb) {
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
        const resultOfCarts = {
            ...resultDb,
            created_date_time: moment(resultDb.created_date_time).format("YYYY-MM-DD hh:mm A"),
            created_by_name: activeTeamMap.get(Number(resultDb.a_application_login_id)) || "",
            cart_date: moment(resultDb.cart_date).format("DD-MM-YYYY"),
        }

        const cartItemModelInstance = cartItemModel(req.tenantDB);
        const resultOfCartItems = await cartItemModelInstance.findAll({
            where: { isDelete: "0", cart_id: stock_id },
            attributes: [
                "item_product_name",
                "item_qty",
                "item_warehouse_id",
                "item_product_description",
                [
                    Sequelize.literal(`(
                                            SELECT warehouses.warehouse_name
                                            FROM warehouses
                                            WHERE warehouses.id = cart_items.item_warehouse_id
                                              AND warehouses.isDelete = 0
                                            LIMIT 1
                                          )`),
                    "item_warehouse_name"
                ]
            ],
            raw: true
        })

        const result = {
            resultOfCarts: resultOfCarts,
            resultOfCartItems: resultOfCartItems
        }

        return resSuccess({
            data: { item: result },
        });
    } catch (error) {
        console.log("getAllStockData Error", error);

        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
}
