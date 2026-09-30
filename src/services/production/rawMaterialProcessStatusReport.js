import { Op, Sequelize } from "sequelize";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { bomVsProcessVsConsAndRejctsModel } from "../../models/product_settings/bomProcessVsConsAndRejctsModel.js";
import { bomVsProcessListsModel } from "../../models/product_settings/bomVsProcessListsModel.js";
import { processMastersModel } from "../../models/product_settings/processMastersModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { productionTransactionModel } from "../../models/production/productionTransactionModel.js";
import { productionTransactionsItemsModel } from "../../models/production/productionTransactionsItemsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { fetchItemStockBatch } from "./JobCardServices.js";

// Ticket #2575: "select a finished product, see complete raw-material
// status" - the standalone-report counterpart to the per-job-card Raw
// Material Process Status table (JobCardServices.jobCardsDetails). Same
// required/sent/pending shape, but aggregated across ALL open (not fully
// produced) job cards for the chosen product instead of just one job card.
export const rawMaterialProcessStatusReport = async (req) => {
    try {
        const { product_id } = req.body;
        if (!product_id) {
            return resBadRequest({ ack_msg: "product_id is required" });
        }

        const bom = await productBillOfMaterialModel(req.tenantDB).findOne({
            where: { product_id, isDelete: 0 },
            order: [["id", "ASC"]],
            raw: true,
        });
        if (!bom) {
            return resSuccess({ ack_msg: "No BOM found for this product", data: { product_id: Number(product_id), open_job_cards: 0, processes: [] } });
        }

        // Pipeline order = row id ASC (no explicit sequence column; same
        // convention jobCardsDetails and fetchOtherOpenJobCardStock use).
        const processRows = await bomVsProcessListsModel(req.tenantDB).findAll({
            where: { bom_id: bom.id, isDelete: 0 },
            order: [["id", "ASC"]],
            raw: true,
        });
        if (!processRows.length) {
            return resSuccess({ ack_msg: "No processes found for this BOM", data: { product_id: Number(product_id), open_job_cards: 0, processes: [] } });
        }

        const processMasterIds = [...new Set(processRows.map((p) => Number(p.process_id)))];
        const processMasters = processMasterIds.length
            ? await processMastersModel(req.tenantDB).findAll({
                where: { id: { [Op.in]: processMasterIds } },
                attributes: ["id", "process_name"],
                raw: true,
            })
            : [];
        const processNameMap = new Map(processMasters.map((pm) => [Number(pm.id), pm.process_name]));

        // Consumption materials only (type 1 / unset) - rejection tolerances
        // aren't part of the raw-material pipeline status.
        const materials = await bomVsProcessVsConsAndRejctsModel(req.tenantDB).findAll({
            where: { bom_id: bom.id, isDelete: 0 },
            raw: true,
        });
        const consumptionMaterials = materials.filter((m) => Number(m.type) === 1 || !m.type);

        const itemIds = [...new Set(consumptionMaterials.map((m) => Number(m.item_id || m.material_id)))].filter(Boolean);
        const productInfoRows = itemIds.length
            ? await productModel(req.tenantDB).findAll({
                where: { id: { [Op.in]: itemIds }, isDelete: 0 },
                attributes: ["id", "product_name", "unit"],
                raw: true,
            })
            : [];
        const productInfoMap = new Map(productInfoRows.map((p) => [Number(p.id), p]));

        const stockBatchResult = await fetchItemStockBatch(req, itemIds);
        const stockMap = stockBatchResult?.stockMap || {};

        // All OPEN job cards (not fully produced) producing this product -
        // type 1 cards resolve their product via the cart item, types 2/3
        // point straight at the product (same resolution as JobCardServices).
        const allCards = await JobCardsModel(req.tenantDB).findAll({
            where: { isDelete: 0 },
            attributes: ["id", "job_card_type", "item_id", "production_qty"],
            raw: true,
        });
        const cartItemIds = allCards
            .filter((c) => ![2, 3].includes(Number(c.job_card_type) || 1))
            .map((c) => c.item_id)
            .filter(Boolean);
        const cartItems = cartItemIds.length
            ? await cartItemModel(req.tenantDB).findAll({
                where: { id: { [Op.in]: cartItemIds }, isDelete: 0 },
                attributes: ["id", "item_product_id"],
                raw: true,
            })
            : [];
        const cartItemMap = new Map(cartItems.map((ci) => [Number(ci.id), ci]));

        const cards = allCards
            .map((c) => {
                const direct = [2, 3].includes(Number(c.job_card_type) || 1);
                const ci = direct ? null : cartItemMap.get(Number(c.item_id));
                return {
                    id: Number(c.id),
                    productId: Number(direct ? c.item_id : ci?.item_product_id) || null,
                    qty: Number(c.production_qty) || 1,
                };
            })
            .filter((c) => c.productId === Number(product_id));

        if (!cards.length) {
            return resSuccess({ ack_msg: "No job cards for this product", data: { product_id: Number(product_id), open_job_cards: 0, processes: [] } });
        }

        const cardIds = cards.map((c) => c.id);
        const produced = await productionTransactionModel(req.tenantDB).findAll({
            where: { isDelete: 0, job_id: { [Op.in]: cardIds } },
            attributes: ["job_id", [Sequelize.fn("SUM", Sequelize.col("production_qty")), "produced"]],
            group: ["job_id"],
            raw: true,
        });
        const producedMap = new Map(produced.map((p) => [Number(p.job_id), Number(p.produced) || 0]));
        const openCards = cards.filter((c) => (producedMap.get(c.id) || 0) < c.qty);

        if (!openCards.length) {
            return resSuccess({ ack_msg: "No open job cards for this product", data: { product_id: Number(product_id), open_job_cards: 0, processes: [] } });
        }

        const openIds = openCards.map((c) => c.id);
        const totalQty = openCards.reduce((sum, c) => sum + c.qty, 0);

        const consumedRows = itemIds.length
            ? await productionTransactionsItemsModel(req.tenantDB).findAll({
                where: {
                    isDelete: 0,
                    entry_type: 2, // 2 = consumption
                    job_id: { [Op.in]: openIds },
                    item_id: { [Op.in]: itemIds },
                },
                attributes: ["item_id", "process_id", [Sequelize.fn("SUM", Sequelize.col("qty")), "consumed"]],
                group: ["item_id", "process_id"],
                raw: true,
            })
            : [];
        const consumedMap = new Map(consumedRows.map((r) => [`${r.item_id}:${r.process_id}`, Number(r.consumed) || 0]));

        const materialsByProcess = new Map();
        consumptionMaterials.forEach((m) => {
            const pId = Number(m.process_id);
            if (!materialsByProcess.has(pId)) materialsByProcess.set(pId, []);
            materialsByProcess.get(pId).push(m);
        });

        const bomQty = Number(bom.qty) || 1;
        const processes = processRows.map((proc) => {
            const pId = Number(proc.id);
            const rowsHere = materialsByProcess.get(pId) || [];
            const materialsOut = rowsHere.map((m) => {
                const mId = Number(m.item_id || m.material_id);
                const info = productInfoMap.get(mId);
                const requiredQty = ((Number(m.qty) || 0) / bomQty) * totalQty;
                const consumedQty = consumedMap.get(`${mId}:${pId}`) || 0;
                return {
                    material_id: mId,
                    material_name: info?.product_name || `Material ID ${mId}`,
                    unit: info?.unit || "",
                    available_qty: Number(stockMap[mId]) || 0,
                    required_qty: requiredQty,
                    consumed_qty: consumedQty,
                    pending_qty: requiredQty - consumedQty,
                };
            });
            return {
                process_id: pId,
                process_name: processNameMap.get(Number(proc.process_id)) || "Unknown Process",
                materials: materialsOut,
            };
        });

        return resSuccess({
            ack_msg: "Raw material process status fetched successfully",
            data: { product_id: Number(product_id), open_job_cards: openIds.length, processes },
        });
    } catch (error) {
        console.log("rawMaterialProcessStatusReport Error", error);
        return resError({ developer_msg: `error ${error.message || error}` });
    }
};
