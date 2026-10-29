import moment from "moment";
import { QueryTypes } from "sequelize";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

const round = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const SOURCE_LABELS = {
    transfer: "Warehouse transfer",
    stock_adjustment: "Stock adjustment (+/-)",
    dispatch: "Dispatch",
    sales_invoice: "Sales invoice (direct, no dispatch)",
    sales_return: "Sales return",
    grn: "GRN / Inward",
    purchase_invoice: "Purchase invoice (direct, no GRN)",
    purchase_return: "Purchase return",
};

/**
 * Warehouse transfer plus/minus report.
 *
 * A warehouse-to-warehouse transfer is saved as two carts that share
 * `sr_by_number`: type 11 (out, warehouse_from) and type 10 (in, warehouse_to).
 * Plain stock add / stock out also use type 10 / 11 on their own, so a cart only
 * counts as a transfer when both a type 10 and a type 11 cart share its
 * `sr_by_number`.
 *
 * The per-warehouse and per-product rows also carry total_in / total_out: every stock movement, not only
 * transfers (dispatch, direct invoice, GRN, sales return, purchase return, plain stock add / out), with the
 * same in/out rules as the Stock Ledger report. source_wise breaks those totals down by source.
 *
 * Body: { from_date, to_date, warehouse_id? (id or "1,3"), product_id? } (dates YYYY-MM-DD)
 * Returns { summary, product_wise, source_wise, transfers, totals }.
 */
