import { Op } from "sequelize";
import { productModel } from "../../models/product_settings/productModel.js";
import { cartItemModel } from "../../models/activities/cartItemsModel.js";
import { bomVsProcessVsConsAndRejctsModel } from "../../models/product_settings/bomProcessVsConsAndRejctsModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { fetchItemStockBatch, fetchOtherOpenJobCardStock } from "./JobCardServices.js";
import { createSubJobCard } from "./subJobCardServices.js";

const MAX_DEPTH = 10;

// Creates the whole sub job card tree under a job card in one go: every
// consumption material that is ticked "requires sub job card" and has a BOM of
// its own gets a sub job card, and then the same is done under each new sub
// job card, level by level, down to the raw materials. Each card is made by
// createSubJobCard, so the per-card rules (BOM check, duplicate guard, linking
// to the parent) are the same as clicking "Generate Sub Job Card" by hand.
// Safe to call again: materials that already have an open sub job card are
// skipped and reported.
export const createAllSubJobCards = async (req) => {
    try {
        const { parent_job_card_id, a_application_login_id, preview } = req.body;
        const tenantDB = req.tenantDB;

        // preview = true: nothing is created. The job card does not exist yet
        // (the create screen asks for confirmation first), so the card to be
        // is described by { job_card_type, item_id, product_qty } instead of
        // an id, and the response lists the sub job cards that would be made.
        let parent = null;
        let jobCardType;
        let itemId;
        let qty;
        if (preview) {
            jobCardType = Number(req.body.job_card_type) || 1;
            itemId = req.body.item_id;
            qty = Number(req.body.product_qty) || 0;
            if (!itemId) {
                return resBadRequest({ ack_msg: "item_id is required", developer_msg: "missing item_id" });
            }
        } else {
            if (!parent_job_card_id) {
                return resBadRequest({
                    ack_msg: "parent_job_card_id is required",
                    developer_msg: "missing parent_job_card_id",
                });
            }
            parent = await JobCardsModel(tenantDB).findOne({
                where: { id: parent_job_card_id, isDelete: 0 },
                raw: true,
            });
            if (!parent) {
                return resError({
                    ack_msg: "Parent job card not found",
                    developer_msg: `no job card for id ${parent_job_card_id}`,
                });
            }
            jobCardType = Number(parent.job_card_type) || 1;
            itemId = parent.item_id;
            qty = Number(parent.production_qty) || 0;
        }

        // Types 2/3 point straight at the product; type 1 at a cart item.
        const direct = [2, 3].includes(jobCardType);
        let productId = Number(itemId) || null;
        if (!direct) {
            const ci = await cartItemModel(tenantDB).findOne({
                where: { id: itemId, isDelete: 0 },
                attributes: ["item_product_id", "item_qty"],
                raw: true,
            });
            productId = Number(ci?.item_product_id) || null;
            qty = qty || Number(ci?.item_qty) || 0;
        }
        if (!productId || !(qty > 0)) {
            return resError({
                ack_msg: "Could not work out the product / qty of this job card",
                developer_msg: `productId ${productId} qty ${qty}`,
            });
        }

        const BOMs = productBillOfMaterialModel(tenantDB);
        const BOMMaterials = bomVsProcessVsConsAndRejctsModel(tenantDB);
        const created = [];
        const skipped = [];

        // How much each sub job card produces:
        //  "required"                 - the full qty the parent needs
        //  "available"                - required minus the stock on hand
        //  "available_minus_reserved" - required minus (stock - what other open
        //                               job cards still need); the default
        const qtyBasis = ["required", "available", "available_minus_reserved"].includes(req.body.qty_basis)
            ? req.body.qty_basis
            : "available_minus_reserved";

        const walk = async (jobCardId, prodId, prodQty, level) => {
            if (level > MAX_DEPTH) return;
            const bom = await BOMs.findOne({
                where: { product_id: prodId, isDelete: 0 },
                order: [["id", "ASC"]],
                raw: true,
            });
            if (!bom) return;
            const bomQty = Number(bom.qty) || 1;
            const rows = await BOMMaterials.findAll({
                where: { bom_id: bom.id, isDelete: 0 },
                order: [["id", "ASC"]],
                raw: true,
            });
            const eligible = rows.filter(
                (m) => (Number(m.type) === 1 || !m.type) && Number(m.requires_sub_job_card) && Number(m.item_id),
            );
            if (!eligible.length) return;

            // Stock and what other open job cards reserve, for the materials of
            // this level - only needed when the qty is not simply "required".
            let stockMap = {};
            let reservedMap = {};
            if (qtyBasis !== "required") {
                const ids = [...new Set(eligible.map((m) => Number(m.item_id)))];
                stockMap = (await fetchItemStockBatch({ tenantDB }, ids))?.stockMap || {};
                if (qtyBasis === "available_minus_reserved") {
                    reservedMap = (await fetchOtherOpenJobCardStock({ tenantDB }, { id: jobCardId || 0 }, ids))?.reserved || {};
                }
            }

            for (const m of eligible) {
                const materialId = Number(m.item_id);
                const requiredQty = ((Number(m.qty) || 0) / bomQty) * prodQty;
                if (!(requiredQty > 0)) continue;

                // Qty to make: all of it, or only what stock does not cover.
                const available = Number(stockMap[materialId]) || 0;
                const reserved = Number(reservedMap[materialId]) || 0;
                const free = qtyBasis === "required" ? 0 : Math.max(0, qtyBasis === "available" ? available : available - reserved);
                const childQty = requiredQty - free;
                const detail = { required_qty: requiredQty, available_qty: available, reserved_qty: reserved };

                if (!(childQty > 0)) {
                    // Stock covers it: no sub job card (and nothing below it).
                    skipped.push({ parent_job_card_id: jobCardId, product_id: materialId, level, covered: true, ...detail, qty: 0 });
                    continue;
                }

                if (preview) {
                    // Only if it would really get a card: it needs a BOM of its own.
                    const ownBom = await BOMs.findOne({
                        where: { product_id: materialId, isDelete: 0 },
                        attributes: ["id"],
                        raw: true,
                    });
                    if (!ownBom) continue;
                    created.push({ id: null, parent_job_card_id: jobCardId, product_id: materialId, qty: childQty, level, ...detail });
                    await walk(null, materialId, childQty, level + 1);
                    continue;
                }

                // Fresh request per card: createSubJobCard rewrites req.body.
                const result = await createSubJobCard({
                    tenantDB,
                    body: {
                        a_application_login_id,
                        parent_job_card_id: jobCardId,
                        material_id: materialId,
                        production_qty: childQty,
                    },
                });
                if (result?.ack === 1 && result.data?.id) {
                    created.push({
                        id: result.data.id,
                        parent_job_card_id: jobCardId,
                        product_id: materialId,
                        qty: childQty,
                        level,
                        ...detail,
                    });
                    await walk(result.data.id, materialId, childQty, level + 1);
                } else {
                    // e.g. no BOM of its own, or an open sub card already exists.
                    skipped.push({
                        parent_job_card_id: jobCardId,
                        product_id: materialId,
                        reason: result?.ack_msg || "not created",
                    });
                }
            }
        };

        await walk(parent ? Number(parent.id) : null, productId, qty, 1);

        if (preview) {
            // Materials stock already covers are listed too (nothing created).
            const covered = skipped.filter((s) => s.covered);
            const ids = [...new Set([productId, ...created.map((c) => c.product_id), ...covered.map((c) => c.product_id)])];
            const products = await productModel(tenantDB).findAll({
                where: { id: { [Op.in]: ids } },
                attributes: ["id", "product_name", "unit"],
                raw: true,
            });
            const byId = new Map(products.map((p) => [Number(p.id), p]));
            return resSuccess({
                ack_msg: "Sub job cards that would be created",
                data: {
                    product_name: byId.get(productId)?.product_name || "",
                    qty,
                    qty_basis: qtyBasis,
                    planned: [...created, ...covered].map((c) => ({
                        ...c,
                        covered: !!c.covered,
                        product_name: byId.get(c.product_id)?.product_name || `Product ID ${c.product_id}`,
                        unit: byId.get(c.product_id)?.unit || "",
                    })),
                },
            });
        }

        return resSuccess({
            ack_msg: created.length
                ? `${created.length} sub job card${created.length > 1 ? "s" : ""} created.`
                : "No sub job cards needed.",
            data: { created, skipped },
        });
    } catch (error) {
        console.log("createAllSubJobCards Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};
