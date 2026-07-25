import { lockcontrolModel } from "../../models/hr/lockcontrolModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const lockcontrolAdd = async (req) => {
    try {
        const { a_application_login_id, month, year } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const lockcontrolModelInstance = lockcontrolModel(req.tenantDB);

        const duplicateCheck = await lockcontrolModelInstance.findOne({
            where: {
                month: month,
                year: year,
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0
            }
        });

        if (duplicateCheck) {
            return resError({
                ack_msg: "Name already available",
            });
        }

        const insert = await lockcontrolModelInstance.create(
            {
                month,
                year,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Lock Control Adding Failed",
            });
        }

        return resSuccess({
            ack_msg: "Lock Control Added",
            developer_msg: "Lock Control Added",
        });

    } catch (error) {
        console.log("lockcontrolAdd Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
};

export const lockcontrolGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const limit = Number(ll);
        const offset = Number(ul);

        const lockcontrolModelInstance = lockcontrolModel(req.tenantDB);
        const result = await lockcontrolModelInstance.findAll({
            where: { isDelete: "0", company_masters_id: findCompanyId.company_masters_id },
            attributes: [
                "id",
                "month",
                "year",
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
                ack_msg: "No Lock Control found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("lockcontrolGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};
