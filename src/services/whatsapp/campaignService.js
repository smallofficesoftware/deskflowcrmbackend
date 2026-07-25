import { randomUUID } from "crypto";
import fs from "fs-extra";
import path from "path";
import { generateTimeBasedPrefixedUUID } from "../../helpers/uuidHelper.js";
import { contactModel } from "../../models/activities/contactModel.js";
import companyVsWhatsappConfigModel from "../../models/company_setup/companyVsWhatsappConfigModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { CAMPAIGN_EXCEL_GENEREATE_LINK } from "../../utils/appConstants.js";
import { exportData } from "../../utils/exporter.js";
import { isValid, resBadRequest, resSuccess, sanitizeObjectOfNull } from "../../utils/sharedFunctions.js";
import { buildContactWhereClause } from "../activities/contactService.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { WHATSAPP_AXIOS } from "./whatsappAxiosRegistry.js";
import { WHATSAPP_SEND_CAMPAIGN_HANDLER } from "./whatsappHandlerRegistry.js";

// ─────────────────────────────────────────────
//  1. GENERATE CAMPAIGN EXCEL
// ─────────────────────────────────────────────
/**
 * variable_mapping shape  →  { "1": "this is 1", "2": "this 2", ... }
 *
 * What we produce in the Excel:
 *   Column "Phone"     → contact.mobile_number
 *   Column "this is 1" → empty string (placeholder; recipient fills it)
 *   Column "this 2"    → empty string
 *   …one column per variable value…
 *   Column "tags"      → auto-generated campaign UUID
 *
 * The column *header* names match the variable *values* so the upload flow
 * can map them back via variables_mapping  {"1":"<header>", …}.
 */
