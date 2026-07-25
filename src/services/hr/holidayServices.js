import { holidayModel } from "../../models/hr/holidayModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const holidayAdd = async (req) => {
    try {
        const { a_application_login_id, holiday_date, holiday_remark } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const holidayModelInstance = holidayModel(req.tenantDB);

        const insert = await holidayModelInstance.create(
            {
                holiday_date,
                holiday_remark,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Holiday Adding Failed",
            });
        }

        return resSuccess({
            ack_msg: "Holiday Added",
            developer_msg: "Holiday Added",
        });

    } catch (error) {
        console.log("holidayAdd Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const holidayUpdate = async (req) => {
    try {
        const { a_application_login_id, holiday_date, holiday_remark, id } = req.body;

        const holidayModelInstance = holidayModel(req.tenantDB);

        const result = await holidayModelInstance.update(
            {
                holiday_date,
                holiday_remark,
                a_application_login_id,
            },
            {
                where: { id: id, isDelete: "0" },
            }
        );

        if (!result) {
            return resError({
                ack_msg: "Holiday Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Holiday Updated",
            developer_msg: "Holiday Updated",
        });

    } catch (error) {
        console.log("holidayUpdate Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const holidayGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const limit = Number(ll);
        const offset = Number(ul);

        const holidayModelInstance = holidayModel(req.tenantDB);
        const result = await holidayModelInstance.findAll({
            where: { isDelete: "0", company_masters_id: findCompanyId.company_masters_id },
            attributes: [
                "id",
                "holiday_date",
                "holiday_remark",
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
                ack_msg: "No Holidays found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("holidayGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};