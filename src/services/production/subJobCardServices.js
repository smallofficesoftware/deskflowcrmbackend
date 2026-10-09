import { Op, Sequelize } from "sequelize";
import { productionTransactionModel } from "../../models/production/productionTransactionModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { JobCardsModel } from "../../models/production/JobCardsModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { jobCardsSave } from "./JobCardServices.js";

// Auto-creates a NEW job card (job_card_type = 2, direct product) for a raw
// material that is itself a manufactured product with its own BOM, and
// explicitly links it back to the parent job card / material row it
// fulfils. Reuses jobCardsSave's existing create/validate logic rather than
// duplicating it - only the link columns are set afterward.
export const createSubJobCard = async (req) => {
    try {
        const { parent_job_card_id, material_id, production_qty } = req.body;

        if (!parent_job_card_id || !material_id) {
            return resBadRequest({
                ack_msg: "parent_job_card_id and material_id are required",
                developer_msg: "missing parent_job_card_id / material_id",
            });
        }

        if (!(Number(production_qty) > 0)) {
            return resBadRequest({
                ack_msg: "Production qty must be greater than 0",
                developer_msg: `invalid production_qty ${production_qty}`,
            });
        }

        const JobCardsModelInstance = JobCardsModel(req.tenantDB);

        const parentCard = await JobCardsModelInstance.findOne({
            where: { id: parent_job_card_id, isDelete: 0 },
            raw: true,
        });
        if (!parentCard) {
            return resError({
                ack_msg: "Parent job card not found",
                developer_msg: `no job card for id ${parent_job_card_id}`,
            });
        }

        const bom = await productBillOfMaterialModel(req.tenantDB).findOne({
            where: { product_id: material_id, isDelete: 0 },
            raw: true,
        });
        if (!bom) {
            return resError({
                ack_msg: "This material has no BOM of its own - it cannot have a sub jobwork.",
                developer_msg: `no live BOM for product_id ${material_id}`,
            });
        }

        // One open sub job card per parent + material. "Open" = not fully
        // produced yet (same rule as the job card details screen).
        const existing = await JobCardsModelInstance.findAll({
            where: { parent_job_card_id: parentCard.id, parent_material_id: material_id, isDelete: 0 },
            attributes: ["id", "production_qty"],
            raw: true,
        });
        if (existing.length) {
            const produced = await productionTransactionModel(req.tenantDB).findAll({
                where: { isDelete: 0, job_id: { [Op.in]: existing.map((c) => c.id) } },
                attributes: ["job_id", [Sequelize.fn("SUM", Sequelize.col("production_qty")), "produced"]],
                group: ["job_id"],
                raw: true,
            });
            const producedMap = new Map(produced.map((p) => [Number(p.job_id), Number(p.produced) || 0]));
            const open = existing.find((c) => (producedMap.get(Number(c.id)) || 0) < Number(c.production_qty));
            if (open) {
                return resError({
                    ack_msg: `A sub job card (#${open.id}) for this material is already open.`,
                    developer_msg: `open sub job card ${open.id} exists for parent ${parentCard.id} material ${material_id}`,
                });
            }
        }

        // job_card_type 2 = direct product; item_id = the material's own
        // product id. Reuse jobCardsSave's create path unchanged.
        req.body.job_card_type = 2;
        req.body.item_id = material_id;
        req.body.product_qty = production_qty;
        const saveResult = await jobCardsSave(req);
        if (!saveResult || saveResult.ack !== 1 || !saveResult.data?.id) {
            return saveResult;
        }

        try {
            await JobCardsModelInstance.update(
                { parent_job_card_id: parentCard.id, parent_material_id: material_id },
                { where: { id: saveResult.data.id } },
            );
        } catch (linkError) {
            // Don't leave an unlinked orphan card behind.
            await JobCardsModelInstance.update({ isDelete: 1 }, { where: { id: saveResult.data.id } });
            throw linkError;
        }

        return resSuccess({
            ack_msg: "Sub job card created and linked to parent.",
            data: { id: saveResult.data.id, parent_job_card_id: parentCard.id, parent_material_id: material_id },
        });
    } catch (error) {
        console.log("createSubJobCard Error", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: `error ${error.message || error}`,
        });
    }
};
