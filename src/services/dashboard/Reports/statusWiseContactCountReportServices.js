import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { inquiryModel } from "../../../models/activities/inquiryModel.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { getCompanyByLoginId } from "../../../services/commonServices.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { Op, Sequelize } from "sequelize";

export const statusWiseContactCountReportGet = async (req) => {
    try {
        const {
            a_application_login_id,
            selected_dates,
            selectedStatus = [],
            ul = 0,
            ll = 50
        } = req.body;

        if (!Array.isArray(selected_dates) || selected_dates.length !== 2) {
            return resError({
                ack_msg: "Invalid Input",
                developer_msg: "selected_dates must be an array of two valid YYYY-MM-DD dates",
            });
        }

        const parsedDates = selected_dates.map(date => {
            const parsed = new Date(date);
            if (isNaN(parsed.getTime())) return null;
            return parsed.toISOString().split('T')[0];
        });

        if (parsedDates.some(date => date === null)) {
            return resError({
                ack_msg: "Invalid Input",
                developer_msg: "selected_dates must contain valid dates",
            });
        }

        const [startDate, endDate] = parsedDates;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        if (!findCompanyId?.company_masters_id) {
            return resError({
                ack_msg: "Invalid Company",
                developer_msg: "No company found for the provided login ID",
            });
        }

        const companyId = findCompanyId.company_masters_id;

        // === User Rights ===
        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: companyId,
            a_application_login_id: a_application_login_id,
            page_id: PAGE_ID.STATUS_REPORT,
            tenentId: req.tenantDB
        });

        let contactWhere = {
            company_masters_id: companyId,
        };

        let inquiryWhere = {
            company_masters_id: companyId,
        };

        if (showAllData) {
            // no extra filter
        } else if (showPersonalData) {
            contactWhere[Op.or] = [
                { a_application_login_id: a_application_login_id },
                Sequelize.literal(
                    `FIND_IN_SET('${a_application_login_id}', assinged_to_work_a_application_id) > 0`
                ),
            ];

            inquiryWhere[Op.or] = [
                { a_application_login_id: a_application_login_id },
                Sequelize.literal(
                    `FIND_IN_SET('${a_application_login_id}', inquiry_assigned_team_member) > 0`
                ),
            ];
        } else {
            return resSuccess({
                data: { item: [] },
                ack_msg: "No data available",
            });
        }

        // === status Filter ===
        let statusWhere = {
            isDelete: 0,
            order_type: { [Op.in]: [1, 2] }
        };
        if (Array.isArray(selectedStatus) && selectedStatus.length > 0) {
            const validIds = selectedStatus
                .map(id => parseInt(id, 10))
                .filter(id => !isNaN(id));

            if (validIds.length > 0) {
                statusWhere.id = { [Op.in]: validIds };
            }
        }

        // === 1. Get Statuses for Contact (1) & Inquiry (2) ===
        const StatusModel = stagestatusModel(req.tenantDB);
        const statuses = await StatusModel.findAll({
            where: statusWhere,
            attributes: ["id", "name", "order_type"],
            order: [["name", "ASC"]],
            raw: true
        });

        if (statuses.length === 0) {
            return resSuccess({ data: { item: [] }, ack_msg: "No statuses found" });
        }

        // Map unique status names and track whether they belong to Contact (1) and/or Inquiry (2)
        const nameMap = new Map();
        statuses.forEach(s => {
            const name = s.name?.trim() || "-";
            if (!nameMap.has(name)) {
                nameMap.set(name, {
                    name,
                    hasContact: false,
                    contactStatusIds: [],
                    hasInquiry: false,
                    inquiryStatusIds: []
                });
            }
            const entry = nameMap.get(name);
            if (s.order_type === 1) {
                entry.hasContact = true;
                entry.contactStatusIds.push(s.id);
            } else if (s.order_type === 2) {
                entry.hasInquiry = true;
                entry.inquiryStatusIds.push(s.id);
            }
        });

        const allContactStatusIds = Array.from(nameMap.values()).flatMap(e => e.contactStatusIds);
        const allInquiryStatusIds = Array.from(nameMap.values()).flatMap(e => e.inquiryStatusIds);

        // === 2. Contact Counts ===
        const ContactModel = contactModel(req.tenantDB);
        let contactCountsRaw = [];
        if (allContactStatusIds.length > 0) {
            contactCountsRaw = await ContactModel.findAll({
                where: {
                    ...contactWhere,
                    isDelete: 0,
                    contact_status: { [Op.in]: allContactStatusIds },
                    created_date_time: {
                        [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
                    }
                },
                attributes: [
                    'contact_status',
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
                ],
                group: ['contact_status'],
                raw: true
            });
        }

        // === 3. Inquiry Counts ===
        const InquiryModel = inquiryModel(req.tenantDB);
        let inquiryCountsRaw = [];
        if (allInquiryStatusIds.length > 0) {
            inquiryCountsRaw = await InquiryModel.findAll({
                where: {
                    ...inquiryWhere,
                    company_masters_id: companyId,
                    isDelete: 0,
                    contact_status: { [Op.in]: allInquiryStatusIds },
                    create_date_time: {
                        [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
                    }
                },
                attributes: [
                    'contact_status',
                    [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
                ],
                group: ['contact_status'],
                raw: true
            });
        }

        const contactIdCountMap = {};
        contactCountsRaw.forEach(row => {
            const statusId = parseInt(row.contact_status, 10);
            contactIdCountMap[statusId] = parseInt(row.count, 10) || 0;
        });

        const inquiryIdCountMap = {};
        inquiryCountsRaw.forEach(row => {
            const statusId = parseInt(row.contact_status, 10);
            inquiryIdCountMap[statusId] = parseInt(row.count, 10) || 0;
        });

        // === Final Result ===
        const result = Array.from(nameMap.values())
            .map(entry => {
                let contactCount = "-";
                if (entry.hasContact) {
                    let sum = 0;
                    entry.contactStatusIds.forEach(id => {
                        sum += (contactIdCountMap[id] || 0);
                    });
                    contactCount = sum;
                }

                let inquiryCount = "-";
                if (entry.hasInquiry) {
                    let sum = 0;
                    entry.inquiryStatusIds.forEach(id => {
                        sum += (inquiryIdCountMap[id] || 0);
                    });
                    inquiryCount = sum;
                }

                return {
                    status_name: entry.name,
                    contactCount,
                    inquiryCount
                };
            })
            .sort((a, b) => a.status_name.localeCompare(b.status_name));

        const paginatedResult = result.slice(ul, ul + ll);

        return resSuccess({
            data: { item: paginatedResult },
            ack_msg: "Status-wise report retrieved successfully",
        });

    } catch (e) {
        console.error("Error in statusWiseContactCountReportGet:", e);
        return resError({
            ack_msg: "Error retrieving status report",
            developer_msg: e.message,
        });
    }
};