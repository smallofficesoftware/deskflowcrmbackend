import { Op, Sequelize } from "sequelize";
import loginModel from "../../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import { salaryRegisterModel } from "../../../models/hr/salaryRegisterModel.js";
import { getCompanyByLoginId } from "../../../services/commonServices.js";
import { resBadRequest, resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const salaryRegistrationGet = async (req) => {
    const selectedTeamMembers = req.body.selectedTeamMembers || [];
    const selectedDayMonthYear = req.body.selectedDayMonthYear || [];
    const { ll, // offset (number)
        ul, // limit (number)
    } = req.body

    const offset = ul;
    const limit = ll;

    try {
        const salaryRegisterModelInstance = salaryRegisterModel(req.tenantDB);

        const findCompanyId = await getCompanyByLoginId(
            req.body.a_application_login_id
        );

        let whereClause = {
            isDelete: 0,
        };

        if (selectedTeamMembers.length > 0) {
            whereClause.a_application_login_id = {
                [Op.in]: selectedTeamMembers,
            };
        } else {
            whereClause.company_masters_id = findCompanyId.company_masters_id
        }

        const companyVsApplicationLoginResult =
            await companyVsApplicationLoginModel.findAll({
                where: whereClause,
                attributes: [
                    "a_application_login_id",
                    [
                        Sequelize.literal(`(
                            SELECT a_application_logins.id
                            FROM a_application_logins
                            WHERE a_application_logins.id = company_vs_application_logins.a_application_login_id
                            AND a_application_logins.isDelete = 0
                            LIMIT 1
                        )`),
                        "employee_id"
                    ],
                    [
                        Sequelize.literal(`(
                            SELECT a_application_logins.username
                            FROM a_application_logins
                            WHERE a_application_logins.id = company_vs_application_logins.a_application_login_id
                            AND a_application_logins.isDelete = 0
                            LIMIT 1
                        )`),
                        "username"
                    ],
                ]
            });

        let loginWhere = {
            isDelete: 0,
        };

        loginWhere.id = {
            [Op.in]: companyVsApplicationLoginResult.map((emp) => emp.dataValues.employee_id),
        }

        const loginModalResult = await loginModel.findAll({
            where: loginWhere,
            attributes: [
                "id",
                "recovery_mobile",
                "aadhar_card_number",
                "pan_card_number"
            ],
            raw: true,
        })

        const salaryRegisterWhere = {
            isDelete: 0,
        }

        salaryRegisterWhere.employee_id = {
            [Op.in]: companyVsApplicationLoginResult.map((emp) => emp.dataValues.employee_id),
        }

        if (selectedDayMonthYear.length === 3) {
            const [day, month, year] = selectedDayMonthYear;

            salaryRegisterWhere.year = year;
            salaryRegisterWhere.month = month;

        } else if (selectedDayMonthYear.length === 2) {
            const [month, year] = selectedDayMonthYear;

            salaryRegisterWhere.year = year;
            salaryRegisterWhere.month = month;
        }

        const finalSalaryRegisterWhere = {
            ...salaryRegisterWhere,
        }

        const result = await salaryRegisterModelInstance.findAll({
            where: finalSalaryRegisterWhere,
            attributes: [
                "id",
                "year",
                "month",
                "employee_id",
                "added_date",
                "total_present_day",
                "half_day",
                "holiday",
                "total_week_off",
                "total_leave",
                "total_absent",
                "total_day",
                "working_hour",
                "ctc",
                "gross_salary",
                "per_day_salary",
                "fxs_basic",
                "fxs_hra",
                "fxs_other",
                "fxs_total_earning",
                "dws_basic",
                "dws_hra",
                "dws_other",
                "dws_total_earning",
                "earn_ot_hours",
                "earn_ot_payable_amt",
                "regular_ot_hours",
                "extra_ot_hours",
                "regular_ot_payable_amt",
                "extra_ot_payable_amt",
                "earn_head_first",
                "earn_head_second",
                "earn_head_third",
                "bonus_amount",
                "earn_sub_total",
                "total_earning",
                "ded_emp_pf",
                "ded_pradhan_mantri_pf",
                "ded_esi_employee",
                "ded_esi_company",
                "ded_pt",
                "ded_insurance",
                "ded_first",
                "ded_second",
                "ded_third",
                "total_deduction",
                "net_bank_pay",
            ],
            raw: true,
            offset,
            limit
        })

        result.forEach((salary) => {
            const foundEmp = loginModalResult.find((emp) => emp.id == salary.employee_id);

            salary.employee_name = companyVsApplicationLoginResult.find(emp => emp.dataValues.employee_id == salary.employee_id)?.dataValues.username || "";
            salary.month = salary.month;
            salary.dws_basic = salary.dws_basic?.toFixed(2)
            salary.dws_hra = salary.dws_hra?.toFixed(2)
            salary.dws_other = salary.dws_other?.toFixed(2)
            salary.dws_total_earning = salary.dws_total_earning?.toFixed(2)
            salary.earn_ot_payable_amt = salary.earn_ot_payable_amt?.toFixed(2)
            salary.earn_head_first = salary.earn_head_first?.toFixed(2)
            salary.earn_head_second = salary.earn_head_second?.toFixed(2)
            salary.earn_head_third = salary.earn_head_third?.toFixed(2)
            salary.bonus_amount = salary.bonus_amount?.toFixed(2)
            salary.earn_sub_total = salary.earn_sub_total?.toFixed(2)
            salary.total_earning = salary.total_earning?.toFixed(2)
            salary.ded_emp_pf = salary.ded_emp_pf?.toFixed(2)
            salary.ded_pradhan_mantri_pf = salary.ded_pradhan_mantri_pf?.toFixed(2)
            salary.ded_esi_employee = salary.ded_esi_employee?.toFixed(2)
            salary.ded_esi_company = salary.ded_esi_company?.toFixed(2)
            salary.ded_pt = salary.ded_pt?.toFixed(2)
            salary.ded_insurance = salary.ded_insurance?.toFixed(2)
            salary.ded_first = salary.ded_first?.toFixed(2)
            salary.ded_second = salary.ded_second?.toFixed(2)
            salary.ded_third = salary.ded_third?.toFixed(2)
            salary.total_deduction = salary.total_deduction?.toFixed(2)
            salary.net_bank_pay = salary.net_bank_pay?.toFixed(2)
            salary.per_day_salary = salary.per_day_salary?.toFixed(2)
            salary.fxs_basic = salary.fxs_basic?.toFixed(2)
            salary.fxs_hra = salary.fxs_hra?.toFixed(2)
            salary.fxs_other = salary.fxs_other?.toFixed(2)
            salary.fxs_total_earning = salary.fxs_total_earning?.toFixed(2)
            salary.working_hour = salary.working_hour?.toFixed(2)
            salary.recovery_mobile = foundEmp?.recovery_mobile || "";
            salary.aadhar_card_number = foundEmp?.aadhar_card_number || "";
            salary.pan_card_number = foundEmp?.pan_card_number || "";
        })

        if (result) {
            return resSuccess({
                data: { item: result },
                ack_msg: "Salary Register report fetched successfully",
            });
        } else {
            return resError({
                developer_msg: "Salary Data not found",
                ack_msg: "Failed to fetch Salary Register report",
            });
        }
    } catch (e) {
        console.log("salaryRegistrationGet error", e)
        return resBadRequest({ developer_msg: `error ${e}` });
    }
};
