import { Op } from "sequelize";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";

// Which of these material product ids have their OWN live BOM (i.e. are
// themselves a manufactured product, not a raw-bought item) - drives the
// "has_own_bom" flag so the UI can offer "Generate Sub Job Card" only where
// it's actually possible. Returns a Set<number> of product ids.
export const fetchMaterialsWithOwnBom = async (req, materialIds) => {
    if (!materialIds.length) return new Set();
    try {
        const boms = await productBillOfMaterialModel(req.tenantDB).findAll({
            where: { product_id: { [Op.in]: materialIds }, isDelete: 0 },
            attributes: ["product_id"],
            raw: true,
        });
        return new Set(boms.map((b) => Number(b.product_id)));
    } catch (error) {
        console.log("fetchMaterialsWithOwnBom Error", error);
        return new Set();
    }
};
