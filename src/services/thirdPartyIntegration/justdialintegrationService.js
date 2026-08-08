import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { generateNumber, isValid, normalizeToTenDigit, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";



export const addContactByjustdialPushApi = async (req, res) => {
    try {
        const lead = req.body;
        if (!lead || !lead.leadid || !lead.mobile) {
            return resError(res, {
                ack_msg: "Invalid JustDial payload",
                developer_msg: "Empty or invalid JustDial data received",
            });
        }

        const { companyCode } = req.params;

        // Find company by QR code
        const companyRecord = await companyModel.findOne({
            where: { qr_code: companyCode, isDelete: "0" },
            attributes: ["id", "qr_code", "a_application_login_id", "company_name"],
        });

        if (!companyRecord) {
            return resError(res, {
                ack_msg: "Invalid company code",
                developer_msg: `No company found with qr_code: ${companyCode}`,
            });
        }

        const tenantId = companyRecord.a_application_login_id;
        const companyIdResult = await getCompanyByLoginId(tenantId);
        const company_masters_id = companyIdResult.company_masters_id;
        let a_company_name;
        let a_company_id;
        a_company_name = companyRecord.company_name;
        a_company_id = companyRecord.id;

        // Set tenant context
        req.headers["x-tenant-id"] = tenantId;
        await new Promise((resolve, reject) => {
            tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        if (!req.tenantDB) {
            return resError(res, { ack_msg: "Tenant DB not initialized" });
        }

        // Tenant Models
        const CTContactModel = contactModel(req.tenantDB);
        const CTInquiryModel = inquiryModel(req.tenantDB);
        const CTContactMessageHistoryModel = contactMessageHistory(req.tenantDB);
        const CTcategoryModel = categoryModel(req.tenantDB);
        const CTCityModel = cityModel(req.tenantDB);
        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);

        // Source Type ID for JustDial
        const SOURCE_TYPE_ID = -19;

        // ==================== CONTACT LIMIT CHECK START ====================
        // ← YEH APNE DB SE CONFIRM KAR LO (contact module ka page_id)
        const contact_id_last = await CTContactModel.findOne({ where: { isDelete: 0 }, order: [['id', 'DESC']] });
        const contactRightsList = await applicationLoginTypeRightModelIntance.findAll({
            where: {
                company_masters_id,
                a_application_login_id: companyIdResult.a_application_login_id,
                page_id: PAGE_ID.CONTACT,
                isDelete: 0,
            },
            attributes: ["a_page_id_rights_jason"],
        });

        const currentContactCount = await CTContactModel.count({
            where: { isDelete: 0 },
        });
        // return
        for (const right of contactRightsList) {
            try {
                let rightsJson = right.a_page_id_rights_jason;
                if (typeof rightsJson === "string") {
                    try {
                        rightsJson = JSON.parse(rightsJson);
                        if (typeof rightsJson === "string") {
                            rightsJson = JSON.parse(rightsJson);
                        }
                    } catch (e) {
                        rightsJson = {};
                    }
                }
                if (typeof rightsJson?.limit === "number" && rightsJson.limit > 0) {
                    if (currentContactCount >= rightsJson.limit) {
                        return resError({
                            ack_msg: `Limit ${rightsJson.limit} reached for Company. Current Contact In Your System: ${currentContactCount}`,
                            developer_msg: `Limit ${rightsJson.limit} reached for Company. Current Contact In Your System: ${currentContactCount}.`,
                        });
                    }
                }
            } catch (err) {
                console.error("Contact rights JSON parse error:", err);
            }
        }
        // ==================== CONTACT LIMIT CHECK END ====================

        // Fetch existing contacts
        const existingContacts = await CTContactModel.findAll({
            where: { isDelete: 0 },
            attributes: ["id", "mobile_number", "column_6"],
        });

        const existingLeadIds = new Set(existingContacts.map(c => String(c.column_6)));
        const existingMobiles = new Set(existingContacts.map(c => String(c.mobile_number).trim()));
        const mobileToContactMap = new Map(existingContacts.map(c => [String(c.mobile_number).trim(), c]));

        // Maps for category, city etc.
        const categories = await CTcategoryModel.findAll({ where: { isDelete: 0 } });
        const cities = await CTCityModel.findAll({ where: { isDelete: 0 } });
        const categoryMap = new Map(categories.map(c => [c.category_name.trim().toLowerCase(), c.id]));
        const cityMap = new Map(cities.map(ct => [ct.city_name.trim().toLowerCase(), ct.id]));

        // Lead data extraction
        const leadId = String(lead.leadid?.trim());
        const mobile = lead.mobile ? normalizeToTenDigit(lead.mobile) : generateNumber(1234567890, contact_id_last.id + 1);
        const name = (lead.name || "Unknown").trim();
        const categoryName = (lead.category || "").trim();
        const cityName = (lead.city || "").trim();
        const area = (lead.area || "").trim();
        const companyName = (lead.company || "").trim();

        // 1. Same LeadID → completely skip
        if (existingLeadIds.has(leadId)) {
            return resSuccess({
                ack_msg: "Lead already exists",
                data: { added: 0, skipped: 1 }
            });
        }

        const cityId = cityMap.get(cityName.toLowerCase()) || "";
        const whatsappEmailSendTeamPersonList = [];
        // Auto assignment
        const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
            source_type_id: SOURCE_TYPE_ID,
            city_id: cityId,
            area_id: "",
            description: categoryName
        });
        const contactAssignedIdsStr = isValid(contactAssignedIds?.data?.assignedIds) ? contactAssignedIds?.data?.assignedIds?.join(",") : "";

        if (contactAssignedIds?.data?.isWhatsappEmailSendEnabled && (contactAssignedIds?.data?.assignedIds?.length == 1 || isValid(contactAssignedIds?.data?.template_id))) {
            whatsappEmailSendTeamPersonList.push(
                {
                    team_id: contactAssignedIdsStr,
                    send_message: contactAssignedIds?.data?.send_description,
                    template_id: contactAssignedIds?.data?.template_id
                }
            )
        }

        let contact;
        let isNewContact = false;
        const contactEmailSendList = [];
        const contactWhatsappSendList = [];

        // 2. Same mobile but different leadId → use existing contact
        if (existingMobiles.has(mobile)) {
            contact = mobileToContactMap.get(mobile);
        } else {
            // Create new contact
            isNewContact = true;
            const contactEntry = {
                column_6: leadId,
                person_name: name,
                mobile_number: mobile,
                raw_mobile_number: lead.mobile || "",
                email_id: lead.email || "",
                address: `${area}, ${cityName}, Mumbai`,
                city: cityName,
                pincode: lead.pincode === "0" ? "" : lead.pincode,
                created_date_time: `${lead.date} ${lead.time}`,
                a_application_login_id: tenantId,
                company_masters_id,
                source_type_id: SOURCE_TYPE_ID,
                assinged_to_work_a_application_id: contactAssignedIdsStr || companyIdResult.a_application_login_id,
                company_name: companyName || "JustDial Lead",
            };

            contact = await CTContactModel.create(contactEntry);
            if (contact) {
                if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactEntry.email_id)) {
                    const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactEntry.assinged_to_work_a_application_id);
                    if (result) {
                        contactEmailSendList.push({
                            email_id: contactEntry.email_id,
                            contact_detail: {
                                person_name: contactEntry.person_name,
                                mobile_number: contactEntry.mobile_number,
                                company_name: contactEntry.company_name
                            },
                            team_person: contactEntry.assinged_to_work_a_application_id,
                            company_name: a_company_name,
                            a_company_id: a_company_id,
                            send_message: result?.send_message,
                        });
                    }
                }
                if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactEntry.mobile_number)) {
                    const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactEntry.assinged_to_work_a_application_id);
                    if (result) {
                        contactWhatsappSendList.push({
                            whatsapp_number: contactEntry.mobile_number,
                            contact_detail: {
                                person_name: contactEntry.person_name,
                                mobile_number: contactEntry.mobile_number,
                                company_name: contactEntry.company_name,
                                customer_id: contact.id
                            },
                            team_person: contactEntry.assinged_to_work_a_application_id,
                            company_name: a_company_name,
                            a_company_id: a_company_id,
                            send_message: result?.send_message,
                            template_id: result?.template_id,
                        });
                    }
                }
                await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
            }
        }

        // Inquiry Entry
        const categoryId = categoryMap.get(categoryName.toLowerCase()) || 0;
        const inquiryEntry = {
            contact_master_id: contact.id,
            category_id: categoryId,
            product_id: 0,
            description: `Inquiry for ${categoryName} in ${area}, ${cityName}`,
            inquiry_date_time: `${lead.date} ${lead.time}`,
            a_application_login_id: tenantId,
            company_masters_id,
            source_type_id: SOURCE_TYPE_ID,
        };
        const createdInquiry = await CTInquiryModel.create(inquiryEntry);

        // Rich Message History with all fields
        const messageHtml = `
            <strong>JustDial Lead</strong><br>
            <strong>Lead ID:</strong> ${leadId}<br>
            <strong>Lead Type:</strong> ${lead.leadtype || ''}<br>
            <strong>Name:</strong> ${lead.prefix || ''}${'.'}${name}<br>
            <strong>Mobile:</strong> ${lead.mobile}<br>
            <strong>Phone:</strong> ${lead.phone || ''}<br>
            <strong>Email:</strong> ${lead.email || ''}<br>
            <strong>Category:</strong> ${categoryName}<br>
            <strong>Area:</strong> ${area}<br>
            <strong>City:</strong> ${cityName}<br>
            <strong>Branch Area:</strong> ${lead.brancharea || ''}<br>
            <strong>Branch Pin:</strong> ${lead.branchpin || ''}<br>
            <strong>Date & Time:</strong> ${lead.date} ${lead.time}<br>
            <strong>DNC Mobile:</strong> ${lead.dncmobile || ''}<br>
            <strong>DNC Phone:</strong> ${lead.dncphone || ''}<br>
            <strong>Parent ID:</strong> ${lead.parentid || ''}
        `;
        //   <strong>Prefix:</strong> ${lead.prefix || ''}<br></br>
        await CTContactMessageHistoryModel.create({
            contact_masters_id: contact.id,
            a_application_login_id: tenantId,
            company_masters_id,
            description: messageHtml,
            created_date_time: `${lead.date} ${lead.time}`,
            message_side: "2",
            message_type_id: "0",
        });

        // Status logs
        if (isNewContact) {
            await insertStagesAndStatusLogs(req, {
                reference_table: "contact_masters",
                reference_id: contact.id,
                status_id: "-1",
                a_application_login_id: tenantId,
            });
        }

        await insertStagesAndStatusLogs(req, {
            reference_table: "inquiries",
            reference_id: createdInquiry.id,
            status_id: "-2",
            a_application_login_id: tenantId,
        });

        // Notification
        try {
            const ownerLogins = await companyVsApplicationLoginModel.findAll({
                where: { company_masters_id, company_flag: 1, isDelete: 0 },
                attributes: ["a_application_login_id"],
            });

            const loginIds = ownerLogins
                .map(o => o.a_application_login_id)
                .filter(id => id !== tenantId);

            if (loginIds.length > 0) {
                const tokensData = await loginModel.findAll({
                    where: { id: loginIds, isDelete: 0 },
                    attributes: ["android_refresh_token", "web_refresh_token", "ios_refresh_token"],
                });

                const tokens = [...new Set(
                    tokensData.flatMap(t => [
                        t.android_refresh_token,
                        t.web_refresh_token,
                        t.ios_refresh_token
                    ].filter(Boolean))
                )];

                if (tokens.length > 0) {
                    await sendMultipleNotification({
                        deviceTokens: tokens,
                        title: "New JustDial Lead",
                        body: `${isNewContact ? "New" : "Follow-up"} lead from JustDial - ${name}`,
                    });
                }
            }
        } catch (notifyErr) {
            console.error("JustDial Notification Failed:", notifyErr.message);
        }

        return resSuccess({
            ack_msg: "success",
            developer_msg: "success",
            data: {

            }
            // data: {
            //     added: isNewContact ? 1 : 0,
            //     followed_up: isNewContact ? 0 : 1,
            //     contact_id: contact.id
            // }
        });

    } catch (error) {
        console.error("JustDial API Error:", error);
        return resBadRequest(res, {
            ack_msg: "Internal server error",
            developer_msg: error.message,
        });
    }
};