export const generateCampaignExcel = async (req) => {
    try {
        const {
            variable_mapping = {},
            where = {},
            a_application_login_id,
        } = req.body || {};

        const { appliedTo, ...appliedFilers } = where;

        // ─────────────────────────────────────────────
        // Build where clause
        // ─────────────────────────────────────────────
        let whereClause_e = {};

        if (appliedTo === "all") {

            appliedFilers.a_application_login_id =
                a_application_login_id;

            const { whereClause } =
                await buildContactWhereClause({
                    req,
                    params: appliedFilers,
                });

            whereClause_e = whereClause;

        } else if (isValid(appliedTo)) {

            whereClause_e = {
                id: appliedTo,
                isDelete: 0,
            };

        } else {

            return resBadRequest({
                ack_msg: "Something went wrong",
                developer_msg:
                    "appliedTo is missing or invalid",
            });
        }

        // ─────────────────────────────────────────────
        // Models
        // ─────────────────────────────────────────────
        const Contact = contactModel(req.tenantDB);
        const City = cityModel(req.tenantDB);

        // ─────────────────────────────────────────────
        // Fetch contacts
        // ─────────────────────────────────────────────
        const contacts = await Contact.findAll({
            where: whereClause_e,
            attributes: [
                "id",
                "mobile_number",
                "person_name",
                "company_name",
                "email_id",
                "client_code",
                "address",
                "city",
            ],
            raw: true,
        });

        // ─────────────────────────────────────────────
        // Dynamic variable keys
        // ex:
        // ["customer_name", "city", "mobile"]
        // ─────────────────────────────────────────────
        const dynamicFields = Object.values(
            variable_mapping
        )
            .filter(
                (value) =>
                    typeof value === "string" &&
                    value.startsWith("sn_")
            )
            .map((value) =>
                value.replace("sn_", "")
            );

        // ─────────────────────────────────────────────
        // Lookup storage
        // Future scalable
        // ─────────────────────────────────────────────
        const lookupData = {};

        // ─────────────────────────────────────────────
        // Lookup configuration
        // Add future lookup fields here
        // ─────────────────────────────────────────────
        const lookupConfigs = {

            city: {
                enabled: dynamicFields.includes(
                    "city"
                ),

                getIds: (rows) =>
                    [
                        ...new Set(
                            rows
                                .map((x) => x.city)
                                .filter(Boolean)
                        ),
                    ],

                fetch: async (ids) => {

                    if (!ids.length) return {};

                    const rows =
                        await City.findAll({
                            where: {
                                id: ids,
                            },
                            attributes: [
                                "id",
                                "city_name",
                            ],
                            raw: true,
                        });

                    return rows.reduce(
                        (acc, item) => {
                            acc[item.id] =
                                item.city_name;

                            return acc;
                        },
                        {}
                    );
                },
            },

            // Future Example:
            //
            // state: {
            //     enabled: dynamicFields.includes("state"),
            //
            //     getIds: (rows) => [
            //         ...new Set(rows.map(x => x.state_id))
            //     ],
            //
            //     fetch: async (ids) => {
            //         const rows = await State.findAll(...)
            //
            //         return rows.reduce(...)
            //     }
            // }
        };

        // ─────────────────────────────────────────────
        // Execute required lookups only
        // ─────────────────────────────────────────────
        for (const [key, config] of Object.entries(
            lookupConfigs
        )) {

            if (!config.enabled) continue;

            const ids =
                config.getIds(contacts);

            lookupData[key] =
                await config.fetch(ids);
        }

        // ─────────────────────────────────────────────
        // Company details
        // ─────────────────────────────────────────────
        const companyDetail =
            await getCompanyByLoginId(
                a_application_login_id
            );

        // ─────────────────────────────────────────────
        // File setup
        // ─────────────────────────────────────────────
        const fileName = randomUUID();

        const outputDir =
            `media-folder/campaign/` +
            `${companyDetail.company_masters_id}` +
            `/generate`;

        const uploadDir = path.resolve(
            process.cwd(),
            outputDir
        );

        if (!fs.existsSync(uploadDir)) {

            fs.mkdirSync(uploadDir, {
                recursive: true,
            });
        }

        // ─────────────────────────────────────────────
        // Static excel columns
        // ─────────────────────────────────────────────
        const excelBaseColumns = {
            mobile_number: "Phone",
            person_name: "name",
        };

        // ─────────────────────────────────────────────
        // Dynamic excel columns
        // ─────────────────────────────────────────────
        const dynamicExcelColumns =
            dynamicFields.reduce(
                (acc, field) => {

                    acc[field] = field;

                    return acc;

                },
                {}
            );

        // ─────────────────────────────────────────────
        // Final excel columns
        // ─────────────────────────────────────────────
        const excelColumns = {
            ...excelBaseColumns,
            ...dynamicExcelColumns,
            tags: "tags",
        };

        // ─────────────────────────────────────────────
        // Field resolvers
        // Future scalable
        // ─────────────────────────────────────────────
        const fieldResolvers = {

            customer_name: (row) =>
                row.person_name || "",

            mobile: (row) =>
                row.mobile_number || "",

            city: (row) =>
                lookupData?.city?.[
                row.city
                ] || "",

            email: (row) =>
                row.email_id || "",

            client_code: (row) =>
                row.client_code || "",

            company_name: (row) =>
                row.company_name || "",

            address: (row) =>
                row.address || "",
        };

        // ─────────────────────────────────────────────
        // Generate excel rows
        // ─────────────────────────────────────────────
        const data = contacts.map((contact) => {

            const sanitized =
                sanitizeObjectOfNull(contact);

            // Generate tags
            sanitized.tags =
                generateTimeBasedPrefixedUUID(
                    "campaign"
                );

            // Resolve dynamic fields
            dynamicFields.forEach((field) => {

                const resolver =
                    fieldResolvers[field];

                sanitized[field] = resolver
                    ? resolver(sanitized)
                    : "";
            });

            // Build final row
            const row = {};

            Object.entries(excelColumns).forEach(
                ([dbKey, excelHeader]) => {

                    row[excelHeader] =
                        sanitized[dbKey] ?? "";
                }
            );

            return row;
        });

        // ─────────────────────────────────────────────
        // Export excel
        // ─────────────────────────────────────────────
        const savedPath = await exportData(data, {
            format: "xlsx",
            fileName,
            columns: null,
            headers: null,
            autoDownload: false,
            outputDir: uploadDir,
        });

        // ─────────────────────────────────────────────
        // Download URL
        // ─────────────────────────────────────────────
        const fileUrl =
            `${CAMPAIGN_EXCEL_GENEREATE_LINK}` +
            `${companyDetail.company_masters_id}` +
            `/generate/${savedPath.file_name}`;

        // ─────────────────────────────────────────────
        // Response
        // ─────────────────────────────────────────────
        return resSuccess({
            data: {
                excel_token: fileName,
                total_count: data.length,
                download_url: fileUrl,
            },
        });

    } catch (error) {

        console.error(
            "generateCampaignExcel Error:",
            error
        );

        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: error.message,
        });
    }
};

