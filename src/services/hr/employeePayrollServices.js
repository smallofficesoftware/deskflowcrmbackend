import moment from "moment";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import {
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";


export const createEmployeePayrollData = async (req) => {

    try {

        const {
            a_application_login_id,
            employee_id,
            daily_in_time,
            daily_out_time,
            daily_working_hours,
            daily_break_hours,
            min_present_hours,
            half_day_hours,
            compulsary_attendance,
            compulsary_attendance_image,
            week_off_days,
            salary_type,
            salary_cal_month_count,
            face_ids,
            salary_amount_type_wise,
            min_overtime_hours,
            overtime_amount_per_hour,
            regular_ot_type,
            extra_ot_type,
            approve_ot_hours,
            late_in_allowed_count,
            late_in_penalty_type,
            late_in_penalty_value,
            early_out_allowed_count,
            early_out_penalty_type,
            early_out_penalty_value,
            hourly_leave_allowed_hours,
            sandwich_rule_applied,
            sandwich_rule_type,
            bonus_type,
            bonus_percentage,
            performance_incentive,
            earning_first,
            earning_second,
            earning_third,
            deduction_first,
            deduction_second,
            deduction_third,
            pf_percentage,
            company_pf_percentage,
            pm_pf_percentage,
            tds_percentage,
            insurance_amount,
            pt_amount,
            esi_company_side,
            esi_employee_side_percentage,
            gratuity_calculation,
            basic_da,
            hra,
            ctc,
            medical_allowance,
            conveyance_allowance,
            special_allowance,
            grace_period,
        } = req.body;

        if (!a_application_login_id) {

            return resBadRequest({
                ack_msg: "Application login ID and employee ID are required",
            });

        }

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyId || !findCompanyId.company_masters_id) {

            return resError({
                ack_msg: "Invalid application login ID",
            });

        }

        const employeePayrollModelIntance = await employeePayrollModel(req.tenantDB);

        const existing = await employeePayrollModelIntance.findOne({
            where: {
                a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
            }
        });

        if (existing) {
            return resError({ ack_msg: "Employee payroll already exists" });
        }
        let weekOffDaysFormatted = "";

        if (Array.isArray(week_off_days) && week_off_days.length > 0) {
            // Convert array to comma separated string: [0, 1, 2] → "0,1,2"
            weekOffDaysFormatted = week_off_days.join(",");
        }
        else if (typeof week_off_days === "string" && week_off_days.trim() !== "") {
            weekOffDaysFormatted = week_off_days.trim();
        }
        const createPayroll = await employeePayrollModelIntance.create({

            employee_id,
            daily_in_time,
            daily_out_time,
            daily_working_hours,
            daily_break_hours,
            min_present_hours,
            half_day_hours,
            compulsary_attendance,
            compulsary_attendance_image,
            week_off_days: weekOffDaysFormatted,
            salary_type,
            salary_cal_month_count,
            face_ids,
            salary_amount_type_wise,
            min_overtime_hours,
            overtime_amount_per_hour,
            regular_ot_type: regular_ot_type ? parseInt(regular_ot_type, 10) : 1,
            extra_ot_type: extra_ot_type ? parseInt(extra_ot_type, 10) : 2,
            approve_ot_hours,
            late_in_allowed_count: late_in_allowed_count ? parseInt(late_in_allowed_count, 10) : 0,
            late_in_penalty_type: late_in_penalty_type ? parseInt(late_in_penalty_type, 10) : 1,
            late_in_penalty_value: late_in_penalty_value ? parseFloat(late_in_penalty_value) : 0,
            early_out_allowed_count: early_out_allowed_count ? parseInt(early_out_allowed_count, 10) : 0,
            early_out_penalty_type: early_out_penalty_type ? parseInt(early_out_penalty_type, 10) : 1,
            early_out_penalty_value: early_out_penalty_value ? parseFloat(early_out_penalty_value) : 0,
            hourly_leave_allowed_hours: hourly_leave_allowed_hours || "0",
            sandwich_rule_applied,
            sandwich_rule_type,
            bonus_type,
            bonus_percentage,
            performance_incentive,
            earning_first,
            earning_second,
            earning_third,
            deduction_first,
            deduction_second,
            deduction_third,
            pf_percentage,
            company_pf_percentage,
            pm_pf_percentage,
            tds_percentage,
            insurance_amount,
            pt_amount,
            esi_company_side,
            esi_employee_side_percentage,
            gratuity_calculation,
            basic_da,
            hra,
            ctc,
            medical_allowance,
            conveyance_allowance,
            special_allowance,
            grace_period,
            company_masters_id: findCompanyId.company_masters_id,
            a_application_login_id,
            created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
        });

        return resSuccess({
            ack_msg: "Employee Payroll Created Successfully",
            data: createPayroll,
        });

    } catch (error) {

        console.log("createEmployeePayroll Error", error);

        return resError({
            ack_msg: "Internal server error",
            error: error.message,
        });

    }

};
export const fetchEmployeePayroll = async (req) => {

    try {

        const {
            a_application_id,
        } = req.body;

        if (!a_application_id) {

            return resBadRequest({
                ack_msg: "Application login ID are required",
            });

        }

        const findCompanyId = await getCompanyByLoginId(a_application_id);

        if (!findCompanyId || !findCompanyId.company_masters_id) {

            return resError({
                ack_msg: "Invalid application login ID",
            });

        }

        const employeePayrollModelIntance = employeePayrollModel(req.tenantDB);

        const fetchPayroll = await employeePayrollModelIntance.findOne({
            where: {
                a_application_login_id: a_application_id,
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
            },
        });

        return resSuccess({
            ack_msg: fetchPayroll
                ? "Employee Payroll Fetch Successfully"
                : "Employee Payroll Data Not Found",
            data: fetchPayroll || null,
        });

    } catch (error) {

        console.log("fetchEmployeePayroll Error =>", error);

        return resError({
            ack_msg: "Internal server error",
            error: error.message,
        });

    }

};

