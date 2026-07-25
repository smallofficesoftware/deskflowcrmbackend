import { Op } from "sequelize";
import { productModel } from "../../models/product_settings/productModel.js";
import { productUnitMasterModel } from "../../models/product_settings/productUnitMasterModel.js";
import {
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const getAllProduct = async (req) => {
    try {
        const { a_application_login_id } = req.body;

        // Get company from login id
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const ProUnitModel = productUnitMasterModel(req.tenantDB);

        const productUnits = await ProUnitModel.findAll({
            where: {
                // company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
                isActive: 1,
            },
            order: [["id", "ASC"]],
            raw: true,
        });

        if (!productUnits || productUnits.length === 0) {
            return resError({
                ack_msg: "No product units found",
                data: [],
            });
        }

        return resSuccess({
            ack_msg: "Product units fetched successfully",
            data: productUnits,
        });

    } catch (e) {
        console.error("getAllProduct error:", e);
        return resBadRequest({
            developer_msg: `error ${e.message || e}`,
        });
    }
};



export const productUnitDeleteAll = async (req) => {
    try {
        const { unit_id, a_application_login_id } = req.body;

        if (!a_application_login_id || !unit_id) {
            return resError({
                ack_msg: "Application login ID and Unit are required",
            });
        }

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        if (!findCompanyId || !findCompanyId.company_masters_id) {
            return resError({
                ack_msg: "Invalid application login ID",
            });
        }

        const productModels = productModel(req.tenantDB);
        const unitModels = productUnitMasterModel(req.tenantDB);

        const unitIds = typeof unit_id === "string" && unit_id.includes(",")
            ? unit_id.split(",").map(Number).filter(id => !isNaN(id))
            : [Number(unit_id)];

        if (unitIds.length === 0) {
            return resError({
                ack_msg: "Invalid Unit ID format",
            });
        }

        const products = await productModels.findAll({
            where: {
                isDelete: 0,
                company_masters_id: findCompanyId.company_masters_id,
                unit_id: { [Op.in]: unitIds },
            },
        });
        if (products.length > 0) {
            return resError({
                ack_msg: "This Unit cannot be deleted as Product have already been created under it."
            });
        }

        const [rowsUpdated] = await unitModels.update(
            {
                isDelete: 1,
            },
            {
                where: {
                    isDelete: 0,
                    id: { [Op.in]: unitIds },
                },
            }
        );

        if (rowsUpdated === 0) {
            return resError({
                ack_msg: "No Unit found or already deleted",
            });
        }

        return resSuccess({
            ack_msg: unitIds.length > 1 ? "Unit Deleted Successfully" : "Unit Deleted Successfully",
            data: { item: rowsUpdated },
        });

    }
    catch (e) {
        console.log(e);
        resError({
            developer_msg: e
        })

    }
}