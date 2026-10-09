import { Op, Sequelize } from "sequelize";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { productionTransactionModel } from "../../models/production/productionTransactionModel.js";
import { bomVsProcessVsConsAndRejctsModel } from "../../models/product_settings/bomProcessVsConsAndRejctsModel.js";
import { bomVsProcessListsModel } from "../../models/product_settings/bomVsProcessListsModel.js";
import { processMastersModel } from "../../models/product_settings/processMastersModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { fetchItemStockBatch } from "./JobCardServices.js";

const MAX_DEPTH = 10;

// Open job cards (not fully produced yet) per product, for the products in
// [productIds]. Same rules as the job card screens: type 1 cards point at a
// cart item, types 2/3 straight at the product; "open" = produced qty below
// the card's qty. Returns Map(product_id -> [{ job_id, production_qty,
// produced_qty, pending_qty }]). Empty map on failure so the chart still loads.
const countOpenJobCards = async (req, productIds) => {
    const result = new Map();
    if (!productIds.size) return result;
    try {
        const cards = await JobCardsModel(req.tenantDB).findAll({
            where: { isDelete: 0 },
            attributes: ["id", "job_card_type", "item_id", "production_qty", "parent_job_card_id"],
            raw: true,
        });
        const cartItemIds = cards
            .filter((c) => ![2, 3].includes(Number(c.job_card_type) || 1))
            .map((c) => c.item_id)
            .filter(Boolean);
        const cartItems = cartItemIds.length
            ? await cartItemModel(req.tenantDB).findAll({
                where: { id: { [Op.in]: cartItemIds }, isDelete: 0 },
                attributes: ["id", "item_product_id", "item_qty"],
                raw: true,
            })
            : [];
        const cartItemMap = new Map(cartItems.map((ci) => [Number(ci.id), ci]));

        const forProducts = cards
            .map((c) => {
                const direct = [2, 3].includes(Number(c.job_card_type) || 1);
                const ci = direct ? null : cartItemMap.get(Number(c.item_id));
                return {
                    id: Number(c.id),
                    productId: Number(direct ? c.item_id : ci?.item_product_id) || null,
                    qty: Number(c.production_qty) || Number(ci?.item_qty) || 1,
                    parentJobCardId: Number(c.parent_job_card_id) || null,
                };
            })
            .filter((c) => c.productId && productIds.has(c.productId));
        if (!forProducts.length) return result;

        const produced = await productionTransactionModel(req.tenantDB).findAll({
            where: { isDelete: 0, job_id: { [Op.in]: forProducts.map((c) => c.id) } },
            attributes: ["job_id", [Sequelize.fn("SUM", Sequelize.col("production_qty")), "produced"]],
            group: ["job_id"],
            raw: true,
        });
        const producedMap = new Map(produced.map((p) => [Number(p.job_id), Number(p.produced) || 0]));
        forProducts.forEach((c) => {
            const producedQty = producedMap.get(c.id) || 0;
            if (producedQty >= c.qty) return;
            if (!result.has(c.productId)) result.set(c.productId, []);
            result.get(c.productId).push({
                job_id: c.id,
                parent_job_card_id: c.parentJobCardId, // set = a sub job card
                production_qty: c.qty,
                produced_qty: producedQty,
                pending_qty: c.qty - producedQty,
            });
        });
    } catch (error) {
        console.log("bomHierarchy countOpenJobCards Error", error);
    }
    return result;
};

