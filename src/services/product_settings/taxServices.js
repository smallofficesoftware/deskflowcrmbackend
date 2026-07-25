import { taxModel } from "../../models/product_settings/taxModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const taxAdd = async (req) => {
    try {
        const { a_application_login_id, name, value } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const taxModelInstance = taxModel(req.tenantDB);

        const doesExist = await taxModelInstance.findOne({
            where: { isDelete: 0, name },
            attributes: ["id"],
            raw: true,
        });

        if (doesExist) {
            return resError({
                ack_msg: "Tax Already Exist",
            });
        }

        const insert = await taxModelInstance.create(
            {
                name,
                value,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Tax Adding Failed",
            });
        }

        return resSuccess({
            ack_msg: "Tax Added",
            developer_msg: "Tax Added",
        });

    } catch (error) {
        console.log("taxAdd Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
};

export const taxUpdate = async (req) => {
    try {
        const { a_application_login_id, name, value, id } = req.body;

        const taxModelInstance = taxModel(req.tenantDB);

        const result = await taxModelInstance.update(
            {
                name,
                value,
                a_application_login_id,
            },
            {
                where: { id: id, isDelete: "0" },
            }
        );

        if (!result) {
            return resError({
                ack_msg: "Tax Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Tax Updated",
            developer_msg: "Tax Updated",
        });

    } catch (error) {
        console.log("taxUpdate Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const taxGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const limit = Number(ll);
        const offset = Number(ul);

        const taxModelInstance = taxModel(req.tenantDB);
        const result = await taxModelInstance.findAll({
            where: {
                isDelete: "0",
            },
            attributes: [
                "id",
                "name",
                "value",
                "created_date_time",
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
                ack_msg: "No Taxes found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("taxGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};