// Salary slip PDF, built on the server from an EJS template (same approach as the
// report export and the order PDFs: ejs -> pdf-creator-node), so it no longer
// depends on capturing the screen in the browser.
import ejs from "ejs";
import fs from "fs";
import moment from "moment";
import path from "path";
import pdf from "pdf-creator-node";
import { Op, Sequelize } from "sequelize";
import { fileURLToPath } from "url";
import loginModel from "../../models/application_login/loginModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyDetailByLoginId } from "../commonServices.js";
import { buildSlipView, monthLabel, slipDateTime } from "./salarySlipPdfData.js";
import { getSalaryDetail } from "./salaryProcessServices.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(here, "../../views/salary/salarySlip.ejs");
const MAX_EMPLOYEES = 200;

const parseIds = (value) =>
    (Array.isArray(value) ? value : String(value ?? "").split(","))
        .map((v) => Number(String(v).trim()))
        .filter((n) => Number.isInteger(n) && n > 0);

export const exportSalarySlipPdf = async (req) => {
    try {
        const { month, year } = req.body;
        const ids = [...new Set(parseIds(req.body.employeeIds))];

        if (!ids.length || !Number(month) || !Number(year)) {
            return resError({ ack_msg: "Select employees, month and year.", developer_msg: "employeeIds, month and year are required" });
        }
        if (ids.length > MAX_EMPLOYEES) {
            return resError({ ack_msg: `Select at most ${MAX_EMPLOYEES} employees at a time.` });
        }

        const loginId = req.body.a_application_login_id || req.user?.id;
        const company = await getCompanyDetailByLoginId(loginId);

        // Same data the on-screen slip uses (and the signature, as an embedded image).
        req.body.employeeIds = ids.join(",");
        const salary = await getSalaryDetail(req);
        if (salary.ack !== 1) return salary;
        const salaryByEmployee = salary.data?.salary || {};
        const companySign = salary.data?.company_sign || null;

        const employees = await loginModel.findAll({
            where: {
                isDelete: "0",
                id: { [Op.in]: ids },
                [Op.and]: [
                    Sequelize.literal(`id IN (
                        SELECT a_application_login_id FROM company_vs_application_logins
                        WHERE isDelete = 0 AND company_masters_id = ${Number(company.id)}
                    )`),
                ],
            },
            attributes: ["id", "username", "employee_id", "recovery_mobile"],
            raw: true,
        });
        const employeeById = new Map(employees.map((e) => [e.id, e]));

        // Keep the order the user selected; an employee without a calculated salary has no slip.
        const slips = ids
            .filter((id) => salaryByEmployee[id] && employeeById.has(id))
            .map((id) => buildSlipView(salaryByEmployee[id], employeeById.get(id)));

        if (!slips.length) {
            return resError({
                ack_msg: "No salary found for the selected employees and month. Run Salary Process first.",
                developer_msg: "no salary_registers rows for the selected employees",
            });
        }

        const html = ejs.render(fs.readFileSync(TEMPLATE_PATH, "utf-8"), {
            company: { name: company.company_name || "", address: company.address || "", email: company.company_email || "" },
            monthLabel: monthLabel(month, year),
            slipDate: slipDateTime(),
            companySign,
            slips,
        });

        const outputDir = path.resolve(process.cwd(), "media-folder", "exports", "salary-slips", String(company.id));
        fs.mkdirSync(outputDir, { recursive: true });
        const fileName = `Salary_Slip_${year}_${String(month).padStart(2, "0")}_${moment().format("YYYYMMDD_HHmmss")}.pdf`;

        await pdf.create(
            { html, data: {}, path: path.join(outputDir, fileName), type: "" },
            { format: "A4", orientation: "portrait", border: "10mm" },
        );

        const fileUrl = `${EXPORTS_LINK_EXTENDED}salary-slips/${company.id}/${fileName}`;
        return resSuccess({ data: { fileUrl, fileName, slip_count: slips.length } });
    } catch (error) {
        console.error("exportSalarySlipPdf error:", error);
        return resError({ ack_msg: "Failed to create the salary slip PDF.", developer_msg: `${error?.message || error}` });
    }
};