// Explodes a finished product into its full multi-level BOM tree for a given
// production qty: product -> its consumption materials -> the materials of
// any of those that have a BOM of their own -> ... down to raw materials.
// Returns the tree (for the chart) plus two flat tables: every intermediate
// product to be made, and the raw materials needed in total with stock.
export const bomHierarchy = async (req) => {
    try {
        const { product_id, qty } = req.body;
        const rootQty = Number(qty);
        if (!product_id) {
            return resBadRequest({ ack_msg: "product_id is required", developer_msg: "missing product_id" });
        }
        if (!(rootQty > 0)) {
            return resBadRequest({ ack_msg: "Qty must be greater than 0", developer_msg: `invalid qty ${qty}` });
        }

        const BOMs = productBillOfMaterialModel(req.tenantDB);
        const BOMMaterials = bomVsProcessVsConsAndRejctsModel(req.tenantDB);

        // Same BOM pick as the job card screens: first live BOM per product.
        const bomCache = new Map(); // product_id -> { bom, materials } | null
        const loadBom = async (productId) => {
            if (bomCache.has(productId)) return bomCache.get(productId);
            const bom = await BOMs.findOne({
                where: { product_id: productId, isDelete: 0 },
                order: [["id", "ASC"]],
                raw: true,
            });
            let entry = null;
            if (bom) {
                const rows = await BOMMaterials.findAll({
                    where: { bom_id: bom.id, isDelete: 0 },
                    order: [["id", "ASC"]],
                    raw: true,
                });
                // Per-process time: required_time is in seconds for the BOM's
                // base qty, one row per process.
                const processRows = await bomVsProcessListsModel(req.tenantDB).findAll({
                    where: { bom_id: bom.id, isDelete: 0 },
                    order: [["id", "ASC"]],
                    raw: true,
                });
                const masters = processRows.length
                    ? await processMastersModel(req.tenantDB).findAll({
                        where: { id: { [Op.in]: [...new Set(processRows.map((p) => Number(p.process_id)))] } },
                        attributes: ["id", "process_name"],
                        raw: true,
                    })
                    : [];
                const nameMap = new Map(masters.map((pm) => [Number(pm.id), pm.process_name]));
                const processes = processRows.map((p) => ({
                    process_name: nameMap.get(Number(p.process_id)) || "Unknown Process",
                    seconds: Number(p.required_time) || 0,
                }));
                // Consumption only (type 1 / unset); rejection rows are not inputs.
                entry = { bom, processes, materials: rows.filter((m) => Number(m.type) === 1 || !m.type) };
            }
            bomCache.set(productId, entry);
            return entry;
        };

        const rootBom = await loadBom(Number(product_id));
        if (!rootBom) {
            return resError({
                ack_msg: "This product has no BOM",
                developer_msg: `no live BOM for product_id ${product_id}`,
            });
        }

        const nodes = []; // flat list of every node, for name lookup afterwards
        const build = async (productId, requiredQty, path, depth) => {
            const node = { product_id: productId, qty: requiredQty, has_bom: false, children: [] };
            nodes.push(node);
            const entry = await loadBom(productId);
            if (!entry) return node;
            node.has_bom = true;
            const bomQty = Number(entry.bom.qty) || 1;
            // This product's own process time for the qty needed (the BOM's
            // times are for bomQty units).
            node.processes = entry.processes.map((p) => ({
                process_name: p.process_name,
                seconds: (p.seconds / bomQty) * requiredQty,
            }));
            node.own_seconds = node.processes.reduce((s, p) => s + p.seconds, 0);
            if (depth >= MAX_DEPTH || path.has(productId)) {
                // Cycle or runaway depth: stop expanding, flag it.
                node.truncated = true;
                return node;
            }
            const nextPath = new Set(path).add(productId);
            for (const m of entry.materials) {
                const childId = Number(m.item_id);
                if (!childId) continue;
                const childQty = ((Number(m.qty) || 0) / bomQty) * requiredQty;
                node.children.push(await build(childId, childQty, nextPath, depth + 1));
            }
            return node;
        };
        const tree = await build(Number(product_id), rootQty, new Set(), 0);

        const productIds = [...new Set(nodes.map((n) => n.product_id))];
        const products = await productModel(req.tenantDB).findAll({
            where: { id: { [Op.in]: productIds } },
            attributes: ["id", "product_name", "product_code", "unit"],
            raw: true,
        });
        const productMap = new Map(products.map((p) => [Number(p.id), p]));
        const rawIds = [...new Set(nodes.filter((n) => !n.has_bom).map((n) => n.product_id))];
        const stockResult = rawIds.length ? await fetchItemStockBatch(req, rawIds) : null;
        const stockMap = stockResult?.stockMap || {};

        const openCardsByProduct = await countOpenJobCards(
            req,
            new Set(nodes.filter((n) => n.has_bom).map((n) => n.product_id)),
        );

        nodes.forEach((n) => {
            if (!n.has_bom) n.available_qty = Number(stockMap[n.product_id]) || 0;
            else n.open_job_cards = openCardsByProduct.get(n.product_id) || [];
            const p = productMap.get(n.product_id);
            n.product_name = p?.product_name || `Product ID ${n.product_id}`;
            n.product_code = p?.product_code || "";
            n.unit = p?.unit || "";
        });

        // Tables: aggregate by product (a product used in several branches
        // is summed). Root is excluded from "to make".
        const sumBy = (list) => {
            const map = new Map();
            list.forEach((n) => {
                const row = map.get(n.product_id) || {
                    product_id: n.product_id,
                    product_name: n.product_name,
                    product_code: n.product_code,
                    unit: n.unit,
                    required_qty: 0,
                    time_seconds: 0,
                };
                row.required_qty += n.qty;
                row.time_seconds += n.own_seconds || 0;
                map.set(n.product_id, row);
            });
            return [...map.values()];
        };
        const intermediate = sumBy(nodes.filter((n) => n.has_bom && n !== tree)).map((r) => ({
            ...r,
            open_job_cards: (openCardsByProduct.get(r.product_id) || []).length,
        }));
        const rawMaterials = sumBy(nodes.filter((n) => !n.has_bom)).map((r) => {
            const available = Number(stockMap[r.product_id]) || 0;
            return { ...r, available_qty: available, shortage_qty: Math.max(0, r.required_qty - available) };
        });

        return resSuccess({
            ack_msg: "BOM hierarchy fetched successfully",
            data: {
                tree,
                intermediate_products: intermediate,
                raw_materials: rawMaterials,
                // Sum of every product's own process time (root included) -
                // the total work time if each is done one after another.
                total_seconds: nodes.reduce((s, n) => s + (n.own_seconds || 0), 0),
            },
        });
    } catch (error) {
        console.log("bomHierarchy Error", error);
        return resError({ developer_msg: `error ${error.message || error}` });
    }
};
