import { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { dayConversionModel } from "../../models/hr/dayConversionModel.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

export const adjustmentAdd = async (req) => {
    try {
        const {
            a_application_login_id,
            description,
            date,
            adjustment_date,
            employee_ids,
            type_of_holiday,
        } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const dayConversionModelInstance = dayConversionModel(req.tenantDB);

        const doExist = await dayConversionModelInstance.findAll({
            where: {
                date,
                employee_id: {
                    [Op.in]: employee_ids
                },
                isDelete: 0
            },
            attributes: ["id", "employee_id"],
            raw: true,
        });

        let existing = null;
        let final_emp_ids = employee_ids;

        if (doExist.length > 0) {
            const existingIds = doExist.map((ext) => ext.employee_id);

            existing = await loginModel.findAll({
                where: {
                    id: {
                        [Op.in]: existingIds,
                    },
                },
                attributes: ["username"],
                raw: true,
            })

            final_emp_ids = final_emp_ids.filter((id) => {
                return !existingIds.includes(id);
            })
        }

        if (existing && existing.length > 0 && final_emp_ids.length <= 0) {
            return resError({
                ack_msg: `Day Conversion for ${existing.map((ext) => ext.username).join(", ")} already exist for same date`
            });
        }

        final_emp_ids.forEach(async (id) => {
            const insert = await dayConversionModelInstance.create({
                date,
                description,
                adjustment_date,
                a_application_login_id,
                employee_id: id,
                type_of_holiday,
                company_masters_id: findCompanyId.company_masters_id,
            });

            if (!insert) {
                return resError({
                    ack_msg: "Day Conversion Adding Failed",
                });
            }
        })

        const ack_msg = (existing && existing.length > 0)
            ? `Day Conversion for ${existing.map((ext) => ext.username).join(", ")} already exist and added for remaining ones`
            : `${final_emp_ids.length > 1 ? "Day Conversions Added" : "Day Conversion Added"}`;

        return resSuccess({
            ack_msg: ack_msg,
            developer_msg: "Day Conversion Added",
        });

    } catch (error) {
        console.log("adjustmentAdd Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}

export const adjustmentGet = async (req) => {
    try {
        const { ul, ll, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const limit = Number(ll);
        const offset = Number(ul);

        const dayConversionModelInstance = dayConversionModel(req.tenantDB);

        const result = await dayConversionModelInstance.findAll({
            where: { isDelete: "0", company_masters_id: findCompanyId.company_masters_id },
            attributes: [
                "id",
                "description",
                "date",
                "adjustment_date",
                "type_of_holiday",
                "employee_id",
                "created_date_time",
            ],
            raw: true,
            limit,
            offset
        });

        let loginWhere = {
            isDelete: 0,
        };

        loginWhere.id = {
            [Op.in]: result.map((con) => con.employee_id),
        }

        const loginUsers =
            await loginModel.findAll({
                where: loginWhere,
                attributes: ["id", "username"],
                raw: true,
            });

        result.forEach((con) => {
            con.employee_name = loginUsers.find((emp) => emp.id == con.employee_id).username;
        })

        if (result) {
            return resSuccess({
                data: { item: result },
            });
        } else {
            return resError({
                ack_msg: "No Conversions found",
                developer_msg: "Data not found",
            });
        }
    } catch (error) {
        console.log("adjustmentGet Error", error);
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};

export const adjustmentUpdate = async (req) => {
    try {
        const { a_application_login_id, description, date, adjustment_date, employee_ids, type_of_holiday, id } = req.body;

        const dayConversionModelInstance = dayConversionModel(req.tenantDB);

        const isExist = await dayConversionModelInstance.findOne({
            where: { isDelete: 0, date, employee_id: employee_ids },
            raw: true,
        })

        if (isExist) {
            return resError({
                ack_msg: `Adjustment with the same date & same employee already exist`,
            });
        }

        const result = await dayConversionModelInstance.update(
            {
                description,
                date,
                adjustment_date,
                type_of_holiday,
                a_application_login_id,
                employee_id: employee_ids,
            },
            {
                where: { id: id, isDelete: "0" },
            }
        );

        if (!result) {
            return resError({
                ack_msg: "Adjustment Update Failed",
            });
        }

        return resSuccess({
            ack_msg: "Adjustment Updated",
            developer_msg: "Adjustment Updated",
        });

    } catch (error) {
        console.log("adjustmentUpdate Error", error);
        return resBadRequest({
            ack_msg: "",
            developer_msg: `${error.message}`,
        });
    }
}