import moment from "moment";
import nodemailer from "nodemailer";
import { Op, Sequelize } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { wrkflwAutoAssignmentContactModel } from "../../models/other_settings/wrkflwAutoAssignmentContactModel.js";
import {
    isValid,
    resBadRequest,
    resError,
    resSuccess
} from "../../utils/sharedFunctions.js";
import { contactAssignSendMessage } from "../whatsapp/whatsappService.js";


export const insertAutoAssignmentContactDetail = async (req) => {
    try {
        const wrkflwAutoAssignmentContactModelInstance = wrkflwAutoAssignmentContactModel(req.tenantDB);
        const { source_type_id, country_id, state_id, city_id, area_id, template_id, team_person_ids, a_application_login_id, text_match_description, auto_sequence_flag, is_whatsapp_email_send_flag, send_description } = req.body;
        if (!isValid(source_type_id)) {
            return resError({
                ack_msg: "Source is blank",
                developer_msg: `source_type_id not found`
            });
        }
        if (!isValid(team_person_ids)) {
            return resError({
                ack_msg: "Team Person is blank",
                developer_msg: `team_person_ids not found`
            });
        }
        const currentDateTime = new Date();
        const created_date_time = moment(currentDateTime).format("YYYY-MM-DD HH:mm:ss");

        const uniqueIds = [...new Set(team_person_ids)];
        let whereCondition = { source_type_id, isDelete: 0 };

        if (country_id) {
            whereCondition.country_id = country_id;

            if (state_id) {
                whereCondition.state_id = state_id;

                if (city_id) {
                    whereCondition.city_id = city_id;

                    if (area_id) {
                        whereCondition.area_id = area_id;
                    }
                }
            }
        }

        whereCondition.team_person_id = uniqueIds;

        // Fetch existing records with this combination
        const existingRecords = await wrkflwAutoAssignmentContactModelInstance.findAll({
            attributes: ['team_person_id'],
            where: whereCondition,
            raw: true,
        });

        const existingIds = existingRecords.map((r) => r.team_person_id);
        const newIds = uniqueIds.filter((id) => !existingIds.includes(id));

        const insertList = newIds.map((team_person_id) => ({ source_type_id, country_id, state_id, city_id, area_id, template_id, team_person_id, created_date_time, text_match_description, auto_sequence_flag, is_whatsapp_email_send_flag, send_description }))
        if (insertList.length > 0) {
            const createdEntry = await wrkflwAutoAssignmentContactModelInstance.bulkCreate(insertList);
            if (isValid(createdEntry)) {
                return resSuccess({
                    message: "Assignment detail successfully added.",
                    data: {
                        isDuplicate: isValid(existingIds) ? 1 : 0,
                        duplicate_msg: "Duplicate Data are skiped."
                    }
                });
            } else {
                return resError({
                    ack_msg: "Assignment detail failed.",
                    developer_msg: `database error.`,
                });
            }
        } else {
            return resError({
                ack_msg: "Detail is not valid",
                developer_msg: `insertList array list not creating`,
                data: {
                    isDuplicate: isValid(existingIds) ? 1 : 0,
                    duplicate_msg: "Duplicate Data are skiped."
                }
            });
        }
    } catch (error) {
        console.log("insertAutoAssignmentContactDetail error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const fetchAutoAssignmentContactDetail = async (req) => {
    try {
        const { tenantDB } = req;
        const wrkflwAutoAssignmentContactModelInstance = wrkflwAutoAssignmentContactModel(tenantDB);

        const getData = await wrkflwAutoAssignmentContactModelInstance.findAll({
            where: { isDelete: 0 },
            attributes: {
                include: [
                    [
                        Sequelize.literal(
                            "(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = wrkflw_auto_assignment_of_contacts.country_id AND a_countries.isDelete=0)"
                        ),
                        "country_name"
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT source_types.source_name FROM source_types WHERE source_types.id = wrkflw_auto_assignment_of_contacts.source_type_id AND source_types.isDelete=0)"
                        ),
                        "source_name"
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT a_states.state_name FROM a_states WHERE a_states.id = wrkflw_auto_assignment_of_contacts.state_id AND a_states.isDelete=0)"
                        ),
                        "state_name"
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = wrkflw_auto_assignment_of_contacts.city_id AND a_cities.isDelete=0)"
                        ),
                        "city_name"
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT a_areas.area_name FROM a_areas WHERE a_areas.id = wrkflw_auto_assignment_of_contacts.area_id AND a_areas.isDelete=0)"
                        ),
                        "area_name"
                    ],
                    [
                        Sequelize.literal(
                            "(SELECT smalloffice.a_application_logins.username FROM smalloffice.a_application_logins WHERE smalloffice.a_application_logins.id = wrkflw_auto_assignment_of_contacts.team_person_id AND smalloffice.a_application_logins.isDelete=0)"
                        ),
                        "team_person_name"
                    ],
                    [
                        Sequelize.literal(`DATE_FORMAT(created_date_time, '%d-%m-%Y %h:%i %p')`), 'created_at_formatted'
                    ]
                ],
            },
            raw: true
        });

        if (isValid(getData)) {
            return resSuccess({
                ack_msg: "Assignment detail successfully get.",
                data: getData,
            });
        } else {
            return resError({
                ack_msg: "Assignment detail not failed.",
                developer_msg: `database error.`
            });
        }
    } catch (error) {
        console.log("fetchAutoAssignmentContactDetail error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

/**
 * 
 * @param {*} req - Express request object
 * @param {*} requiredDetail - Object containing optional filters
 * @param {number} [requiredDetail.source_type_id] - Source type ID
 * @param {number} [requiredDetail.country_id] - Country ID
 * @param {number} [requiredDetail.state_id] - State ID
 * @param {number} [requiredDetail.city_id] - City ID
 * @param {number} [requiredDetail.area_id] - Area ID
 * @param {text} [requiredDetail.description] - Description
 *  @returns {Promise<Object[]>} Array of contact objects
 */
export const autoAssignmentContactIdsGet = async (req, requiredDetail = {}) => {
    const sequelize = req.tenantDB;

    try {
        const { source_type_id, country_id, state_id, city_id, area_id, description } = requiredDetail;

        if (!isValid(source_type_id)) {
            return resError({
                ack_msg: "Source Not Found.",
                developer_msg: `source_type_id not found.`
            });
        }

        let whereCondition = {
            source_type_id,
            isDelete: 0,
        };

        if (country_id) whereCondition.country_id = country_id;
        if (state_id) whereCondition.state_id = state_id;
        if (city_id) whereCondition.city_id = city_id;
        if (area_id) whereCondition.area_id = area_id;

        if (isValid(description)) {
            whereCondition[Op.and] = [
                Sequelize.literal(
                    `${sequelize.escape(description)} 
                    REGEXP CONCAT('\\\\b(', 
                    REPLACE(\`text_match_description\`, ',', '|'), 
                    ')\\\\b')`
                )
            ];
        }

        const keysPriority = ["area_id", "city_id", "state_id", "country_id"];

        async function findRecursive(whereCond, keys) {
            const Model = wrkflwAutoAssignmentContactModel(sequelize);

            const data = await Model.findAll({
                where: whereCond,
                attributes: ["id", "team_person_id", "auto_sequence_flag", "is_recurred"],
                raw: true,
            });

            if (data.length > 0) {
                return { data, whereUsed: whereCond };
            }

            if (keys.length === 0) {
                return { data: [], whereUsed: whereCond };
            }

            const nextKeys = [...keys];
            const keyToRemove = nextKeys.shift();
            const newWhere = { ...whereCond };
            delete newWhere[keyToRemove];

            return findRecursive(newWhere, nextKeys);
        }

        const result = await findRecursive(whereCondition, keysPriority);

        if (!result.data.length) {
            return resSuccess({ data: [] });
        }

        // TRANSACTION START (Bulk Safe)
        return await sequelize.transaction(async (t) => {

            const Model = wrkflwAutoAssignmentContactModel(sequelize);

            // LOCK rows (SELECT ... FOR UPDATE)
            let teamData = await Model.findAll({
                where: result.whereUsed,
                attributes: ["id", "team_person_id", "auto_sequence_flag", "is_recurred", "template_id", "is_whatsapp_email_send_flag", "send_description"],
                order: [["id", "ASC"]],
                lock: t.LOCK.UPDATE,
                transaction: t,
                raw: true
            });

            let send_description = '';
            let template_id = '';
            const isAutoSequenceEnabled = teamData.some(
                (t) => t.auto_sequence_flag == 1
            );
            const isWhatsappEmailSendEnabled = teamData.some(
                (t) => t.is_whatsapp_email_send_flag == 1
            );

            let assignedIds = [];

            if (isAutoSequenceEnabled) {

                let nextPerson = teamData.find(
                    (t) => t.auto_sequence_flag == 1 && t.is_recurred == 0
                );

                // If all assigned → reset
                if (!nextPerson) {

                    await Model.update(
                        { is_recurred: 0 },
                        {
                            where: {
                                ...result.whereUsed,
                                auto_sequence_flag: 1
                            },
                            transaction: t
                        }
                    );

                    // pick first again
                    nextPerson = teamData.find(
                        (t) => t.auto_sequence_flag == 1
                    );
                }

                if (nextPerson) {

                    assignedIds = [nextPerson.team_person_id];
                    send_description = nextPerson.send_description
                    template_id = nextPerson.template_id
                    await Model.update(
                        { is_recurred: 1 },
                        {
                            where: { id: nextPerson.id },
                            transaction: t
                        }
                    );
                }

            } else {
                // No auto-sequence → assign all
                assignedIds = teamData.map((t) => t.team_person_id);
                send_description = teamData.map((t) => t.send_description).filter(Boolean)[0];
                template_id = teamData.map((t) => t.template_id).filter(Boolean)[0];
            }

            return resSuccess({ data: { assignedIds, isWhatsappEmailSendEnabled, send_description, template_id } });
        });

    } catch (error) {
        console.log("autoAssignmentContactIdsGet error", error);
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};

export const prepareMailAndWhatsappSenderToTheContact = async (req, d) => {
    const { contactWhatsappSendList, contactEmailSendList } = d;
    if (isValid(contactEmailSendList)) {
        for (let index = 0; index < contactEmailSendList.length; index++) {
            const element = contactEmailSendList[index];
            if (element.team_person) {
                const getTeamPersonDetail = await loginModel.findOne(
                    {
                        where: {
                            isDelete: 0,
                            id: element.team_person,
                            host_out_going_mail: { [Op.ne]: '' },
                            port_mail_setup: { [Op.ne]: '' },
                            mail_id_setup: { [Op.ne]: '' },
                            password_mail_setup: { [Op.ne]: '' },
                        },
                        attributes: ["host_out_going_mail", "port_mail_setup", "mail_id_setup", "password_mail_setup", "username", "recovery_mobile"],
                        raw: true
                    }
                )
                if (getTeamPersonDetail && element.email_id) {
                    const res = await sendContactMailThroughTeamPerson({
                        host_out_going_mail: getTeamPersonDetail.host_out_going_mail,
                        port_mail_setup: getTeamPersonDetail.port_mail_setup,
                        mail_id_setup: getTeamPersonDetail.mail_id_setup,
                        password_mail_setup: getTeamPersonDetail.password_mail_setup,
                        username: getTeamPersonDetail.username,
                        recovery_mobile: getTeamPersonDetail.recovery_mobile,
                        contact_detail: element.contact_detail,
                        contact_email_id: element.email_id,
                        company_name: element.company_name,
                        send_message: element.send_message,
                    });

                    console.log("sendContactMailThroughTeamPerson RES", res)
                }
            }
        }
    }
    if (isValid(contactWhatsappSendList)) {
        for (let index = 0; index < contactWhatsappSendList.length; index++) {
            const element = contactWhatsappSendList[index];
            if (element.team_person) {
                const getTeamPersonDetail = await loginModel.findOne(
                    {
                        where: {
                            isDelete: 0,
                            id: element.team_person
                        },
                        attributes: ["username", "recovery_mobile"],
                        raw: true
                    }
                )
                if (getTeamPersonDetail) {
                    const res = await sendContactWhatsappThroughTeamPerson(req, {
                        recovery_mobile: getTeamPersonDetail.recovery_mobile,
                        username: getTeamPersonDetail.username,
                        team_person: element.team_person,
                        a_company_id: element.a_company_id,
                        contact_detail: element.contact_detail,
                        company_name: element.company_name,
                        send_message: element.send_message,
                        template_id: element.template_id
                    });

                    console.log("sendContactWhatsappThroughTeamPerson RES", res)
                }
            }
        }
    }
}

const sendContactMailThroughTeamPerson = async (d) => {
    const {
        host_out_going_mail,
        port_mail_setup,
        mail_id_setup,
        password_mail_setup,
        username,
        recovery_mobile,
        contact_detail,
        contact_email_id,
        company_name,
        send_message
    } = d;

    /* ---- Email Setup For Sending Mail Added by Dinesh -- 13-02-2026 */
    const transporter = nodemailer.createTransport({
        host: host_out_going_mail,
        port: port_mail_setup,
        secure: true,
        auth: {
            user: mail_id_setup,
            pass: password_mail_setup,
        },
    });

    try {
        await transporter.verify();

        let customer_name;
        if (contact_detail?.person_name) {
            customer_name = `${contact_detail?.person_name}`;
        }
        if (contact_detail?.company_name) {
            customer_name += ` (${contact_detail?.company_name})`;
        }
        const mailOptionsAdmin = {
            from: mail_id_setup,
            to: contact_email_id,
            subject: "Thank You for Your Inquiry",
            html: `<p>Dear ${customer_name || "Customer"},</p>
                <p>${send_message}</p>
                <p>
                Best Regards,<br>
                ${username}<br>
                ${recovery_mobile}<br>
                ${company_name}
                </p>`
        };

        const info = await transporter.sendMail(mailOptionsAdmin);

        if (info.accepted && info.accepted.length > 0) {
            return resSuccess({
                ack_msg: "Email sent successfully",
                data: {
                    messageId: info.messageId,
                    accepted: info.accepted,
                    success: true,
                }
            });
        }

    } catch (err) {
        console.log("sendContactMailThroughTeamPerson Error with email transport or sending:", err);
        return resError({
            data: err.message
        });
    }
    /* ---- Email Setup For Sending Mail Added by Dinesh -- 13-02-2026 */
}

function normalizeIndiaPrefixMinimal(rawNumber) {
    if (!rawNumber) return rawNumber;
    const digits = rawNumber.replace(/\D/g, '');
    return digits.length === 10 ? `91${digits}` : digits;
}

const sendContactWhatsappThroughTeamPerson = async (req, d) => {
    const { team_person, a_company_id, contact_detail, send_message, template_id, recovery_mobile, username, company_name } = d
    const basePayload = {
        sessionName: `a${team_person}_c${a_company_id}`,
        numbers: [normalizeIndiaPrefixMinimal(contact_detail?.mobile_number)],
        a_application_login_id: team_person,
        customer_person_name: contact_detail?.person_name,
        customer_company_name: contact_detail?.company_name,
        customer_id: contact_detail?.customer_id,
        template_id: template_id
    };
    basePayload.text = `${send_message}\n\nBest Regards,\n*${username}*\n\n${recovery_mobile}\n*${company_name}*`
    try {
        const response = await contactAssignSendMessage(req, basePayload);
        return resSuccess({
            ack: 1,
            data: { response: response },
            developer_msg: "Message sent to whatsapp successfully",
        });
    } catch (error) {
        console.log("Failed to send message using WPPConnect: ", error?.response?.data?.error || error?.response?.data?.message);
        return resError({
            data: { error: error?.response?.data?.error || error?.response?.data?.message },
            developer_msg: "WhatsApp is not connected",
        });
    }
}

export const updateWhatappTemplateID = async (req) => {
    try {
        const { source_type_id, template_id } = req.body;
        const wrkflwAutoAssignmentContactModelIntance = wrkflwAutoAssignmentContactModel(req.tenantDB);

        const updated = await wrkflwAutoAssignmentContactModelIntance.update({ template_id }, { where: { isDelete: 0, source_type_id } });
        if (!updated) {
            return resError({
                ack_msg: "Workflow not update.",
                developer_msg: `Database error.`
            });
        }

        return resSuccess({ data: updated });
    } catch (error) {
        console.log("updateWhatappTemplateID error", error)
        return resBadRequest({ developer_msg: `error ${error}` });
    }
};