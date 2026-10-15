import { Op, Sequelize } from "sequelize";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { productionTransactionModel } from "../../models/production/productionTransactionModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// The sub job card tree a job card belongs to: goes up to the top job card
// (the one with no parent) and returns it with every sub job card below it,
// level by level, each with its product, qty and progress. The card asked for
// is flagged so the screen can highlight it.
export const subJobCardTree = async (req) => {
    try {
        const { id } = req.body;
        if (!id) {
            return resBadRequest({ ack_msg: "id is required", developer_msg: "missing id" });
        }
        const tenantDB = req.tenantDB;

        const cards = await JobCardsModel(tenantDB).findAll({
            where: { isDelete: 0 },
            attributes: ["id", "job_card_type", "item_id", "production_qty", "parent_job_card_id"],
            raw: true,
        });
        const byId = new Map(cards.map((c) => [Number(c.id), c]));
        if (!byId.has(Number(id))) {
            return resError({ ack_msg: "Job card not found", developer_msg: `no job card for id ${id}` });
        }

        // Top of the tree (guard against a bad parent loop).
        let rootId = Number(id);
        const seen = new Set();
        while (byId.get(rootId)?.parent_job_card_id && !seen.has(rootId)) {
            seen.add(rootId);
            const parentId = Number(byId.get(rootId).parent_job_card_id);
            if (!byId.has(parentId)) break;
            rootId = parentId;
        }

        const childrenOf = new Map();
        cards.forEach((c) => {
            const p = Number(c.parent_job_card_id) || 0;
            if (!p) return;
            if (!childrenOf.has(p)) childrenOf.set(p, []);
            childrenOf.get(p).push(Number(c.id));
        });

        // Cards in the tree, parents before children.
        const treeIds = [];
        const visit = (cardId, depth) => {
            if (treeIds.includes(cardId) || depth > 20) return;
            treeIds.push(cardId);
            (childrenOf.get(cardId) || []).forEach((childId) => visit(childId, depth + 1));
        };
        visit(rootId, 0);

        // Product of each card: types 2/3 point at the product, type 1 at a
        // cart item.
        const treeCards = treeIds.map((cid) => byId.get(cid));
        const cartItemIds = treeCards
            .filter((c) => ![2, 3].includes(Number(c.job_card_type) || 1))
            .map((c) => c.item_id)
            .filter(Boolean);
        const cartItems = cartItemIds.length
            ? await cartItemModel(tenantDB).findAll({
                where: { id: { [Op.in]: cartItemIds }, isDelete: 0 },
                attributes: ["id", "item_product_id", "item_qty"],
                raw: true,
            })
            : [];
        const cartItemMap = new Map(cartItems.map((ci) => [Number(ci.id), ci]));
        const info = new Map(treeCards.map((c) => {
            const direct = [2, 3].includes(Number(c.job_card_type) || 1);
            const ci = direct ? null : cartItemMap.get(Number(c.item_id));
            return [Number(c.id), {
                productId: Number(direct ? c.item_id : ci?.item_product_id) || null,
                qty: Number(c.production_qty) || Number(ci?.item_qty) || 0,
            }];
        }));

        const productIds = [...new Set([...info.values()].map((v) => v.productId).filter(Boolean))];
        const products = productIds.length
            ? await productModel(tenantDB).findAll({
                where: { id: { [Op.in]: productIds } },
                attributes: ["id", "product_name", "product_code", "unit"],
                raw: true,
            })
            : [];
        const productMap = new Map(products.map((p) => [Number(p.id), p]));

        const produced = await productionTransactionModel(tenantDB).findAll({
            where: { isDelete: 0, job_id: { [Op.in]: treeIds } },
            attributes: ["job_id", [Sequelize.fn("SUM", Sequelize.col("production_qty")), "produced"]],
            group: ["job_id"],
            raw: true,
        });
        const producedMap = new Map(produced.map((p) => [Number(p.job_id), Number(p.produced) || 0]));

        const build = (cid) => {
            const i = info.get(cid);
            const p = productMap.get(i.productId);
            const producedQty = producedMap.get(cid) || 0;
            return {
                job_id: cid,
                is_current: cid === Number(id),
                product_id: i.productId,
                product_name: p?.product_name || `Product ID ${i.productId}`,
                product_code: p?.product_code || "",
                unit: p?.unit || "",
                qty: i.qty,
                produced_qty: producedQty,
                pending_qty: Math.max(0, i.qty - producedQty),
                is_done: i.qty > 0 && producedQty >= i.qty,
                children: (childrenOf.get(cid) || []).filter((x) => info.has(x)).map(build),
            };
        };

        return resSuccess({
            ack_msg: "Sub job card tree fetched successfully",
            data: { tree: build(rootId), total_cards: treeIds.length },
        });
    } catch (error) {
        console.log("subJobCardTree Error", error);
        return resError({ developer_msg: `error ${error.message || error}` });
    }
};
