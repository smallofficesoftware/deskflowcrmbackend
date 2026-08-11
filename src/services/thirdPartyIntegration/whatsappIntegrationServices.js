import moment from "moment";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import {
    isValid,
    normalizeToTenDigit,
    parseSession,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, getLoginDetailById, insertStagesAndStatusLogs } from "../commonServices.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";

export const addContactMessageFromWhatsApp = async (req, res) => {
    const payload = req.body;
    const { a_application_login_id } = parseSession(payload?.sessionName);
    let description = payload?.text?.trim();
    if (!description) {
        return resError({
            ack_msg: "Message cannot be empty",
            developer_msg: "Message cannot be empty",
        });
    }
    const senderContactNumber = payload?.from.replace("@s.whatsapp.net", "").replace("@c.us", "").split(":")[0];
    const receiverContactNumber = payload?.to.replace("@s.whatsapp.net", "").replace("@c.us", "").split(":")[0];
    console.log("receiverContactNumber", receiverContactNumber);
    if (!senderContactNumber || !receiverContactNumber) {
        return resError({
            ack_msg: "Sender and receiver numbers are required",
            developer_msg: "Sender and receiver numbers are required",
        });
    }
    const senderDateTimeFormattedDate = moment(payload?.timestamp).format("YYYY-MM-DD HH:mm:ss");
    try {
        /* const resultFindApplicationLoginId = await loginModel.findOne({
            where: {
                [Op.or]: [
                    {
                        recovery_mobile: {
                            [Op.like]: "%" + receiverContactNumber.substring(2) + "%",
                        },
                    },
                ],
                isDelete: "0",
            },
            attributes: ["id"],
        });
        if (!resultFindApplicationLoginId) {
            return resError({
                ack_msg: "Application login id not found",
                developer_msg: "Application login id not found",
            });
        }
        let a_company_name;
        let a_company_id;
        const findCompanyId = await getCompanyByLoginId(
            resultFindApplicationLoginId.id
        ); */

        let a_company_name;
        let a_company_id;
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        const findIndiaMartApiKey = await companyModel.findOne({
            where: {
                id: findCompanyId.company_masters_id,
                isDelete: "0",
            },
            attributes: ["id", "company_name"],
        });


        a_company_name = findIndiaMartApiKey.dataValues.company_name;
        a_company_id = findIndiaMartApiKey.dataValues.id;
        const application_login_name = await getLoginDetailById(a_application_login_id)
        const CTContactModelModel = await contactModel(req.tenantDB);
        const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
        const normalizedSenderLast10 = normalizeToTenDigit(senderContactNumber)
        const resultContact = await CTContactModelModel.findOne({
            where: {
                isDelete: "0",
                mobile_number: normalizedSenderLast10,
                company_masters_id: findCompanyId.company_masters_id,
            },
            attributes: ["id", "sync_whatsapp"],
        });
        let createdItem;
        const CTContactMessageHistoryModel = await contactMessageHistory(req.tenantDB);
        if (resultContact) {
            if (resultContact.sync_whatsapp == 1) {
                const parsedData = {
                    description,
                    entry_flag: "1",
                    company_masters_id: findCompanyId.company_masters_id,
                    a_application_login_id: a_application_login_id,
                    contact_masters_id: resultContact.id,
                    message_side: payload?.direction === "outgoing" ? "1" : "2",
                    created_date_time: senderDateTimeFormattedDate,
                    application_login_name: application_login_name.username
                };
                createdItem = await CTContactMessageHistoryModel.create(parsedData);
                const ContactMaster = contactModel(req.tenantDB);
                const updateUnread = await ContactMaster.update(
                    {
                        is_read_by_a_application_login_id: "",
                    },
                    {
                        where: {
                            id: resultContact.id,
                        },
                    }
                );
            }

        } else {
            if (senderContactNumber === receiverContactNumber) {
                return resError({
                    ack_msg: "Sender and receiver numbers cannot be the same",
                    developer_msg: "Sender and receiver numbers cannot be the same",
                });
            }
            if (payload?.direction === "outgoing") {
                return resSuccess({
                    developer_msg: "This message will not be stored",
                    ack_msg: "This message will not be stored",
                });
            }
            const whatsappEmailSendTeamPersonList = [];

            /* Contact Assignement */
            const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
                source_type_id: "-4",
                country_id: null,
                state_id: null,
                city_id: null,
                area_id: null,
                description: description
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
            /* Contact Assignement */
            const contactBody = {
                mobile_number: normalizedSenderLast10,
                raw_mobile_number: senderContactNumber || "",
                person_name: payload?.fromName || "Unknown",
                a_application_login_id: a_application_login_id,
                company_masters_id: findCompanyId.company_masters_id,
                created_date_time: senderDateTimeFormattedDate,
                source_type_id: -4,
                sync_whatsapp: 0,
                assinged_to_work_a_application_id: contactAssignedIdsStr || a_application_login_id
            };
            const userList = await CTContactModelModel.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    isDelete: 0,
                },
                attributes: ["company_masters_id", "a_application_login_id"],
            });
            const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
                where: {
                    company_masters_id: findCompanyId.company_masters_id,
                    page_id: 1,
                    isDelete: 0,
                },
                attributes: ["a_application_login_id", "a_page_id_rights_jason"],
            });
            const userCount = userList.length;
            for (const userRight of userRightsList) {
                try {
                    const rightsJson = JSON.parse(
                        userRight.dataValues.a_page_id_rights_jason
                    );
                    if (typeof rightsJson.limit === "number") {
                        if (rightsJson.limit > 0 && userCount >= rightsJson.limit) {
                            return resError({
                                ack_msg: `Your Contacts Limit Exceeded`,
                                developer_msg: `Limit ${rightsJson.limit} reached for Company`,
                            });
                        }
                    }
                } catch (err) {
                    console.error(
                        "Error parsing JSON for a_application_login_id:",
                        userRight.a_application_login_id,
                        err
                    );
                }
            }
            const newContact = await CTContactModelModel.create(contactBody);
            if (isValid(newContact.dataValues.id)) {
                const contactEmailSendList = [];
                const contactWhatsappSendList = [];
                if (isValid(whatsappEmailSendTeamPersonList) && isValid(normalizedSenderLast10)) {
                    const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactAssignedIdsStr);
                    if (result) {
                        contactWhatsappSendList.push({
                            whatsapp_number: normalizedSenderLast10,
                            contact_detail: {
                                person_name: payload?.fromName,
                                mobile_number: normalizedSenderLast10,
                                company_name: "",
                                customer_id: newContact.dataValues.id
                            },
                            team_person: contactAssignedIdsStr,
                            company_name: a_company_name,
                            a_company_id: a_company_id,
                            send_message: result?.send_message,
                            template_id: result?.template_id,
                        });
                    }
                }
                await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
                /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
                await insertStagesAndStatusLogs(req,
                    {
                        reference_table: "contact_masters",
                        reference_id: newContact.dataValues.id,
                        status_id: "-1",
                        a_application_login_id: a_application_login_id
                    }
                );
                /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
            }
            const parsedData = {
                description,
                entry_flag: "1",
                company_masters_id: findCompanyId.company_masters_id,
                a_application_login_id: a_application_login_id,
                contact_masters_id: newContact.dataValues.id,
                message_side: payload?.direction === "outgoing" ? "1" : "2",
                created_date_time: senderDateTimeFormattedDate,
                application_login_name: application_login_name.username
            };
            createdItem = await CTContactMessageHistoryModel.create(parsedData);
            const ContactMaster = contactModel(req.tenantDB);
            const updateUnread = await ContactMaster.update(
                {
                    is_read_by_a_application_login_id: "",
                },
                {
                    where: {
                        id: newContact.dataValues.id,
                    },
                }
            );
        }
        return resSuccess({
            data: { item: createdItem },
        });
    } catch (error) {
        console.error("Error processing message:", error);
        return res
            .status(500)
            .json({ message: "Internal server error", error: error.message });
    }
};

export const getPermissionForWhatsAppMessage = async (req, res) => {
    try {
        const { a_application_login_id } = req.body;
        const result = await applicationLoginTypeRightModel.findOne({
            where: {
                a_application_login_id: a_application_login_id,
                page_id: 1,
                isDelete: 0,
            },
            attributes: ["a_page_id_rights_jason"],
        });
        if (result) {
            let rightsJson = result.dataValues.a_page_id_rights_jason;
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
            return resSuccess({ data: rightsJson || {} });
        } else {
            return resSuccess({ data: {} });
        }
    } catch (error) {
        console.error("Error processing message:", error);
        return res
            .status(500)
            .json({ message: "Internal server error", error: error.message });
    }
};