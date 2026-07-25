import moment from "moment";
import { Op, Sequelize } from "sequelize";
import XLSX from "xlsx";
import loginModel from "../../models/application_login/loginModel.js";
import { attendanceModel } from "../../models/hr/attendanceModel.js";
import {
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { calculateWorkingHours } from "../hr/attendanceServices.js";


export const importAttendanceByExcel = async (req, res) => {
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

        const AMmodel = attendanceModel(req.tenantDB);

        /** Read Excel **/
        const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const columns = data[0];

        const requiredFields = [
            "employee_id",
            "attendance_date",
            "attendance_time",
            "status",
        ];

        const missingFields = requiredFields.filter(f => !columns.includes(f));

        if (missingFields.length > 0) {
            return resError({
                ack_msg: `Missing columns: ${missingFields.join(", ")}`,
                developer_msg: `Missing columns: ${missingFields.join(", ")}`,
            });
        }

        const rows = data.slice(1);

        if (!rows.length) {
            return resError({
                ack_msg: "No data found",
                developer_msg: "Excel is empty",
            });
        }

        /** Map column index **/
        const colIndex = {};
        columns.forEach((col, i) => {
            colIndex[col] = i;
        });

        let errorRows = [];
        let finalData = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 2;

            const employee_id = row[colIndex["employee_id"]];
            const attendance_date = row[colIndex["attendance_date"]];
            const attendance_time = row[colIndex["attendance_time"]];
            const status = row[colIndex["status"]];

            /** Validation **/
            if (!employee_id || !attendance_date || !attendance_time || status === undefined) {
                errorRows.push(`Row ${rowNumber} missing required fields`);
                continue;
            }

            /** Find employee **/
            const employee = await loginModel.findOne({
                where: {
                    employee_id: employee_id.toString().trim(),
                    isDelete: 0,
                },
                attributes: ["id"],
                raw: true,
            });

            if (!employee) {
                errorRows.push(`Row ${rowNumber} invalid employee_id`);
                continue;
            }

            /** Combine date + time **/
            /** Normalize date **/
            let rawDate = attendance_date;

            if (typeof rawDate === "number") {
                const parsedDate = XLSX.SSF.parse_date_code(rawDate);
                rawDate = `${parsedDate.y}-${String(parsedDate.m).padStart(2, "0")}-${String(parsedDate.d).padStart(2, "0")}`;
            }

            /** Normalize time **/
            let rawTime = attendance_time;

            if (typeof rawTime === "number") {
                rawTime = XLSX.SSF.format("HH:mm:ss", rawTime);
            } else {
                rawTime = rawTime?.toString().toUpperCase().trim();

                // Fix cases like "8:30PM"
                rawTime = rawTime?.replace(/(AM|PM)$/, " $1");
            }

            /** Combine **/
            const dateTimeString = `${rawDate} ${rawTime}`;

            /** Parse with multiple formats **/
            const parsed = moment(dateTimeString, [
                "YYYY-MM-DD HH:mm:ss",
                "YYYY-MM-DD HH:mm",
                "YYYY-MM-DD hh:mm A",
                "YYYY-MM-DD h:mm A",
                "DD-MM-YYYY HH:mm:ss",
                "DD-MM-YYYY hh:mm A",
                "DD-MM-YY hh:mm A"
            ], true);

            const formattedDateTime = parsed.isValid()
                ? parsed.format("YYYY-MM-DD HH:mm:ss")
                : null;

            /** Validation **/
            if (!formattedDateTime) {
                errorRows.push(`Row ${rowNumber} invalid date/time`);
                continue;
            }

            let total_working_hour = "00:00:00";

            if (Number(status) === 2) {
                const currentDate = moment(formattedDateTime).format("YYYY-MM-DD");

                // 1️⃣ Check from already processed Excel data
                const lastCheckInFromFile = [...finalData]
                    .reverse()
                    .find(d =>
                        d.a_application_login_id === employee.id &&
                        d.attendance_status === 1 &&
                        moment(d.check_in_out_date_time).format("YYYY-MM-DD") === currentDate
                    );

                let lastCheckInTime = null;

                if (lastCheckInFromFile) {
                    lastCheckInTime = lastCheckInFromFile.check_in_out_date_time;
                } else {
                    // 2️⃣ Fallback to DB
                    const lastCheckInFromDB = await AMmodel.findOne({
                        where: {
                            a_application_login_id: employee.id,
                            company_masters_id: companyDetail.company_masters_id,
                            attendance_status: 1,
                            isDelete: 0,
                            [Op.and]: [
                                Sequelize.where(
                                    Sequelize.fn("DATE", Sequelize.col("check_in_out_date_time")),
                                    currentDate
                                ),
                            ],
                        },
                        order: [["check_in_out_date_time", "DESC"]],
                        raw: true,
                    });

                    if (lastCheckInFromDB) {
                        lastCheckInTime = lastCheckInFromDB.check_in_out_date_time;
                    }
                }

                if (lastCheckInTime) {
                    total_working_hour = calculateWorkingHours(
                        lastCheckInTime,
                        formattedDateTime
                    );
                }
            }

            /** Final object **/
            finalData.push({
                attendance_status: Number(status),
                a_application_login_id: employee.id,
                check_in_out_date_time: formattedDateTime,
                total_working_hour,
                company_masters_id: companyDetail.company_masters_id,
                created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
                attendance_entry_flag: 3, // manual import
                image_url: "", // required in model
                remark: "Imported from Excel",
            });
        }

        /** If no valid data **/
        if (!finalData.length) {
            return resError({
                ack_msg: "No valid data to import",
                developer_msg: errorRows.join(", "),
            });
        }

        /** Bulk insert **/
        await AMmodel.bulkCreate(finalData, {
            validate: true,
        });

        return resSuccess({
            ack_msg: "Attendance imported successfully",
            developer_msg: "Success",
            data: errorRows.length ? errorRows.join("<br/>") : "",
        });

    } catch (error) {
        console.error("importAttendanceByExcel Error:", error);

        return resError({
            ack_msg: "Import failed",
            developer_msg: error.message,
        });
    }
};