import fs from "fs";
import path from "path";
import moment from "moment";
import { randomUUID } from "crypto";
import XLSX from "xlsx";
import { Op, Sequelize } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { AdjustmentTypes } from "../../models/hr/adjustmentTypes.js";
import { compensationAdjustmentModel } from "../../models/hr/compensationAdjustmentModel.js";
import { EXPORTS_LINK_EXTENDED } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
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

export const generateCompensationAdjustmentSampleSheet = async (req) => {
    try {
        const { a_application_login_id } = req.body;
        const companyDetail = await getCompanyByLoginId(a_application_login_id);

        const fileName = `sample_compensation_adjustment_sheet_${randomUUID()}`;
        const format = "xlsx";
        const outputDir = `media-folder/exports/compensation-adjustments/${companyDetail.company_masters_id}`;
        const uploadDir = path.resolve(process.cwd(), outputDir);

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const excelColumnDefineArray = {
            employee_id: "EMP001",
            type: "Overtime",
            adjustment_type: "1",
            hours: "2.5",
            amount: "500",
            apply_date: moment().format("DD-MM-YYYY"),
            remark: "Overtime compensation",
        };

        const data = [excelColumnDefineArray];

        const requiredColumns = {
            employee_id: "FFFF0000",
            type: "FFFF0000",
            adjustment_type: "FFFF0000",
            amount: "FFFF0000",
            apply_date: "FFFF0000",
        };

        const savedPath = await exportData(data, {
            format,
            fileName,
            columns: null,
            headers: null,
            autoDownload: false,
            outputDir: uploadDir,
            colorColumns: requiredColumns,
        });

        const fileUrl = `${EXPORTS_LINK_EXTENDED}compensation-adjustments/${companyDetail.company_masters_id}/${savedPath.file_name}`;

        return resSuccess({
            data: { fileUrl, fileName: savedPath.file_name },
        });
    } catch (error) {
        console.error("generateCompensationAdjustmentSampleSheet Error:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const importCompensationAdjustmentByExcel = async (req) => {
    try {
        if (!req.file) {
            return resBadRequest({
                ack_msg: "No file uploaded",
                developer_msg: "Please upload an Excel file",
            });
        }

        const { a_application_login_id } = req.body;

        if (!a_application_login_id) {
            return resBadRequest({
                ack_msg: "Missing authentication",
                developer_msg: "a_application_login_id is required",
            });
        }

        const companyDetail = await getCompanyByLoginId(a_application_login_id);

        const compensationModelInstance = compensationAdjustmentModel(req.tenantDB);
        const adjustmentTypesModelInstance = AdjustmentTypes(req.tenantDB);

        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!data || data.length < 2) {
            return resError({
                ack_msg: "No data found in Excel sheet",
                developer_msg: "Excel is empty",
            });
        }

        const columns = data[0].map(c => (c ? c.toString().trim().toLowerCase() : ""));
        const requiredFields = ["employee_id", "amount", "apply_date"];
        const missingFields = requiredFields.filter(f => !columns.includes(f));

        if (missingFields.length > 0) {
            return resError({
                ack_msg: `Missing columns: ${missingFields.join(", ")}`,
                developer_msg: `Missing columns: ${missingFields.join(", ")}`,
            });
        }

        const rows = data.slice(1);
        const colIndex = {};
        columns.forEach((col, i) => {
            colIndex[col] = i;
        });

        const activeEmployees = (await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id
                        FROM company_vs_application_logins
                        WHERE isDelete = 0 AND company_masters_id = '${companyDetail.company_masters_id}'
                    )`)
                },
                isDelete: 0,
            },
            attributes: ["id", "username", "employee_id"],
            raw: true,
        })).map(e => ({
            ...e,
            cleanEmployeeId: (e.employee_id || "").toString().trim().toLowerCase(),
        }));

        const activeAdjTypesRaw = await adjustmentTypesModelInstance.findAll({
            where: { isDelete: 0 },
            raw: true,
        });
        const activeAdjTypes = activeAdjTypesRaw.map(t => ({
            ...t,
            fullName: `${t.name}-${ADJUSTMENT_METHOD[t.method] || ""}-${ADJUSTMENT_MODE[t.mode] || ""}`.toLowerCase().trim(),
            cleanName: (t.name || "").toLowerCase().trim(),
        }));

        let errorRows = [];
        let finalData = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2;

            if (!row || row.length === 0 || row.every(cell => cell === null || cell === undefined || cell === "")) {
                continue;
            }

            const rawEmployeeId = row[colIndex["employee_id"]];
            const rawType = row[colIndex["type"]] ?? row[colIndex["type_id"]];
            const rawAdjType = row[colIndex["adjustment_type"]];
            const rawHours = row[colIndex["hours"]] ?? row[colIndex["hours_value"]];
            const rawAmount = row[colIndex["amount"]] ?? row[colIndex["amount_value"]];
            const rawApplyDate = row[colIndex["apply_date"]];
            const rawRemark = row[colIndex["remark"]] ?? "";

            if (!rawEmployeeId) {
                errorRows.push(`Row ${rowNumber}: missing employee_id`);
                continue;
            }

            const empStr = rawEmployeeId.toString().trim().toLowerCase();
            const isSampleRow =
                ["john doe", "emp001", "demo", "sample"].includes(empStr) &&
                (rawRemark?.toString().trim().toLowerCase() === "overtime compensation" || rows.length > 1);

            const matchedEmp = activeEmployees.find(e =>
                e.cleanEmployeeId && e.cleanEmployeeId === empStr
            );

            if (!matchedEmp) {
                // If it is the demo sample row and other data exists, skip it silently
                if (isSampleRow && rows.length > 1) {
                    continue;
                }
                errorRows.push(`Row ${rowNumber}: invalid or inactive employee_id (${rawEmployeeId})`);
                continue;
            }

            let matchedType = null;
            if (rawType !== undefined && rawType !== null && rawType !== "") {
                const typeStr = rawType.toString().trim().toLowerCase();
                matchedType = activeAdjTypes.find(t =>
                    t.fullName === typeStr ||
                    t.cleanName === typeStr ||
                    t.id.toString() === typeStr ||
                    typeStr.startsWith(t.cleanName) ||
                    t.cleanName.startsWith(typeStr) ||
                    typeStr.includes(t.cleanName)
                );
            }

            if (!matchedType && activeAdjTypes.length > 0) {
                matchedType = activeAdjTypes[0];
            }

            if (!matchedType) {
                errorRows.push(`Row ${rowNumber}: invalid adjustment type (${rawType || "none"})`);
                continue;
            }

            let adjTypeNumber = 0;
            if (rawAdjType !== undefined && rawAdjType !== null && rawAdjType !== "") {
                const adjTypeStr = rawAdjType.toString().trim().toLowerCase();
                if (adjTypeStr === "1" || adjTypeStr.includes("credit hour") || adjTypeStr === "ch") {
                    adjTypeNumber = 1;
                } else if (adjTypeStr === "2" || adjTypeStr.includes("debit hour") || adjTypeStr === "dh") {
                    adjTypeNumber = 2;
                } else if (adjTypeStr === "3" || adjTypeStr.includes("credit amount") || adjTypeStr === "ca") {
                    adjTypeNumber = 3;
                } else if (adjTypeStr === "4" || adjTypeStr.includes("debit amount") || adjTypeStr === "da") {
                    adjTypeNumber = 4;
                } else if (!isNaN(rawAdjType) && Number(rawAdjType) >= 1 && Number(rawAdjType) <= 4) {
                    adjTypeNumber = Number(rawAdjType);
                }
            }

            if (!adjTypeNumber) {
                if (matchedType.method === 2 && matchedType.mode === 1) adjTypeNumber = 1;
                else if (matchedType.method === 2 && matchedType.mode === 2) adjTypeNumber = 2;
                else if (matchedType.method === 1 && matchedType.mode === 1) adjTypeNumber = 3;
                else if (matchedType.method === 1 && matchedType.mode === 2) adjTypeNumber = 4;
                else adjTypeNumber = 1;
            }

            let hoursVal = Number(rawHours || 0);
            let amountVal = Number(rawAmount || 0);

            if (adjTypeNumber === 1 || adjTypeNumber === 2) {
                if (isNaN(hoursVal) || hoursVal <= 0) {
                    hoursVal = amountVal;
                }
                if (isNaN(hoursVal) || hoursVal <= 0) {
                    errorRows.push(`Row ${rowNumber}: hours must be greater than 0`);
                    continue;
                }
            } else {
                if (isNaN(amountVal) || amountVal <= 0) {
                    amountVal = hoursVal;
                }
                if (isNaN(amountVal) || amountVal <= 0) {
                    errorRows.push(`Row ${rowNumber}: amount must be greater than 0`);
                    continue;
                }
            }

            let formattedApplyDate = null;
            if (rawApplyDate) {
                if (typeof rawApplyDate === "number") {
                    const parsedDate = XLSX.SSF.parse_date_code(rawApplyDate);
                    formattedApplyDate = `${parsedDate.y}-${String(parsedDate.m).padStart(2, "0")}-${String(parsedDate.d).padStart(2, "0")}`;
                } else {
                    const parsed = moment(rawApplyDate.toString().trim(), [
                        "YYYY-MM-DD",
                        "DD-MM-YYYY",
                        "DD/MM/YYYY",
                        "YYYY/MM/DD",
                        "MM/DD/YYYY",
                        "MM-DD-YYYY",
                        "DD-MM-YY",
                        "DD/MM/YY",
                        "YY-MM-DD",
                        "YY/MM/DD",
                        "D-M-YYYY",
                        "D/M/YYYY",
                        "D-M-YY",
                        "D/M/YY"
                    ], true);
                    if (parsed.isValid()) {
                        formattedApplyDate = parsed.format("YYYY-MM-DD");
                    }
                }
            }

            if (!formattedApplyDate) {
                errorRows.push(`Row ${rowNumber}: invalid apply_date (${rawApplyDate})`);
                continue;
            }

            finalData.push({
                type_id: matchedType.id,
                employee_id: matchedEmp.id,
                adjustment_type: adjTypeNumber,
                hours: hoursVal,
                amount: amountVal,
                apply_date: formattedApplyDate,
                remark: rawRemark ? rawRemark.toString().trim() : "Imported from Excel",
                a_application_login_id,
                company_masters_id: companyDetail.company_masters_id,
            });
        }

        if (!finalData.length) {
            return resError({
                ack_msg: "No valid data to import",
                developer_msg: errorRows.join("<br/>"),
                data: errorRows.join("<br/>"),
            });
        }

        await compensationModelInstance.bulkCreate(finalData, {
            validate: true,
        });

        return resSuccess({
            ack_msg: "Compensation Adjustments imported successfully",
            developer_msg: "Success",
            data: errorRows.length ? errorRows.join("<br/>") : "",
        });

    } catch (error) {
        console.error("importCompensationAdjustmentByExcel Error:", error);
        return resError({
            ack_msg: "Import failed",
            developer_msg: error.message,
        });
    }
};