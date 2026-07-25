import { Op, Sequelize } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { AdjustmentTypes } from "../../models/hr/adjustmentTypes.js";
import { compensationAdjustmentModel } from "../../models/hr/compensationAdjustmentModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const compensationAdjustmentInsert = async (req) => {
    try {
        const { employee_id, adjustment_type, hours_value, amount_value, apply_date, remark, a_application_login_id, type_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const compensationAdjustmentModelInstance = compensationAdjustmentModel(req.tenantDB);

        const insert = await compensationAdjustmentModelInstance.create(
            {
                type_id,
                employee_id,
                adjustment_type,
                hours: hours_value || 0,
                amount: amount_value || 0,
                apply_date,
                remark,
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id
            }
        );

        if (!insert) {
            return resError({
                ack_msg: "Added Failed",
            });
        }

        return resSuccess({
            ack_msg: "Added",
            developer_msg: "Added",
        });

    } catch (error) {
        console.log("compensationAdjustmentInsert Error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
}
export const compensationAdjustmentFetch = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const compensationAdjustmentModelInstance = compensationAdjustmentModel(req.tenantDB);
        const limit = Number(ll);
        const offset = Number(ul);
        const fetch = await compensationAdjustmentModelInstance.findAll(
            {
                where: { isDelete: 0 },
                raw: true,
                limit,
                offset,
                order: [["id", "DESC"]],
            }
        );

        if (!fetch) {
            return resError({
                ack_msg: "Get Failed",
            });
        }

        let activeTeamList;
        let activeTeamMap;

        activeTeamList = await loginModel.findAll(
            {
                where: {
                    id: {
                        [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
                      )`)
                    },
                    isDelete: 0
                },
                attributes: ["username", "id"],
                raw: true
            }
        );
        activeTeamMap = new Map(
            activeTeamList.map(user => [user.id, user.username])
        );

        const data = fetch.map((v) => {
            return {
                ...v,
                employee_name: activeTeamMap.get(Number(v.employee_id)) || null,
                created_name: activeTeamMap.get(Number(v.a_application_login_id)) || null
            }
        })

        return resSuccess({
            ack_msg: "Fetched",
            developer_msg: "Fetched",
            data: data
        });
    } catch (error) {
        console.log("compensationAdjustmentFetch Error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
}
export const compensationAdjustmentUpdate = async (req) => {
    try {
        const { employee_id, type_id, adjustment_type, hours_value, amount_value, apply_date, remark, a_application_login_id, editId } = req.body;

        const compensationAdjustmentModelInstance = compensationAdjustmentModel(req.tenantDB);

        const update = await compensationAdjustmentModelInstance.update(
            {
                type_id,
                employee_id,
                adjustment_type,
                hours: hours_value || 0,
                amount: amount_value || 0,
                apply_date,
                remark
            },
            {
                where: { isDelete: 0, id: editId }
            }
        );

        if (!update) {
            return resError({
                ack_msg: "Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Updated",
            developer_msg: "Updated",
        });
    } catch (error) {
        console.log("compensationAdjustmentUpdate Error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
}

export const compensationAdjustmentDelete = async (req) => {
    try {
        const { type_id } = req.body;

        const compensationAdjustmentModelInstance = compensationAdjustmentModel(req.tenantDB);

        const update = await compensationAdjustmentModelInstance.update(
            {
                isDelete: 1
            },
            {
                where: { isDelete: 0, id: type_id }
            }
        );

        if (!update) {
            return resError({
                ack_msg: "Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Updated",
            developer_msg: "Updated",
        });
    } catch (error) {
        console.log("compensationAdjustmentUpdate Error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
}

const ADJUSTMENT_METHOD = {
    1: 'AMOUNT',
    2: 'HOURS',
};

const ADJUSTMENT_MODE = {
    1: 'CREDIT',
    2: 'DEBIT',
};

export const adjustmentTypesFetch = async (req) => {
    try {
        const AdjustmentTypesInstance = AdjustmentTypes(req.tenantDB);
        const fetch = await AdjustmentTypesInstance.findAll({ where: { isDelete: 0 } });
        if (!fetch) {
            return resError({
                ack_msg: "Fetched Failed",
            });
        }
        const dataList = fetch.map((v) => {
            return {
                id: v.id,
                name: `${v.name}-${ADJUSTMENT_METHOD[v.method]}-${ADJUSTMENT_MODE[v.mode]}`
            }
        });
        return resSuccess({
            ack_msg: "success",
            data: dataList
        });
    } catch (error) {
        console.log("adjustmentTypesFetch Error", error);
        return resBadRequest({
            ack_msg: " ",
            developer_msg: `${error.message}`,
        });
    }
}