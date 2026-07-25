import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { callhistoryModel } from "../../../models/activities/callhistoryModel.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import { labelModel } from "../../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import logger from "../../../utils/logger.js";
import { normalizeToTenDigit, resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

// export const getCallReport = async (req) => {
//   try {
//     const { a_application_login_id, selectedDates = [], selectedTeamMembers = [], ul, ll, selectedContactId } = req.body;

//     const globalSearch = req.body.globalSearch?.trim() || "";

//     let fullTextSearchCondition = {};
//     if (globalSearch) {
//       const cartColumns = Object.keys(callhistoryModel(req.tenantDB).rawAttributes)
//         .filter(col => {
//           const attr = callhistoryModel(req.tenantDB).rawAttributes[col];
//           return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
//         });

//       const like = `%${globalSearch}%`;
//       const orConditions = cartColumns.map(col => ({
//         [col]: { [Op.like]: like }
//       }));

//       fullTextSearchCondition = { [Op.or]: orConditions };
//     }
//     const offset = ul;
//     const limit = ll;

//     if (!a_application_login_id) {
//       return resError({
//         ack_msg: "Invalid Request",
//         developer_msg: "a_application_login_id is required",
//       });
//     }

//     if (selectedDates.length !== 2) {
//       return resError({
//         ack_msg: "Invalid Request",
//         developer_msg: "Please provide both start and end dates",
//       });
//     }

//     const startDate = moment(selectedDates[0]).startOf('day').format('YYYY-MM-DD');
//     const endDate = moment(selectedDates[1]).endOf('day').format('YYYY-MM-DD');

//     const dateFilter = {
//       call_date_time: {
//         [Op.between]: [startDate, endDate],
//       },
//     };

//     const company = await getCompanyByLoginId(a_application_login_id);
//     if (!company?.company_masters_id) {
//       return resError({
//         ack_msg: "Company Not Found",
//         developer_msg: "No company found for the provided login ID",
//       });
//     }
//     const company_master_id = company.company_masters_id;

//     // let whereClause = {
//     //   isDelete: 0,
//     //   ...(selectedTeamMembers.length > 0 && {
//     //     a_application_login_id: { [Op.in]: selectedTeamMembers },
//     //   }),
//     // };

//     const a_application_login_id_ggg = req.body.a_application_login_id;
//     const { showAllData, showPersonalData } = await getUserRights({
//       company_masters_id: company_master_id,
//       a_application_login_id: a_application_login_id_ggg,
//       page_id: PAGE_ID.ALLCALL_REPORT,
//       tenentId: req.tenantDB
//     });

//     let whereClause = {
//       isDelete: 0,
//     };

//     // ✅ Apply rights
//     if (!showAllData && showPersonalData) {
//       // Only show own data UNLESS specific team members are requested
//       if (selectedTeamMembers.length === 0) {
//         userWhere.a_application_login_id = a_application_login_id;
//       }
//     }
//     // ✅ Apply team filter (ONLY if provided)
//     if (selectedTeamMembers.length > 0) {
//       whereClause.a_application_login_id = {
//         [Op.in]: selectedTeamMembers,
//       };
//     }
//     const companyVsApplicationLoginResult = await companyVsApplicationLoginModel.findAll({
//       where: whereClause,
//       attributes: ['a_application_login_id'],

//     });

//     const contactModels = callhistoryModel(req.tenantDB);

//     const callData = await Promise.all(
//       companyVsApplicationLoginResult.map(async (item) => {
//         const [user] = await loginModel.findAll({
//           where: {
//             isDelete: 0,
//             id: item.a_application_login_id,
//           },
//           attributes: ["username", "recovery_mobile"],
//           limit: 1,
//         });

//         const calls = await contactModels.findAll({
//           where: {
//             isDelete: 0,
//             company_masters_id: company_master_id,
//             a_application_login_id: item.a_application_login_id,
//             ...dateFilter,
//             ...fullTextSearchCondition
//           },
//           order: [['id', 'DESC']],
//           offset, // ll -> offset
//           limit,  // ul -> limit

//         });

//         return {
//           user: user || null,
//           calls: calls || [],
//         };
//       })
//     );

//     return resSuccess({
//       ack_msg: "Success",
//       data: callData,
//     });

//   } catch (error) {
//     logger.error("Error in getCallReport:", error);
//     return resError({
//       ack_msg: "Internal Server Error",
//       developer_msg: ("Error in getCallReport:", error.message),
//     });
//   }
// };


export const getCallReport = async (req) => {
  try {
    const {
      a_application_login_id,
      selectedDates = [],
      selectedTeamMembers = [],
      selectedLabels,
      selectedSourceTypes,
      selectedStageStatus,
      ul,
      ll,
    } = req.body;

    const globalSearch = req.body.globalSearch?.trim() || "";

    if (!a_application_login_id) {
      return resError({
        ack_msg: "Invalid Request",
        developer_msg: "a_application_login_id is required",
      });
    }

    if (selectedDates.length !== 2) {
      return resError({
        ack_msg: "Invalid Request",
        developer_msg: "Please provide both start and end dates",
      });
    }

    // ✅ Correct date handling
    const startDate = moment(selectedDates[0]).startOf("day").toDate();
    const endDate = moment(selectedDates[1]).endOf("day").toDate();

    const dateFilter = {
      call_date_time: {
        [Op.gte]: startDate,
        [Op.lte]: endDate,
      },
    };

    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company?.company_masters_id) {
      return resError({
        ack_msg: "Company Not Found",
        developer_msg: "No company found for the provided login ID",
      });
    }

    const company_master_id = company.company_masters_id;

    // ✅ Get user rights
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: company_master_id,
      a_application_login_id,
      page_id: PAGE_ID.ALLCALL_REPORT,
      tenentId: req.tenantDB,
    });

    // ✅ Build search condition
    let fullTextSearchCondition = {};
    if (globalSearch) {
      const callModel = callhistoryModel(req.tenantDB);

      const textColumns = Object.keys(callModel.rawAttributes).filter((col) => {
        const attr = callModel.rawAttributes[col];
        return ["STRING", "TEXT", "CHAR", "VARCHAR"].includes(attr.type.key);
      });

      const like = `%${globalSearch}%`;

      fullTextSearchCondition = {
        [Op.or]: textColumns.map((col) => ({
          [col]: { [Op.like]: like },
        })),
      };
    }

    // Build main where condition
    const callWhere = {
      isDelete: 0,
      company_masters_id: company_master_id,
      ...dateFilter,
      ...fullTextSearchCondition,
    };

    // Apply rights
    if (!showAllData && showPersonalData && selectedTeamMembers.length === 0) {
      callWhere.a_application_login_id = a_application_login_id;
    }

    // Apply team filter
    if (selectedTeamMembers.length > 0) {
      callWhere.a_application_login_id = {
        [Op.in]: selectedTeamMembers,
      };
    }

    const callModel = callhistoryModel(req.tenantDB);

    // Fetch all calls in ONE query (optimized)
    const calls = await callModel.findAll({
      where: callWhere,
      order: [["call_date_time", "DESC"]],
      offset: ul,
      limit: ll,
    });
    console.log("callscallscallscalls111111111111", calls);

    // Get unique user IDs
    const userIds = [...new Set(calls.map((c) => c.a_application_login_id))];

    const users = await loginModel.findAll({
      where: {
        id: { [Op.in]: userIds },
        isDelete: 0,
      },
      attributes: ["id", "username", "recovery_mobile"],
    });

    const contactModal = contactModel(req.tenantDB);
    const sourceModels = await sourceTypesModel(req.tenantDB);
    const lableModels = await labelModel(req.tenantDB);
    const statusModels = await stagestatusModel(req.tenantDB);

    let contactWhere = {
      company_masters_id: company_master_id,
    };

    if (
      Array.isArray(selectedStageStatus) &&
      selectedStageStatus.length > 0
    ) {
      const hasBlank = selectedStageStatus.includes(-7777);

      const normalStatus = selectedStageStatus.filter(
        (id) => id !== -7777
      );

      if (hasBlank && normalStatus.length > 0) {
        contactWhere.contact_status = {
          [Op.or]: [
            { [Op.in]: normalStatus },
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else if (hasBlank) {
        contactWhere.contact_status = {
          [Op.or]: [
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else {
        contactWhere.contact_status = {
          [Op.in]: normalStatus,
        };
      }
    }

    if (
      Array.isArray(selectedSourceTypes) &&
      selectedSourceTypes.length > 0
    ) {
      const hasBlank = selectedSourceTypes.includes(-8888);

      const normalSourceTypes = selectedSourceTypes.filter(
        (id) => id !== -8888
      );

      if (hasBlank && normalSourceTypes.length > 0) {
        contactWhere.source_type_id = {
          [Op.or]: [
            { [Op.in]: normalSourceTypes },
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else if (hasBlank) {
        contactWhere.source_type_id = {
          [Op.or]: [
            { [Op.is]: null },
            { [Op.eq]: 0 },
            { [Op.eq]: "" },
          ],
        };
      } else {
        contactWhere.source_type_id = {
          [Op.in]: normalSourceTypes,
        };
      }
    }

    if (
      Array.isArray(selectedLabels) &&
      selectedLabels.length > 0
    ) {
      const hasBlankLabel =
        selectedLabels.includes(-9999);

      const normalLabelIds = selectedLabels.filter(
        (id) => id !== -9999
      );

      const labelConditions = [];

      if (normalLabelIds.length > 0) {
        const labelCondition = normalLabelIds
          .map((id) => `FIND_IN_SET(${id}, lable) > 0`)
          .join(" OR ");

        labelConditions.push(`(${labelCondition})`);
      }

      if (hasBlankLabel) {
        labelConditions.push(
          `(lable IS NULL OR lable = '')`
        );
      }

      if (labelConditions.length > 0) {
        contactWhere[Op.and] = [
          Sequelize.literal(
            `(${labelConditions.join(" OR ")})`
          ),
        ];
      }
    }

    const allContacts = await contactModal.findAll({
      where: contactWhere,
      attributes: [
        "person_name",
        "mobile_number",
        "source_type_id",
        "contact_status",
        "lable",
      ],
    });

    const sourceTypes = await sourceModels.findAll({
      where: {
        isDelete: 0,
      },
      attributes: [
        "id",
        "source_name",
        "color",
      ],
    });

    const labels = await lableModels.findAll({
      where: {
        isDelete: 0,
      },
      attributes: [
        "id",
        "lable_name",
        "color",
      ],
    });

    const status = await statusModels.findAll({
      where: {
        isDelete: 0,
      },
      attributes: [
        "id",
        "name",
        "color",
      ],
    });

    for (const call of calls) {
      const contactData = allContacts.find((c) => {
        const contactNumber = normalizeToTenDigit(c.mobile_number);
        const callNumber = normalizeToTenDigit(call.mobile_number);

        return (
          c.person_name?.toLowerCase().trim() ===
          call.call_name?.toLowerCase().trim() &&
          contactNumber === callNumber
        );
      });

      if (contactData) {
        const source = sourceTypes.find(
          (s) => s.id === contactData.source_type_id
        );

        const statusItem = status.find(
          (s) => s.id === contactData.contact_status
        );

        const labelIds = contactData.lable
          ? contactData.lable
            .toString()
            .split(",")
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !isNaN(id))
          : [];

        const matchedLabels = labels.filter((label) =>
          labelIds.includes(label.id)
        );

        call.dataValues.contactDetails = {
          source_name: source ? source.source_name : "",
          source_colour: source ? source.color : "",

          status_name: statusItem ? statusItem.name : "",
          status_colour: statusItem ? statusItem.color : "",

          lable_name: matchedLabels
            .map((l) => l.lable_name)
            .join(", "),

          lable_colour: matchedLabels
            .map((l) => l.color)
            .join(", "),
        };
      } else {
        call.dataValues.contactDetails = null;
      }
    }

    const filteredCalls = calls.filter(
      (call) => call.dataValues.contactDetails !== null
    );

    // Map users
    const userMap = {};
    users.forEach((u) => {
      userMap[u.id] = u;
    });

    // Group calls by user
    const groupedData = {};
    filteredCalls.forEach((call) => {
      const userId = call.a_application_login_id;

      if (!groupedData[userId]) {
        groupedData[userId] = {
          user: userMap[userId] || null,
          calls: [],
        };
      }

      groupedData[userId].calls.push(call);
    });

    const result = Object.values(groupedData);

    return resSuccess({
      ack_msg: "Success",
      data: result,
    });
  } catch (error) {
    logger.error("Error in getCallReport:", error);
    return resError({
      ack_msg: "Internal Server Error",
      developer_msg: error.message,
    });
  }
};