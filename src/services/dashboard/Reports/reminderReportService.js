import moment from "moment";
import { Op } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { reminderMessagesModel } from "../../../models/activities/reminderMessagesModel.js";
import { getCompanyByLoginId, getLoginDetailById } from "../../../services/commonServices.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const getTeamReminderReport = async (req) => {
    try {
        const {
            a_application_login_id,
            ll,
            ul,
            selectedDates = [],
            selectedTeamMembers = [],
            globalSearch = "",
            selectedContactId
        } = req.body;

        // ────────────────────────────────────────────────
        // Date range filter
        // ────────────────────────────────────────────────
        let dateFilter = {};
        if (selectedDates.length === 2) {
            const startDate = moment(selectedDates[0]).startOf('day').toDate();
            const endDate = moment(selectedDates[1]).endOf('day').toDate();

            dateFilter = {
                reminder_data_time: {
                    [Op.between]: [startDate, endDate],
                },
            };
        }

        // ────────────────────────────────────────────────
        // Global full-text search
        // ────────────────────────────────────────────────
        let fullTextSearchCondition = {};
        if (globalSearch.trim()) {
            const searchLike = `%${globalSearch.trim()}%`;

            fullTextSearchCondition = {
                [Op.or]: [
                    { remark: { [Op.like]: searchLike } },
                    // Add other text fields if needed, e.g.:
                    // { assigned_to_name: { [Op.like]: searchLike } },
                ]
            };
        }

        // ────────────────────────────────────────────────
        // Pagination
        // ────────────────────────────────────────────────
        const limit = Number(ll) || 20;
        const offset = Number(ul) || 0;

        // ────────────────────────────────────────────────
        // Company & data rights
        // ────────────────────────────────────────────────
        const companyInfo = await getCompanyByLoginId(a_application_login_id);
        const companyId = companyInfo.company_masters_id;

        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: companyId,
            a_application_login_id: a_application_login_id,
            page_id: PAGE_ID.REMINDER,   // ← change to correct page id if different
            tenentId: req.tenantDB
        });

        let whereClause = {
            isDelete: 0,
            is_reminder_app_flag: 0
        };

        if (showAllData) {
            whereClause.company_masters_id = companyId;
        } else if (showPersonalData) {
            whereClause.a_application_login_id = a_application_login_id;
        } else {
            // No rights → return empty
            return resSuccess({
                data: { data: [] },
                ack_msg: "No data access rights",
            });
        }

        // Filter by assigned team members (if provided)
        if (Array.isArray(selectedTeamMembers) && selectedTeamMembers.length > 0) {
            whereClause.assigned_to = {
                [Op.in]: selectedTeamMembers.map(String),   // assuming IDs are strings/numbers
            };
        }
        if (selectedContactId && referenceWiseContact == 1) {

            whereClause.contact_masters_id = selectedContactId;

        } else if (selectedContactId && referenceWiseContact == 2) {

            const Contact = contactModel(req.tenantDB);

            const findreffrancewiseContact = await Contact.findAll({
                where: {
                    referance_contact: selectedContactId,
                    isDelete: 0,
                },
                attributes: ["id"],
                raw: true,
            });

            const contactIds = findreffrancewiseContact.map(
                (item) => item.id
            );

            whereClause.contact_masters_id = {
                [Op.in]: contactIds,
            };
        }

        // ────────────────────────────────────────────────
        // Fetch reminders
        // ────────────────────────────────────────────────
        const reminderModel = reminderMessagesModel(req.tenantDB);   // ← your reminder table model

        const remindersRaw = await reminderModel.findAll({
            where: {
                ...whereClause,
                ...dateFilter,
                ...fullTextSearchCondition,
            },
            order: [["created_date_time", "DESC"]],   // or ["id", "DESC"]
            limit,
            offset,
            raw: true,   // we'll enrich manually
        });

        // ────────────────────────────────────────────────
        // Enrich data: contact name, username, status text
        // ────────────────────────────────────────────────
        const enrichedReminders = await Promise.all(
            remindersRaw.map(async (reminder) => {
                let contactName = "";
                if (reminder.contact_masters_id) {
                    const contact = await contactModel(req.tenantDB).findOne({
                        where: { id: reminder.contact_masters_id, isDelete: 0 },
                        attributes: ["person_name"],   // or full_name, name, etc.
                        raw: true,
                    });
                    contactName = contact?.person_name || `ID ${reminder.contact_masters_id}`;
                }

                let createdByName = "";
                if (reminder.a_application_login_id) {
                    const user = await getLoginDetailById(reminder.a_application_login_id);
                    createdByName = user?.username || `ID ${reminder.a_application_login_id}`;
                }

                // Status logic (as per your description)
                let statusText = "Due";
                if (reminder.status === 1) {
                    statusText = "Completed";
                }

                return {
                    ...reminder,

                    // Enriched fields
                    contact_name: contactName,
                    created_by_username: createdByName,        // or created_by_name
                    status_display: statusText,

                    // Keep original dates (frontend can format)
                    reminder_data_time: reminder.reminder_data_time,
                    completed_date_time: reminder.completed_date_time || null,

                    // Optional – already in DB
                    assigned_to_name: reminder.assigned_to_name || null,
                    remark: reminder.remark || "",
                };
            })
        );

        return resSuccess({
            data: {
                data: enrichedReminders,
                total: enrichedReminders.length,   // or run separate count query if needed
            },
            ack_msg: "Reminder report fetched successfully",
        });

    } catch (error) {
        console.error("getTeamReminderReport error:", error);
        return resError({
            developer_msg: error.message || "Internal server error",
            ack_msg: "Failed to fetch reminder report",
        });
    }
};