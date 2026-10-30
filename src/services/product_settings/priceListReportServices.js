import moment from "moment";
import { Op, QueryTypes } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const ROW_LIMIT = 5000;

const round = (n) => (n === null || n === undefined ? null : Math.round((Number(n) || 0) * 10000) / 10000);

// "1,3" / 1 / [1,3] -> [1, 3]
const toIdList = (value) =>
    isValid(value)
        ? String(value)
              .split(",")
              .map((v) => Number(v.trim()))
              .filter((v) => Number.isFinite(v) && v > 0)
        : [];

/**
 * Price List Report.
 *
 * `current`: every live price list item with its present rate / discount / net rate.
 * `history`: every rate / discount change inside the date range, old value next to new value
 * (filled by the `trg_price_lists_*` triggers into `price_list_history`, so it only goes back to
 * the day the triggers were created).
 *
 * Body: { from_date, to_date, pricelist_masters_id? (id or "1,3"), product_id? (id or "1,3"), searchTerm? }
 * (dates YYYY-MM-DD). Returns { current, history, totals }.
 */
export const getPriceListReport = async (req) => {
    try {
        const { from_date, to_date, pricelist_masters_id, product_id, searchTerm } = req.body;
        if (!moment(from_date, "YYYY-MM-DD", true).isValid() || !moment(to_date, "YYYY-MM-DD", true).isValid()) {
            return resError({
                ack_msg: "Invalid date range",
                developer_msg: "from_date and to_date must be YYYY-MM-DD",
            });
        }

        const masterIds = toIdList(pricelist_masters_id);
        const productIds = toIdList(product_id);
        const search = isValid(searchTerm) ? `%${String(searchTerm).trim()}%` : null;

        const filter = (alias) => `
            ${masterIds.length > 0 ? `AND ${alias}.pricelist_masters_id IN (:masterIds)` : ""}
            ${productIds.length > 0 ? `AND ${alias}.product_id IN (:productIds)` : ""}`;
        const searchClause = search ? "AND (pm.price_list_name LIKE :search OR p.product_name LIKE :search OR p.product_code LIKE :search)" : "";
        const replacements = {
            from_date,
            to_date,
            masterIds: masterIds.length > 0 ? masterIds : [0],
            productIds: productIds.length > 0 ? productIds : [0],
            search,
            limit: ROW_LIMIT,
        };

        const current = await req.tenantDB.query(
            `SELECT pl.id AS price_list_id, pl.pricelist_masters_id, pm.price_list_name,
                    pl.product_id, p.product_name, p.product_code,
                    pl.rate, pl.discount, pl.discount_amount, pl.net_rate,
                    pl.last_updated_by,
                    DATE_FORMAT(pl.last_updated_date_time, '%d-%m-%Y %H:%i') AS last_updated
             FROM price_lists pl
             JOIN pricelist_masters pm ON pm.id = pl.pricelist_masters_id AND pm.isDelete = 0
             LEFT JOIN products p ON p.id = pl.product_id
             WHERE pl.isDelete = 0
               ${filter("pl")}
               ${searchClause}
             ORDER BY pm.price_list_name ASC, p.product_name ASC
             LIMIT :limit`,
            { replacements, type: QueryTypes.SELECT }
        );

        const history = await req.tenantDB.query(
            `SELECT h.id AS history_id, h.price_list_id, h.pricelist_masters_id, pm.price_list_name,
                    h.product_id, p.product_name, p.product_code, h.change_type,
                    h.old_rate, h.new_rate, h.old_discount, h.new_discount,
                    h.old_net_rate, h.new_net_rate, h.changed_by,
                    DATE_FORMAT(h.changed_date_time, '%d-%m-%Y %H:%i') AS changed_date_time
             FROM price_list_history h
             LEFT JOIN pricelist_masters pm ON pm.id = h.pricelist_masters_id
             LEFT JOIN products p ON p.id = h.product_id
             WHERE DATE(h.changed_date_time) BETWEEN :from_date AND :to_date
               ${filter("h")}
               ${searchClause}
             ORDER BY h.changed_date_time DESC, h.id DESC
             LIMIT :limit`,
            { replacements, type: QueryTypes.SELECT }
        );

        // Filter choices: every live price list, and every product that is priced in one.
        // Independent of the filters above, so picking one doesn't shrink the other's list.
        const priceListOptions = await req.tenantDB.query(
            `SELECT id, price_list_name AS name FROM pricelist_masters WHERE isDelete = 0 ORDER BY price_list_name ASC`,
            { type: QueryTypes.SELECT }
        );
        const productOptions = await req.tenantDB.query(
            `SELECT p.id, p.product_name AS name, p.product_code AS code
             FROM products p
             WHERE p.id IN (
                 SELECT pl.product_id FROM price_lists pl
                 JOIN pricelist_masters pm ON pm.id = pl.pricelist_masters_id AND pm.isDelete = 0
                 WHERE pl.isDelete = 0
             )
             ORDER BY p.product_name ASC`,
            { type: QueryTypes.SELECT }
        );

        // Users live in the master DB, so resolve their names here.
        const userIds = [...new Set([...current.map((r) => r.last_updated_by), ...history.map((r) => r.changed_by)].filter((v) => v))];
        const userMap = new Map();
        if (userIds.length > 0) {
            const users = await loginModel.findAll({
                where: { id: { [Op.in]: userIds } },
                attributes: ["id", "username"],
                raw: true,
            });
            users.forEach((u) => userMap.set(Number(u.id), u.username));
        }

        // The last 5 net rate changes of each listed item, whatever the selected period (newest first), for the
        // Net Rate column. Only worked out when a price list or product is chosen - the screen shows rows only then.
        const recentByItem = new Map();
        if ((masterIds.length > 0 || productIds.length > 0) && current.length > 0) {
            const recent = await req.tenantDB.query(
                `SELECT h.price_list_id, h.old_net_rate, h.new_net_rate,
                        DATE_FORMAT(h.changed_date_time, '%d-%m-%Y') AS changed_on
                 FROM price_list_history h
                 WHERE h.change_type = 'update'
                   AND h.price_list_id IN (:itemIds)
                   AND NOT (h.old_net_rate <=> h.new_net_rate)
                 ORDER BY h.changed_date_time DESC, h.id DESC
                 LIMIT :recentLimit`,
                { replacements: { itemIds: current.map((r) => r.price_list_id), recentLimit: ROW_LIMIT * 5 }, type: QueryTypes.SELECT }
            );
            recent.forEach((h) => {
                const list = recentByItem.get(h.price_list_id) || [];
                if (list.length < 5) list.push({ date: h.changed_on, old_net_rate: round(h.old_net_rate), new_net_rate: round(h.new_net_rate) });
                recentByItem.set(h.price_list_id, list);
            });
        }

        const currentRows = current.map((r) => ({
            ...r,
            rate: round(r.rate),
            discount: round(r.discount),
            discount_amount: round(r.discount_amount),
            net_rate: round(r.net_rate),
            last_updated: !r.last_updated || r.last_updated.startsWith("00-00-0000") ? "" : r.last_updated,
            last_updated_by_name: userMap.get(Number(r.last_updated_by)) || "",
            recent_changes: recentByItem.get(r.price_list_id) || [],
        }));
        const historyRows = history.map((r) => ({
            ...r,
            old_rate: round(r.old_rate),
            new_rate: round(r.new_rate),
            old_discount: round(r.old_discount),
            new_discount: round(r.new_discount),
            old_net_rate: round(r.old_net_rate),
            new_net_rate: round(r.new_net_rate),
            changed_by_name: userMap.get(Number(r.changed_by)) || "",
        }));

        return resSuccess({
            data: {
                current: currentRows,
                history: historyRows,
                options: { price_lists: priceListOptions, products: productOptions },
                totals: {
                    price_lists: new Set(currentRows.map((r) => r.pricelist_masters_id)).size,
                    products: new Set(currentRows.map((r) => r.product_id)).size,
                    changes: historyRows.filter((r) => r.change_type === "update").length,
                },
            },
        });
    } catch (error) {
        console.log("getPriceListReport Error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};
