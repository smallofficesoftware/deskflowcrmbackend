import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { inquiryModel } from "../../../models/activities/inquiryModel.js";
import { labelModel } from "../../../models/masters/labelModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const lableReport = async (req) => {
  try {
    const {
      a_application_login_id,
      selected_dates,
      selectedLabels = [],
      selectedTeamMembers = [],
      ul = 0,
      ll = 50
    } = req.body;

    const globalSearch = req.body.globalSearch?.trim() || "";

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
      page_id: PAGE_ID.LABEL_REPORT,
      tenentId: req.tenantDB
    });

    let baseWhere = {};
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
    // === Team Member Filter ===
    // let contactWhere = { ...baseWhere };
    // let inquiryWhere = { ...baseWhere };

    if (selectedTeamMembers?.length > 0) {
      const teamIds = selectedTeamMembers
        .map(id => String(id).trim())
        .filter(Boolean);

      if (teamIds.length > 0) {

        const contactAssignedConditions = teamIds.map(id =>
          Sequelize.literal(
            `FIND_IN_SET('${id}', assinged_to_work_a_application_id) > 0`
          )
        );

        const inquiryAssignedConditions = teamIds.map(id =>
          Sequelize.literal(
            `FIND_IN_SET('${id}', inquiry_assigned_team_member) > 0`
          )
        );

        contactWhere[Op.and] = [
          ...(contactWhere[Op.and] || []),
          {
            [Op.or]: [
              { a_application_login_id: { [Op.in]: teamIds } },
              { [Op.or]: contactAssignedConditions }
            ]
          }
        ];

        inquiryWhere[Op.and] = [
          ...(inquiryWhere[Op.and] || []),
          {
            [Op.or]: [
              { a_application_login_id: { [Op.in]: teamIds } },
              { [Op.or]: inquiryAssignedConditions }
            ]
          }
        ];
      }
    }

    // === Label Filter ===
    let labelWhere = { isDelete: 0 };
    if (Array.isArray(selectedLabels) && selectedLabels.length > 0) {
      const validIds = selectedLabels
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

      if (validIds.length > 0) {
        labelWhere.id = { [Op.in]: validIds };
      }
    }

    // === Global Search ===
    if (globalSearch) {
      const LabelModel = labelModel(req.tenantDB);
      const stringColumns = Object.keys(LabelModel.rawAttributes).filter(col => {
        const attr = LabelModel.rawAttributes[col];
        return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
      });

      const orConditions = stringColumns.map(col => ({
        [col]: { [Op.like]: `%${globalSearch}%` }
      }));

      labelWhere[Op.or] = orConditions;
    }

    // === 1. Get Labels ===
    const LabelModel = labelModel(req.tenantDB);
    const labels = await LabelModel.findAll({
      where: labelWhere,
      attributes: ["id", "lable_name"],
      order: [["lable_name", "ASC"]],
      offset: ul,
      limit: ll,
    });

    if (labels.length === 0) {
      return resSuccess({ data: { item: [] }, ack_msg: "No labels found" });
    }

    const labelIds = labels.map(l => l.id);

    // === 2. Contact Counts (with Assigned To logic) ===
    const ContactModel = contactModel(req.tenantDB);
    const contactCountsRaw = await ContactModel.findAll({
      where: {
        ...contactWhere,
        isDelete: 0,
        created_date_time: {
          [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
        },
        lable: { [Op.ne]: null }
      },
      attributes: [
        'lable',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['lable'],
      raw: true
    });
    console.log("33333333333333322222222", contactCountsRaw);

    // === 3. Inquiry Counts (Only Created By) ===
    const InquiryModel = inquiryModel(req.tenantDB);
    const inquiryCountsRaw = await InquiryModel.findAll({
      where: {
        ...inquiryWhere,
        company_masters_id: companyId,
        isDelete: 0,
        create_date_time: {
          [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
        },
        label_id: { [Op.ne]: null }
      },
      attributes: [
        'label_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['label_id'],
      raw: true
    });
    console.log("inquiryCountsRawinquiryCountsRawinquiryCountsRawinquiryCountsRaw", inquiryCountsRaw);

    // Process comma-separated labels
    const contactCounts = {};
    contactCountsRaw.forEach(row => {
      const labelStr = row.lable || '';
      const ids = labelStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      ids.forEach(id => {
        if (labelIds.includes(id)) {
          contactCounts[id] = (contactCounts[id] || 0) + parseInt(row.count);
        }
      });
    });

    const inquiryCounts = {};
    inquiryCountsRaw.forEach(row => {
      const labelStr = row.label_id || '';
      const ids = labelStr.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      ids.forEach(id => {
        if (labelIds.includes(id)) {
          inquiryCounts[id] = (inquiryCounts[id] || 0) + parseInt(row.count);
        }
      });
    });

    // === Final Result ===
    const result = labels.map(label => ({
      lable_name: label.lable_name || "-",
      contactCount: contactCounts[label.id] || 0,
      inquiryCount: inquiryCounts[label.id] || 0,
    }));

    return resSuccess({
      data: { item: result },
      ack_msg: "Label-wise report retrieved successfully",
    });

  } catch (e) {
    console.error("Error in lableReport:", e);
    return resError({
      ack_msg: "Error retrieving label report",
      developer_msg: e.message,
    });
  }
};