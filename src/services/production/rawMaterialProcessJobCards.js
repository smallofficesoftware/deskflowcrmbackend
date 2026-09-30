import { Op, Sequelize } from "sequelize";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { productionTransactionModel } from "../../models/production/productionTransactionModel.js";
import { productionTransactionsItemsModel } from "../../models/production/productionTransactionsItemsModel.js";

// For a finished product, which OPEN (not fully produced) job cards have
// logged consumption at each BOM process - so a "N job cards" count shown
// per process can be clicked to see which job cards and their status.
// Returns { [process_id]: [{ job_id, status_name, status_color }] }.
export const fetchJobCardsPerProcess = async (req, productId, processIds) => {
    if (!productId || !processIds.length) return {};

    try {
        const JobCards = JobCardsModel(req.tenantDB);
        const CartItems = cartItemModel(req.tenantDB);
        const Productions = productionTransactionModel(req.tenantDB);
        const ProductionItems = productionTransactionsItemsModel(req.tenantDB);

        const allCards = await JobCards.findAll({
            where: { isDelete: 0 },
            attributes: {
                include: [
                    "id", "job_card_type", "item_id", "production_qty",
                    [
                        Sequelize.literal(
                            "(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = job_cards.status_id AND stage_status_masters.isDelete = 0)"
                        ),
                        "stage_status_name",
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = job_cards.status_id AND stage_status_masters.isDelete = 0)"
                        ),
                        "stage_status_color",
                    ],
                ],
            },
            raw: true,
        });
        if (!allCards.length) return {};

        // Type 1 cards point at a cart item (product fallback); types 2/3
        // point straight at the product - same resolution as job-card detail.
        const cartItemIds = allCards
            .filter((c) => ![2, 3].includes(Number(c.job_card_type) || 1))
            .map((c) => c.item_id)
            .filter(Boolean);
        const cartItems = cartItemIds.length
            ? await CartItems.findAll({
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
                    status_name: c.stage_status_name || "",
                    status_color: c.stage_status_color || "",
                };
            })
            .filter((c) => c.productId === Number(productId));
        if (!cards.length) return {};

        const cardIds = cards.map((c) => c.id);
        const produced = await Productions.findAll({
            where: { isDelete: 0, job_id: { [Op.in]: cardIds } },
            attributes: ["job_id", [Sequelize.fn("SUM", Sequelize.col("production_qty")), "produced"]],
            group: ["job_id"],
            raw: true,
        });
        const producedMap = new Map(produced.map((p) => [Number(p.job_id), Number(p.produced) || 0]));
        const openCards = cards.filter((c) => (producedMap.get(c.id) || 0) < c.qty);
        if (!openCards.length) return {};
        const openIds = openCards.map((c) => c.id);
        const openMap = new Map(openCards.map((c) => [c.id, c]));

        const rows = await ProductionItems.findAll({
            where: {
                isDelete: 0,
                entry_type: 2, // 2 = consumption
                job_id: { [Op.in]: openIds },
                process_id: { [Op.in]: processIds },
            },
            attributes: ["job_id", "process_id"],
            group: ["job_id", "process_id"],
            raw: true,
        });

        const byProcess = {};
        rows.forEach((r) => {
            const card = openMap.get(Number(r.job_id));
            if (!card) return;
            (byProcess[r.process_id] = byProcess[r.process_id] || []).push({
                job_id: card.id,
                status_name: card.status_name,
                status_color: card.status_color,
            });
        });
        return byProcess;
    } catch (error) {
        console.log("fetchJobCardsPerProcess Error", error);
        return {};
    }
};