export const updateEmployeePayroll = async (req) => {

    try {

        const {
            id,
            a_application_login_id,
            employee_id,
            daily_in_time,
            daily_out_time,
            daily_working_hours,
            daily_break_hours,
            min_present_hours,
            half_day_hours,
            compulsary_attendance,
            compulsary_attendance_image,
            week_off_days,
            salary_type,
            salary_cal_month_count,
            face_ids,
            salary_amount_type_wise,
            min_overtime_hours,
            overtime_amount_per_hour,
            regular_ot_type,
            extra_ot_type,
            approve_ot_hours,
            late_in_allowed_count,
            late_in_penalty_type,
            late_in_penalty_value,
            early_out_allowed_count,
            early_out_penalty_type,
            early_out_penalty_value,
            hourly_leave_allowed_hours,
            sandwich_rule_applied,
            sandwich_rule_type,
            bonus_type,
            bonus_percentage,
            performance_incentive,
            earning_first,
            earning_second,
            earning_third,
            deduction_first,
            deduction_second,
            deduction_third,
            pf_percentage,
            company_pf_percentage,
            pm_pf_percentage,
            tds_percentage,
            insurance_amount,
            pt_amount,
            esi_company_side,
            esi_employee_side_percentage,
            gratuity_calculation,
            basic_da,
            hra,
            ctc,
            medical_allowance,
            conveyance_allowance,
            special_allowance,
            grace_period,
        } = req.body;

        if (!a_application_login_id || !id) {

            return resBadRequest({
                ack_msg: "Payroll ID, Application login ID and employee ID are required",
            });

        }

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyId || !findCompanyId.company_masters_id) {

            return resError({
                ack_msg: "Invalid application login ID",
            });

        }

        const employeePayrollModelIntance = employeePayrollModel(req.tenantDB);

        const checkPayrollExist = await employeePayrollModelIntance.findOne({
            where: {
                id: id,
                a_application_login_id: a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0,
            },
        });

        if (!checkPayrollExist) {

            return resError({
                ack_msg: "Employee payroll not found",
            });

        }
        let weekOffDaysFormatted = "";

        if (Array.isArray(week_off_days) && week_off_days.length > 0) {
            // Convert array to comma separated string: [0, 1, 2] → "0,1,2"
            weekOffDaysFormatted = week_off_days.join(",");
        }
        else if (typeof week_off_days === "string" && week_off_days.trim() !== "") {
            weekOffDaysFormatted = week_off_days.trim();
        }
        await employeePayrollModelIntance.update({
            employee_id,
            daily_in_time,
            daily_out_time,
            daily_working_hours,
            daily_break_hours,
            min_present_hours,
            half_day_hours,
            compulsary_attendance,
            compulsary_attendance_image,
            week_off_days: weekOffDaysFormatted,
            salary_type,
            salary_cal_month_count,
            face_ids,
            salary_amount_type_wise,
            min_overtime_hours,
            overtime_amount_per_hour,
            regular_ot_type: regular_ot_type ? parseInt(regular_ot_type, 10) : 1,
            extra_ot_type: extra_ot_type ? parseInt(extra_ot_type, 10) : 2,
            approve_ot_hours,
            late_in_allowed_count: late_in_allowed_count ? parseInt(late_in_allowed_count, 10) : 0,
            late_in_penalty_type: late_in_penalty_type ? parseInt(late_in_penalty_type, 10) : 1,
            late_in_penalty_value: late_in_penalty_value ? parseFloat(late_in_penalty_value) : 0,
            early_out_allowed_count: early_out_allowed_count ? parseInt(early_out_allowed_count, 10) : 0,
            early_out_penalty_type: early_out_penalty_type ? parseInt(early_out_penalty_type, 10) : 1,
            early_out_penalty_value: early_out_penalty_value ? parseFloat(early_out_penalty_value) : 0,
            hourly_leave_allowed_hours: hourly_leave_allowed_hours || "0",
            sandwich_rule_applied,
            sandwich_rule_type,
            bonus_type,
            bonus_percentage,
            performance_incentive,
            earning_first,
            earning_second,
            earning_third,
            deduction_first,
            deduction_second,
            deduction_third,
            pf_percentage,
            company_pf_percentage,
            pm_pf_percentage,
            tds_percentage,
            insurance_amount,
            pt_amount,
            esi_company_side,
            esi_employee_side_percentage,
            gratuity_calculation,
            basic_da,
            hra,
            ctc,
            medical_allowance,
            conveyance_allowance,
            special_allowance,
            grace_period,

            modified_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),

        }, {
            where: {
                id: id,
            },
        });

        const updatedPayroll = await employeePayrollModelIntance.findOne({
            where: {
                id: id,
            },
        });

        return resSuccess({
            ack_msg: "Employee Payroll Updated Successfully",
            data: updatedPayroll,
        });

    } catch (error) {

        console.log("updateEmployeePayroll Error =>", error);

        return resError({
            ack_msg: "Internal server error",
            error: error.message,
        });

    }

};

