import { AttendanceRoundoffRules } from "../../models/hr/AttendanceRoundoffRulesModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const roundOffGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const limit = Number(ll);
        const offset = Number(ul);

        const AttendanceRoundoffRulesInstance = AttendanceRoundoffRules(req.tenantDB);
        const result = await AttendanceRoundoffRulesInstance.findAll({
            where: { isDelete: "0", company_masters_id: findCompanyId.company_masters_id },
            attributes: [
                "id",
                "minutes",
                "conversion_minutes",
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
                ack_msg: "No Round Offs found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("roundOffGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const roundOffUpdate = async (req) => {
    try {
        const { a_application_login_id, minutes, conversion_minutes, id } = req.body;

        const AttendanceRoundoffRulesInstance = AttendanceRoundoffRules(req.tenantDB);

        const result = await AttendanceRoundoffRulesInstance.update(
            {
                minutes,
                conversion_minutes,
                a_application_login_id,
            },
            {
                where: { id: id, isDelete: "0" },
            }
        );

        if (!result) {
            return resError({
                ack_msg: "Round Off Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Round Off Updated",
            developer_msg: "Round Off Updated",
        });

    } catch (error) {
        console.log("roundOffUpdate Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}