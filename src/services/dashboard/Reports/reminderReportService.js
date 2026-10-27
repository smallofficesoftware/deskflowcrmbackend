import moment from "moment";
import Sequelize, { Op } from "sequelize";
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
            selectedContactId,
            referenceWiseContact = 1,
            typeFilter = "due",
            viewScope, // "all" | "my" - explicit scope toggle, same idea as Task Management's All/My
            // Label filter (ids of the contact's labels; -9999 = contacts with no label) and sort by label.
            labelFilter,
            sortBy,
            sortOrder,
        } = req.body;

        // ────────────────────────────────────────────────
        // Date range filter
        // ────────────────────────────────────────────────
        const baseDateConditions = [];
        if (selectedDates.length === 2) {
            const startDate = moment(selectedDates[0]).startOf('day').toDate();
            const endDate = moment(selectedDates[1]).endOf('day').toDate();
            baseDateConditions.push({
                reminder_data_time: {
                    [Op.between]: [startDate, endDate],
                },
            });
        }

        // ────────────────────────────────────────────────
        // Label filter: the reminder's CONTACT has any of the chosen labels (-9999 = no label at all).
        // Added to the same list as the date range, so the counts follow it too.
        // ────────────────────────────────────────────────
        const labelIds = (Array.isArray(labelFilter) ? labelFilter : [])
            .map(Number)
            .filter((n) => Number.isInteger(n));
        if (labelIds.length > 0) {
            const parts = labelIds
                .filter((id) => id !== -9999)
                .map((id) => `FIND_IN_SET(${id}, contact_masters.lable) > 0`);
            if (labelIds.includes(-9999)) parts.push("(contact_masters.lable IS NULL OR contact_masters.lable = '')");
            baseDateConditions.push(
                Sequelize.literal(
                    `reminder_messages.contact_masters_id IN (SELECT contact_masters.id FROM contact_masters WHERE contact_masters.isDelete = 0 AND (${parts.join(" OR ")}))`
                )
            );
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

        // "All"/"My" toggle (feature request: same as Task Management's
        // All/My buttons). "My" always means own+assigned, even for someone
        // with all-data rights - matches Task's taskFilter===2. "All" asks
        // for company-wide, still capped by showAllData. No toggle sent
        // (older callers) keeps the rights-only default unchanged.
        const wantsAllData = viewScope === "my" ? false : showAllData;

        // own OR assigned-to-me — matches crm-insight's totalReminderCount
        // definition (buildAccessAnd's ownerOrAssigned). Previously only checked
        // a_application_login_id (creator), so a reminder someone else created
        // and assigned to this login silently never showed up here even though
        // the Insight card counted it.
        const personalScope = {
            [Op.or]: [
                { a_application_login_id: a_application_login_id },
                { assigned_to: a_application_login_id },
            ],
        };

        let baseWhereClause = {
            isDelete: 0,
            is_reminder_app_flag: 0
        };

        if (wantsAllData) {
            baseWhereClause.company_masters_id = companyId;
        } else if (showPersonalData || viewScope === "my") {
            baseWhereClause.company_masters_id = companyId;
            Object.assign(baseWhereClause, personalScope);
        } else {
            // No rights → return empty
            return resSuccess({
                data: { data: [], counts: { due: 0, future: 0, complete: 0, all: 0, my: 0 }, can_see_all_data: showAllData },
                ack_msg: "No data access rights",
            });
        }

        // Filter by assigned team members (if provided)
        if (Array.isArray(selectedTeamMembers) && selectedTeamMembers.length > 0) {
            baseWhereClause.assigned_to = {
                [Op.in]: selectedTeamMembers.map(String),   // assuming IDs are strings/numbers
            };
        }
        if (selectedContactId && referenceWiseContact == 1) {

            baseWhereClause.contact_masters_id = selectedContactId;

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

            baseWhereClause.contact_masters_id = {
                [Op.in]: contactIds,
            };
        }

        const currentDate = new Date();
        let whereClause = { ...baseWhereClause };
        const andConditions = [...baseDateConditions];

        if (typeFilter === "due") {
            andConditions.push({
                status: { [Op.ne]: 1 },
                reminder_data_time: { [Op.lt]: currentDate },
            });
        } else if (typeFilter === "future") {
            andConditions.push({
                status: { [Op.ne]: 1 },
                completed_date_time: { [Op.or]: [null, ""] },
                reminder_data_time: { [Op.gt]: currentDate },
            });
        } else if (typeFilter === "complete") {
            andConditions.push({
                status: 1,
            });
        }

        if (andConditions.length > 0) {
            whereClause[Op.and] = andConditions;
        }

        const reminderModel = reminderMessagesModel(req.tenantDB);

        // Counts follow the same filters as the list, including the free-text
        // search (previously only the date range/team-member/contact filters
        // did - globalSearch was silently left out of every count here).
        const countExtraConditions = [...baseDateConditions];
        if (Object.keys(fullTextSearchCondition).length > 0) {
            countExtraConditions.push(fullTextSearchCondition);
        }

        // "All"/"My" badge totals (matches Task Management's
        // isTaskCountGetAll/isTaskCountGetMy): shown regardless of which
        // scope is currently selected, so the toggle itself can show both
        // numbers. "myCount" is always personal, even when the current
        // request is already scoped to "all".
        const myBaseForCount = { ...baseWhereClause, ...personalScope };

        const [dueCount, futureCount, completeCount, allCount, myCount] = await Promise.all([
            reminderModel.count({
                where: {
                    ...baseWhereClause,
                    [Op.and]: [
                        ...countExtraConditions,
                        {
                            status: { [Op.ne]: 1 },
                            reminder_data_time: { [Op.lt]: currentDate },
                        },
                    ],
                },
            }),
            reminderModel.count({
                where: {
                    ...baseWhereClause,
                    [Op.and]: [
                        ...countExtraConditions,
                        {
                            status: { [Op.ne]: 1 },
                            completed_date_time: { [Op.or]: [null, ""] },
                            reminder_data_time: { [Op.gt]: currentDate },
                        },
                    ],
                },
            }),
            reminderModel.count({
                where: {
                    ...baseWhereClause,
                    [Op.and]: [
                        ...countExtraConditions,
                        {
                            status: 1,
                        },
                    ],
                },
            }),
            reminderModel.count({
                where: {
                    ...baseWhereClause,
                    [Op.and]: countExtraConditions,
                },
            }),
            showAllData
                ? reminderModel.count({
                    where: {
                        ...myBaseForCount,
                        [Op.and]: countExtraConditions,
                    },
                })
                : Promise.resolve(null), // backfilled below - already equals allCount when there's no all-data right
        ]);
        // Without the all-data right, baseWhereClause was already personal-scoped
        // (the showPersonalData branch above), so allCount IS myCount already -
        // no need for a second, identical query.
        const resolvedMyCount = myCount ?? allCount;

        const defaultOrder =
            typeFilter === "future"
                ? [["reminder_data_time", "ASC"]]
                : typeFilter === "complete"
                ? [["completed_date_time", "DESC"]]
                : [["reminder_data_time", "DESC"]];
        // Sort by the contact's labels (their names, alphabetically joined), then the normal order.
        const labelNamesSql =
            "(SELECT GROUP_CONCAT(lable_masters.lable_name ORDER BY lable_masters.lable_name SEPARATOR ',') FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, (SELECT contact_masters.lable FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id)))";
        // Reminders whose contact has no label always come last, in either direction.
        const orderClause =
            sortBy === "label"
                ? [
                    [Sequelize.literal(`(${labelNamesSql} IS NULL)`), "ASC"],
                    [Sequelize.literal(labelNamesSql), String(sortOrder).toUpperCase() === "DESC" ? "DESC" : "ASC"],
                    ...defaultOrder,
                ]
                : defaultOrder;

        // ────────────────────────────────────────────────
        // Fetch reminders
        // ────────────────────────────────────────────────

        const reminderQueryWhere = {
            ...whereClause,
            ...fullTextSearchCondition,
        };

        const [remindersRaw, totalMatchingCount] = await Promise.all([
            reminderModel.findAll({
                where: reminderQueryWhere,
                order: orderClause,
                limit,
                offset,
                raw: true,   // we'll enrich manually
            }),
            reminderModel.count({ where: reminderQueryWhere }),
        ]);

        // Labels of the contacts on this page, looked up once (not per row).
        const pageContactIds = [...new Set(remindersRaw.map((r) => r.contact_masters_id).filter(Boolean))];
        const contactLabelIds = new Map();
        const labelById = new Map();
        if (pageContactIds.length > 0) {
            const contactRows = await contactModel(req.tenantDB).findAll({
                where: { id: { [Op.in]: pageContactIds }, isDelete: 0 },
                attributes: ["id", "lable"],
                raw: true,
            });
            contactRows.forEach((c) => {
                contactLabelIds.set(
                    c.id,
                    String(c.lable || "").split(",").map((v) => v.trim()).filter(Boolean)
                );
            });
            const allLabelIds = [...new Set([...contactLabelIds.values()].flat().map(Number).filter(Number.isInteger))];
            if (allLabelIds.length > 0) {
                const labelRows = await req.tenantDB.query(
                    "SELECT id, lable_name, color FROM lable_masters WHERE isDelete = 0 AND id IN (:allLabelIds)",
                    { replacements: { allLabelIds }, type: Sequelize.QueryTypes.SELECT }
                );
                labelRows.forEach((l) => labelById.set(String(l.id), l));
            }
        }

        // ────────────────────────────────────────────────
        // Enrich data: contact name, username, status text
        // ────────────────────────────────────────────────
        const enrichedReminders = await Promise.all(
            remindersRaw.map(async (reminder) => {
                const reminderLabels = (contactLabelIds.get(reminder.contact_masters_id) || [])
                    .map((id) => labelById.get(id))
                    .filter(Boolean);
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

                // Status logic
                let statusText = "Due";
                if (reminder.status === 1) {
                    statusText = "Completed";
                } else if (new Date(reminder.reminder_data_time) > currentDate) {
                    statusText = "Upcoming";
                }

                return {
                    ...reminder,

                    // Enriched fields
                    contact_name: contactName,
                    // The contact's labels, for the report's Label column.
                    label_name: reminderLabels.map((l) => l.lable_name).join(", "),
                    labels: reminderLabels.map((l) => ({ label_name: l.lable_name, color: l.color })),
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
                total: totalMatchingCount,
                can_see_all_data: showAllData, // lets the frontend decide whether to show the "All" button at all
                counts: {
                    due: dueCount,
                    future: futureCount,
                    complete: completeCount,
                    all: allCount,
                    my: resolvedMyCount,
                },
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