const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
    )}:${String(seconds).padStart(2, "0")}`;
};

// Function to calculate total working hours for a group
const calculateTotalWorkingHours = (attendanceHistory) => {
    let totalSeconds = 0;
    attendanceHistory.forEach((item) => {
        item.messages.forEach((e) => {
            const timeStr = e.total_working_hour;
            if (timeStr && typeof timeStr === "string") {
                const [hours, minutes, seconds] = timeStr.split(":").map(Number);
                if (!isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)) {
                    totalSeconds += hours * 3600 + minutes * 60 + seconds;
                }
            }
        });
    });
    return formatTime(totalSeconds);
};

// Helper function to add minutes to a TIME string (HH:mm:ss)
function addMinutesToTime(timeStr, minutes) {
    if (!timeStr) return null;

    const [hours, mins, secs] = timeStr.split(':').map(Number);
    let totalMinutes = hours * 60 + mins + minutes;

    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;

    return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:00`;
}

// Compare two time strings (HH:mm:ss)
function compareTime(time1, time2) {
    return time1.localeCompare(time2);
}

// Get IN Status with 15 minutes grace period
function getInStatus(checkInTime, dailyInTime) {
    if (!checkInTime || !dailyInTime) return "Unknown";

    const graceTime = addMinutesToTime(dailyInTime, 15);

    if (compareTime(checkInTime, dailyInTime) < 0) {
        return "Early In";
    }

    if (compareTime(checkInTime, graceTime) <= 0) {
        return "On Time";
    }

    return "Late In";
}

// Get OUT Status with 15 minutes grace period
function getOutStatus(checkOutTime, dailyOutTime) {
    if (!checkOutTime || !dailyOutTime) return "Unknown";

    const graceTime = addMinutesToTime(dailyOutTime, 15);

    if (compareTime(checkOutTime, dailyOutTime) < 0) {
        return "Early Out";
    }

    if (compareTime(checkOutTime, graceTime) <= 0) {
        return "On Time";
    }

    return "Over Time";
}