// ─────────────────────────────────────────────
//  2. CAMPAIGN SENDER
// ─────────────────────────────────────────────
/**
 * Reads the uploaded Excel file, applies variables_mapping to enrich each
 * row, then forwards everything to the external campaign API as multipart/form-data.
 *
 * Incoming multipart fields:
 *   excel_file        – binary  (the Excel file)
 *   name              – string
 *   template_id       – string
 *   template_name     – string
 *   language_code     – string  (e.g. "en_US")
 *   waba_id           – string
 *   recipient_type    – string
 *   export_excel      – string  ("1" / "0" / "true" …)
 *   variables_mapping – JSON string  e.g. {"1":"Phone","2":"mobile",…}
 *   excel_token       – string  (UUID from the generate step)
 *
 * variables_mapping tells us: for template variable slot N → use the Excel
 * column whose header matches that value.
 */
export const campaignSender = async (req) => {
    try {
        const {
            a_application_login_id, description, scheduled_at, name, media_url, excel_download_url, excel_token, language_code, recipient_type, template_id, template_name, variables_mapping, contact_numbers
        } = req.body || {};

        // ── Validate required fields ────────────────────────────────────────
        if (!template_id || !name) {
            return resBadRequest({ ack_msg: "name and template_id are required" });
        }

        const company = await getCompanyByLoginId(a_application_login_id);

        const config = await companyVsWhatsappConfigModel.findOne({
            where: { company_id: company.company_masters_id },
            raw: true,
        });

        if (!config) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company config",
            });
        }

        const { configured_type, plateform, whatsapp_api_key, whatsapp_waba_id } = config;

        const handler = WHATSAPP_SEND_CAMPAIGN_HANDLER?.[configured_type]?.[plateform];
        const axios = WHATSAPP_AXIOS?.[configured_type]?.[plateform];

        if (!handler) {
            return resError({
                ack_msg: "Unsupported configuration",
                developer_msg: `type=${configured_type}, platform=${plateform}`,
            });
        }

        let recipient_file_url = excel_download_url/* 'http://deskflowcrm.com/apk/8fbe2c6b-6cc5-40c9-9bfa-e1582f181001_20260526_161120.xlsx'; */

        const getFileNameFromUrl = (fileUrl) => {
            try {
                const url = new URL(fileUrl);

                // Extract filename from pathname
                const fileName = url.pathname.split("/").pop();

                return fileName;
            } catch (error) {
                return null;
            }
        };

        const newVariables_mapping = Object.keys(variables_mapping).reduce((acc, key) => {
            const value = variables_mapping[key];

            if (value.startsWith("sn_")) {
                const cleaned = value.replace("sn_", "");
                acc[key] = `{{${cleaned}}}`;
            } else {
                acc[key] = value;
            }

            return acc;
        }, {});

        let test_media_url = null;
        if (template_name == 'steel_mortise_gw') {
            test_media_url = 'https://backend.smalloffice.in/media-folder/518/1781526536101.jpeg';
        } else if (template_name == 'thanks_msg_bharatbuildcon') {
            test_media_url = 'https://backend.smalloffice.in/media-folder/518/1781526524930.jpg';
        }

        return await handler({
            template_name,
            language_code,
            name,
            media_url: media_url ? media_url : test_media_url,
            fileName: getFileNameFromUrl(recipient_file_url),
            recipient_type: recipient_type == 'export_excel' ? 'file_url' : recipient_type,
            recipient_file_url: recipient_file_url,
            contact_numbers,
            variables_mapping: newVariables_mapping,
            axios,
            a_application_login_id,
            whatsapp_api_key,
            whatsapp_waba_id,
            description,
            scheduled_at: scheduled_at,
            is_scheduled: scheduled_at ? true : false
        });

    } catch (error) {
        console.error("campaignSender Error:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const campaignUploadMedia = async (req) => {
    try {
        const { a_application_login_id } = req.body;
        const file = req.file;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        let directoryPath;
        if (file) {
            directoryPath = path.join(
                process.cwd(),
                "media-folder",
                "campaign",
                findCompanyId.company_masters_id.toString(),
                "upload-media",
            );
        }

        // File upload logic
        let fileUrl;
        if (file) {
            fs.mkdirp(directoryPath);
            const filePath = file.path;
            const fileName = path.basename(filePath);
            const destinationPath = path.join(directoryPath, fileName);

            await fs.move(filePath, destinationPath);

            fileUrl = `${CAMPAIGN_EXCEL_GENEREATE_LINK}${findCompanyId.company_masters_id}/upload-media/${fileName}`;
        }

        return resSuccess({
            data: {
                url: fileUrl
            }
        });

    } catch (error) {
        console.error("campaignUploadMedia Error:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};