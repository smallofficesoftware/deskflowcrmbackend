import { AdjustmentTypes } from "../../models/hr/adjustmentTypes.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const adjustmentTypesGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const limit = Number(ll);
        const offset = Number(ul);

        const AdjustmentTypesInstance = AdjustmentTypes(req.tenantDB);
        const result = await AdjustmentTypesInstance.findAll({
            where: { isDelete: "0", company_masters_id: findCompanyId.company_masters_id },
            attributes: [
                "id",
                "method",
                "mode",
                "name",
                "knowledge_info",
            ],
            raw: true,
            limit,
            offset
        });

        if (result) {
            return resSuccess({
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "No adjustment types found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("adjustmentTypesGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const adjustmentTypesAdd = async (req) => {
    try {
        const { a_application_login_id, method, mode, name, knowledge_info } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const AdjustmentTypesInstance = AdjustmentTypes(req.tenantDB);

        const insert = await AdjustmentTypesInstance.create(
            {
                method,
                mode,
                name,
                knowledge_info,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Adjustment Type Adding Failed",
            });
        }

        return resSuccess({
            ack_msg: "Adjustment Type Added",
            developer_msg: "Adjustment Type Added",
        });

    } catch (error) {
        console.log("adjustmentTypesAdd Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const adjustmentTypesUpdate = async (req) => {
    try {
        const { a_application_login_id, method, mode, name, knowledge_info, id } = req.body;

        const AdjustmentTypesInstance = AdjustmentTypes(req.tenantDB);

        const result = await AdjustmentTypesInstance.update(
            {
                method,
                mode,
                name,
                knowledge_info,
                a_application_login_id,
            },
            {
                where: { id: id, isDelete: "0" },
            }
        );

        if (!result) {
            return resError({
                ack_msg: "adjustment Types Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "adjustment Types Updated",
            developer_msg: "adjustment Types Updated",
        });

    } catch (error) {
        console.log("adjustmentTypesUpdate Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}