export const getWarehouseTransferReport = async (req) => {
    try {
        const { from_date, to_date, warehouse_id, product_id } = req.body;
        if (!isValid(from_date) || !isValid(to_date) || !moment(from_date, "YYYY-MM-DD", true).isValid() || !moment(to_date, "YYYY-MM-DD", true).isValid()) {
            return resError({
                ack_msg: "Invalid date range",
                developer_msg: "from_date and to_date must be YYYY-MM-DD",
            });
        }

        const rows = await req.tenantDB.query(
            `SELECT i.id AS item_id, c.id AS cart_id, c.type, c.cart_number, c.sr_by_number,
                    DATE_FORMAT(c.cart_date, '%Y-%m-%d') AS cart_date, c.cart_remark,
                    i.item_product_id, i.item_product_name, i.item_product_code,
                    i.item_qty, i.item_warehouse_id, w.warehouse_name
             FROM carts c
             JOIN cart_items i ON i.cart_id = c.id AND i.isDelete = 0
             LEFT JOIN warehouses w ON w.id = i.item_warehouse_id
             WHERE c.isDelete = 0
               AND c.type IN (10, 11)
               AND DATE(c.cart_date) BETWEEN :from_date AND :to_date
               AND c.sr_by_number IN (
                   SELECT sr_by_number FROM carts
                   WHERE isDelete = 0 AND type IN (10, 11) AND sr_by_number IS NOT NULL
                   GROUP BY sr_by_number
                   HAVING SUM(type = 10) > 0 AND SUM(type = 11) > 0
               )
             ORDER BY c.cart_date DESC, c.sr_by_number DESC, i.id ASC`,
            { replacements: { from_date, to_date }, type: QueryTypes.SELECT }
        );

        // warehouse_id: one id, or a comma list ("1,3") as the report filter modal sends it.
        const warehouseIds = isValid(warehouse_id)
            ? String(warehouse_id).split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && String(v).length > 0)
            : [];
        const warehouseFilter = warehouseIds.length > 0 ? new Set(warehouseIds) : null;
        const productFilter = isValid(product_id) ? Number(product_id) : null;

        // Pair each out line with its in line (same transfer, same product, in id order).
        const bySr = new Map();
        for (const r of rows) {
            if (!bySr.has(r.sr_by_number)) bySr.set(r.sr_by_number, []);
            bySr.get(r.sr_by_number).push(r);
        }
        const transfers = [];
        for (const group of bySr.values()) {
            const byProduct = new Map();
            for (const r of group) {
                if (!byProduct.has(r.item_product_id)) byProduct.set(r.item_product_id, { out: [], in: [] });
                byProduct.get(r.item_product_id)[r.type == 11 ? "out" : "in"].push(r);
            }
            for (const { out, in: inn } of byProduct.values()) {
                const pairs = Math.max(out.length, inn.length);
                for (let k = 0; k < pairs; k++) {
                    const o = out[k];
                    const i = inn[k];
                    const base = o || i;
                    transfers.push({
                        sr_by_number: base.sr_by_number,
                        cart_date: moment(base.cart_date).format("DD-MM-YYYY"),
                        remark: base.cart_remark || "",
                        out_cart_number: o?.cart_number || "",
                        in_cart_number: i?.cart_number || "",
                        product_id: base.item_product_id,
                        product_name: base.item_product_name,
                        product_code: base.item_product_code,
                        from_warehouse_id: o?.item_warehouse_id ?? null,
                        from_warehouse_name: o?.warehouse_name || "",
                        to_warehouse_id: i?.item_warehouse_id ?? null,
                        to_warehouse_name: i?.warehouse_name || "",
                        qty: round(o?.item_qty ?? i?.item_qty),
                    });
                }
            }
        }

        // Every stock movement per warehouse (not only transfers), using the same direction rules as the Stock
        // Ledger report (stock_ledger_view): in = purchase invoice without a GRN reference, sales return, GRN,
        // stock add; out = sales invoice without a dispatch reference, purchase return, dispatch, stock out.
        const movementRows = await req.tenantDB.query(
            `SELECT i.cart_type, i.reference_type, c.sr_by_number, i.item_product_id, i.item_product_name, i.item_product_code,
                    i.item_qty, i.item_warehouse_id, w.warehouse_name,
                    CASE WHEN i.cart_type IN (10, 11) AND c.sr_by_number IN (
                        SELECT sr_by_number FROM carts
                        WHERE isDelete = 0 AND type IN (10, 11) AND sr_by_number IS NOT NULL
                        GROUP BY sr_by_number
                        HAVING SUM(type = 10) > 0 AND SUM(type = 11) > 0
                    ) THEN 1 ELSE 0 END AS is_transfer
             FROM cart_items i
             JOIN carts c ON c.id = i.cart_id AND c.isDelete = 0
             JOIN warehouses w ON w.id = i.item_warehouse_id
             WHERE i.isDelete = 0
               AND i.cart_number IS NOT NULL AND i.cart_number != ''
               AND DATE(c.cart_date) BETWEEN :from_date AND :to_date
               AND (
                   (i.cart_type = 4 AND i.reference_type != 8)
                   OR (i.cart_type = 3 AND i.reference_type != 9)
                   OR i.cart_type IN (6, 7, 8, 9, 10, 11)
               )`,
            { replacements: { from_date, to_date }, type: QueryTypes.SELECT }
        );
        const sourceOf = (m) => {
            if (m.cart_type == 10 || m.cart_type == 11) return m.is_transfer ? "transfer" : "stock_adjustment";
            return { 3: "sales_invoice", 4: "purchase_invoice", 6: "sales_return", 7: "purchase_return", 8: "grn", 9: "dispatch" }[m.cart_type];
        };
        const isIn = (m) => (m.cart_type == 4 && m.reference_type != 8) || [6, 8, 10].includes(Number(m.cart_type));

        const keep = (t) =>
            (warehouseFilter === null || warehouseFilter.has(t.from_warehouse_id) || warehouseFilter.has(t.to_warehouse_id)) &&
            (productFilter === null || t.product_id === productFilter);
        const filteredTransfers = transfers.filter(keep);

        // Plus / minus per warehouse and per product x warehouse.
        const summaryMap = new Map();
        const productMap = new Map();
        const bump = (map, key, seed, field, qty) => {
            if (!map.has(key)) map.set(key, { ...seed, transfer_in: 0, transfer_out: 0, total_in: 0, total_out: 0 });
            map.get(key)[field] += qty;
        };
        for (const t of filteredTransfers) {
            const sides = [
                { id: t.from_warehouse_id, name: t.from_warehouse_name, field: "transfer_out" },
                { id: t.to_warehouse_id, name: t.to_warehouse_name, field: "transfer_in" },
            ];
            for (const s of sides) {
                if (s.id === null || (warehouseFilter !== null && !warehouseFilter.has(s.id))) continue;
                bump(summaryMap, s.id, { warehouse_id: s.id, warehouse_name: s.name }, s.field, t.qty);
                bump(
                    productMap,
                    `${t.product_id}_${s.id}`,
                    { product_id: t.product_id, product_name: t.product_name, product_code: t.product_code, warehouse_id: s.id, warehouse_name: s.name },
                    s.field,
                    t.qty
                );
            }
        }
        // Add every movement (all sources) to the same per-warehouse / per-product rows, and to a source-wise view.
        const sourceMap = new Map();
        for (const m of movementRows) {
            if (warehouseFilter !== null && !warehouseFilter.has(m.item_warehouse_id)) continue;
            if (productFilter !== null && m.item_product_id !== productFilter) continue;
            const qty = Number(m.item_qty) || 0;
            const field = isIn(m) ? "total_in" : "total_out";
            const seed = { warehouse_id: m.item_warehouse_id, warehouse_name: m.warehouse_name };
            bump(summaryMap, m.item_warehouse_id, seed, field, qty);
            bump(productMap, `${m.item_product_id}_${m.item_warehouse_id}`, { ...seed, product_id: m.item_product_id, product_name: m.item_product_name, product_code: m.item_product_code }, field, qty);
            bump(sourceMap, `${m.item_warehouse_id}_${sourceOf(m)}`, { ...seed, source: SOURCE_LABELS[sourceOf(m)] }, field, qty);
        }
        const finish = (list) =>
            list.map((e) => ({
                ...e,
                transfer_in: round(e.transfer_in),
                transfer_out: round(e.transfer_out),
                total_in: round(e.total_in),
                total_out: round(e.total_out),
                net: round(e.total_in - e.total_out),
            }));
        const byWarehouseThenName = (a, b) => String(a.warehouse_name).localeCompare(String(b.warehouse_name));
        const summary = finish([...summaryMap.values()]).sort(byWarehouseThenName);
        const productWise = finish([...productMap.values()]).sort(
            (a, b) => String(a.product_name).localeCompare(String(b.product_name)) || byWarehouseThenName(a, b)
        );
        const sourceWise = finish([...sourceMap.values()]).sort((a, b) => byWarehouseThenName(a, b) || String(a.source).localeCompare(String(b.source)));

        const totals = {
            transfer_in: round(summary.reduce((s, e) => s + e.transfer_in, 0)),
            transfer_out: round(summary.reduce((s, e) => s + e.transfer_out, 0)),
            total_in: round(summary.reduce((s, e) => s + e.total_in, 0)),
            total_out: round(summary.reduce((s, e) => s + e.total_out, 0)),
            net: round(summary.reduce((s, e) => s + e.net, 0)),
            transfer_count: new Set(filteredTransfers.map((t) => t.sr_by_number)).size,
        };

        return resSuccess({
            data: { summary, product_wise: productWise, source_wise: sourceWise, transfers: filteredTransfers, totals },
        });
    } catch (error) {
        console.log("getWarehouseTransferReport Error", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};
