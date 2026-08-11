import { DATE, DATEONLY, DOUBLE, INTEGER, NOW, JSON as SequelizeJSON, STRING, TINYINT } from "sequelize";

export const salaryRegisterModel = (sequelize) => {
    return sequelize.define("salary_registers", {
        id: {
            type: INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },

        year: { type: INTEGER },
        month: { type: INTEGER },
        added_date: { type: DATEONLY },
        employee_id: { type: INTEGER },

        // ── Attendance day-status aggregates ──────────────────────────────
        calculate_days: { type: DOUBLE },
        total_present_day: { type: DOUBLE },
        half_day: { type: DOUBLE },
        holiday: { type: DOUBLE },
        total_week_off: { type: DOUBLE },
        total_leave: { type: DOUBLE },
        total_paid_leave: { type: DOUBLE },
        total_unpaid_leave: { type: DOUBLE },
        total_absent: { type: DOUBLE },
        total_day: { type: DOUBLE },
        working_hour: { type: DOUBLE },

        compensation_amount: { type: SequelizeJSON }, // { credit, debit }

        // ── Salary basis ───────────────────────────────────────────────────
        basic_da: { type: DOUBLE },
        hra: { type: DOUBLE },
        ctc: { type: DOUBLE },
        gross_salary: { type: DOUBLE },
        per_day_salary: { type: DOUBLE },

        conveyance_allowance: { type: DOUBLE },
        medical_allowance: { type: DOUBLE },
        special_allowance: { type: DOUBLE },

        // ── Fixed salary (fxs_*) — calendar pro-rated, attendance-independent ──
        fxs_basic: { type: DOUBLE },
        fxs_hra: { type: DOUBLE },
        fxs_other: { type: DOUBLE },
        fxs_total_earning: { type: DOUBLE },

        // ── Days-worked salary (dws_*) — attendance pro-rated ───────────────
        dws_basic: { type: DOUBLE },
        dws_hra: { type: DOUBLE },
        dws_other: { type: DOUBLE },
        dws_total_earning: { type: DOUBLE },

        // ── Earnings ─────────────────────────────────────────────────────────
        earn_ot_hours: { type: STRING(100) },
        earn_ot_payable_amt: { type: DOUBLE },
        regular_ot_hours: { type: STRING(100) },
        extra_ot_hours: { type: STRING(100) },
        regular_ot_payable_amt: { type: DOUBLE },
        extra_ot_payable_amt: { type: DOUBLE },
        earn_head_first: { type: DOUBLE },
        earn_head_second: { type: DOUBLE },
        earn_head_third: { type: DOUBLE },
        bonus_amount: { type: DOUBLE },
        earn_sub_total: { type: DOUBLE },
        total_earning: { type: DOUBLE },

        // ── Deductions ───────────────────────────────────────────────────────
        ded_emp_pf: { type: DOUBLE },
        ded_pradhan_mantri_pf: { type: DOUBLE },
        ded_esi_employee: { type: DOUBLE },
        ded_esi_company: { type: DOUBLE },
        ded_pt: { type: DOUBLE },
        ded_insurance: { type: DOUBLE },
        ded_first: { type: DOUBLE },
        ded_second: { type: DOUBLE },
        ded_third: { type: DOUBLE },
        total_deduction: { type: DOUBLE },

        net_bank_pay: { type: DOUBLE },

        company_masters_id: { type: INTEGER },
        a_application_login_id: { type: INTEGER },

        created_date_time: { type: DATE, defaultValue: NOW },
        s_timestemp: { type: STRING },

        isDelete: { type: TINYINT, defaultValue: "0" },
        isActive: { type: TINYINT, defaultValue: "1" },
    }, {
        timestamps: true,
        createdAt: 'created_date_time',
        updatedAt: 'modified_date',
        indexes: [
            {
                unique: true,
                fields: ['year', 'month', 'employee_id', 'isDelete'],
                name: 'year',
            },
        ],
    });
};