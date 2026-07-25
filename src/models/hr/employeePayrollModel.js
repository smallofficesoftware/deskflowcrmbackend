import {
    DATE,
    DOUBLE,
    INTEGER,
    STRING,
    TIME,
    TINYINT
} from "sequelize";

export const employeePayrollModel = (sequelize) => {
    return sequelize.define("employee_payrolls", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        employee_id: {
            type: STRING,
        },

        daily_in_time: {
            type: TIME,
        },

        daily_out_time: {
            type: TIME,
        },

        daily_working_hours: {
            type: STRING,
        },

        daily_break_hours: {
            type: STRING,
        },

        min_present_hours: {
            type: STRING,
        },

        half_day_hours: {
            type: STRING,
        },
        grace_period: {
            type: STRING,
        },

        compulsary_attendance: {
            type: TINYINT,
            defaultValue: 0,
        },

        compulsary_attendance_image: {
            type: TINYINT,
            defaultValue: 0,
        },

        week_off_days: {
            type: STRING,
        },
        face_ids: {
            type: STRING,
        },

        salary_type: {
            type: TINYINT,
        },

        salary_amount_type_wise: {
            type: DOUBLE,
        },

        min_overtime_hours: {
            type: TIME,
        },

        overtime_amount_per_hour: {
            type: DOUBLE,
        },

        approve_ot_hours: {
            type: TIME,
        },

        sandwich_rule_applied: {
            type: TINYINT,
        },

        sandwich_rule_type: {
            type: TINYINT,
        },

        bonus_type: {
            type: TINYINT,
        },
        salary_cal_month_count: {
            type: TINYINT,
        },

        bonus_percentage: {
            type: DOUBLE,
        },

        performance_incentive: {
            type: DOUBLE,
        },

        earning_first: {
            type: DOUBLE,
        },

        earning_second: {
            type: DOUBLE,
        },

        earning_third: {
            type: DOUBLE,
        },

        deduction_first: {
            type: DOUBLE,
        },

        deduction_second: {
            type: DOUBLE,
        },

        deduction_third: {
            type: DOUBLE,
        },

        pf_percentage: {
            type: DOUBLE,
        },

        company_pf_percentage: {
            type: DOUBLE,
        },

        pm_pf_percentage: {
            type: DOUBLE,
        },

        tds_percentage: {
            type: DOUBLE,
        },

        insurance_amount: {
            type: DOUBLE,
        },

        pt_amount: {
            type: DOUBLE,
        },

        esi_company_side: {
            type: DOUBLE,
        },

        esi_employee_side_percentage: {
            type: DOUBLE,
        },

        gratuity_calculation: {
            type: DOUBLE,
        },

        basic_da: {
            type: DOUBLE,
        },

        hra: {
            type: DOUBLE,
        },

        ctc: {
            type: DOUBLE,
        },

        medical_allowance: {
            type: DOUBLE,
        },

        conveyance_allowance: {
            type: DOUBLE,
        },

        special_allowance: {
            type: DOUBLE,
        },

        company_masters_id: {
            type: INTEGER,
        },

        a_application_login_id: {
            type: INTEGER,
        },

        created_date_time: {
            type: DATE,
        },

        modified_date: {
            type: DATE,
        },

        s_timestemp: {
            type: DATE,
        },

        isDelete: {
            type: TINYINT,
            defaultValue: 0,
        },

        isActive: {
            type: TINYINT,
            defaultValue: 1,
        },

    }, {
        timestamps: true,
        createdAt: "created_date_time",
        updatedAt: "modified_date",
    });
};