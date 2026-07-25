import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { inquiryModel } from "../../../models/activities/inquiryModel.js";
import { sourceTypesModel } from "../../../models/masters/sourceTypeMode.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const sourceReport = async (req) => {
  try {
    const {
      a_application_login_id,
      selected_dates,
      selectedSourceTypes = [],
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
      page_id: PAGE_ID.SOURCE_REPORT,
      tenentId: req.tenantDB
    });

    let contactWhere = {
      company_masters_id: companyId,
    };

    let inquiryWhere = {
      company_masters_id: companyId,
    };

    if (showAllData) {
      // no extra restriction
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

    // Team Member Filter
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

    // === Source Filter ===
    let sourceWhere = { isDelete: 0 };
    if (Array.isArray(selectedSourceTypes) && selectedSourceTypes.length > 0) {
      const validIds = selectedSourceTypes
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

      if (validIds.length > 0) {
        sourceWhere.id = { [Op.in]: validIds };
      }
    }

    // === Global Search ===
    if (globalSearch) {
      const SourceModel = sourceTypesModel(req.tenantDB);
      const stringColumns = Object.keys(SourceModel.rawAttributes).filter(col => {
        const attr = SourceModel.rawAttributes[col];
        return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
      });

      const orConditions = stringColumns.map(col => ({
        [col]: { [Op.like]: `%${globalSearch}%` }
      }));

      sourceWhere[Op.or] = orConditions;
    }

    // === 1. Get Sources ===
    const SourceModel = sourceTypesModel(req.tenantDB);
    const sources = await SourceModel.findAll({
      where: sourceWhere,
      attributes: ["id", "source_name"],
      order: [["source_name", "ASC"]],
      offset: ul,
      limit: ll,
    });

    if (sources.length === 0) {
      return resSuccess({
        data: { item: [] },
        ack_msg: "No sources found",
      });
    }

    const sourceIds = sources.map(s => s.id);

    // === 2. Contact Counts (with Assigned To) ===
    const ContactModel = contactModel(req.tenantDB);
    const contactCountsRaw = await ContactModel.findAll({
      where: {
        ...contactWhere,
        source_type_id: { [Op.in]: sourceIds },
        isDelete: 0,
        created_date_time: {
          [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
        }
      },
      attributes: [
        'source_type_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['source_type_id'],
      raw: true
    });

    // === 3. Inquiry Counts (Only Created By) ===
    const InquiryModel = inquiryModel(req.tenantDB);
    const inquiryCountsRaw = await InquiryModel.findAll({
      where: {
        ...inquiryWhere,
        source_type_id: { [Op.in]: sourceIds },
        isDelete: 0,
        create_date_time: {
          [Op.between]: [`${startDate} 00:00:00`, `${endDate} 23:59:59`]
        }
      },
      attributes: [
        'source_type_id',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      group: ['source_type_id'],
      raw: true
    });

    // Convert to Maps
    const contactCounts = contactCountsRaw.reduce((acc, item) => {
      acc[item.source_type_id] = parseInt(item.count);
      return acc;
    }, {});

    const inquiryCounts = inquiryCountsRaw.reduce((acc, item) => {
      acc[item.source_type_id] = parseInt(item.count);
      return acc;
    }, {});

    // === Final Result ===
    const result = sources.map(source => ({
      source_name: source.source_name || "-",
      contactCount: contactCounts[source.id] || 0,
      inquiryCount: inquiryCounts[source.id] || 0,
    }));

    return resSuccess({
      data: { item: result },
      ack_msg: "Source-wise report retrieved successfully",
    });

  } catch (e) {
    console.error("Error in sourceReport:", e);
    return resError({
      ack_msg: "Error retrieving source report",
      developer_msg: e.message,
    });
  }
};