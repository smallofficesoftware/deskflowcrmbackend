import moment from "moment";
import { Op } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { visitsModel } from "../../../models/activities/visitModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../../models/company_setup/companyVsApplicationLoginModel.js";
import { customFieldFormModel } from "../../../models/other_settings/customFieldFormModel.js";
import { VISIT_IMG_LINK_EXTENDED } from "../../../utils/appConstants.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import logger from "../../../utils/logger.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";
// export const getVisitReport = async (req) => {
//   try {
//     const { a_application_login_id, selectedDates = [], selectedTeamMembers = [], selectedDemography, ul, ll, selectedContactId } = req.body;
//     const globalSearch = req.body.globalSearch?.trim() || "";

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

//     // ---------------- FULL TEXT SEARCH ----------------
//     let fullTextSearchCondition = {};
//     if (globalSearch) {
//       const visitColumns = Object.keys(visitsModel(req.tenantDB).rawAttributes)
//         .filter(col => {
//           const attr = visitsModel(req.tenantDB).rawAttributes[col];
//           return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
//         });

//       const like = `%${globalSearch}%`;
//       const orConditions = visitColumns.map(col => ({
//         [col]: { [Op.like]: like }
//       }));

//       fullTextSearchCondition = { [Op.or]: orConditions };
//     }
//     const startDate = moment(selectedDates[0]).startOf('day').format('YYYY-MM-DD');
//     const endDate = moment(selectedDates[1]).endOf('day').format('YYYY-MM-DD');

//     const dateFilter = {
//       start_date: { [Op.between]: [startDate, endDate] },
//     };

//     // ---------------- COMPANY ----------------
//     const company = await getCompanyByLoginId(a_application_login_id);
//     if (!company?.company_masters_id) {
//       return resError({
//         ack_msg: "Company Not Found",
//         developer_msg: "No company found for the provided login ID",
//       });
//     }
//     const company_master_id = company.company_masters_id;

//     // ---------------- DEMOGRAPHY FILTER ----------------
//     let whereForContact = {};

//     if (Array.isArray(selectedDemography)) {

//       if (selectedDemography[0]) whereForContact["country"] = parseInt(selectedDemography[0]);
//       if (selectedDemography[1]) whereForContact["state"] = parseInt(selectedDemography[1]);
//       if (selectedDemography[2]) whereForContact["city"] = parseInt(selectedDemography[2]);
//       if (selectedDemography[3]) whereForContact["area"] = parseInt(selectedDemography[3]);
//     }

//     // ---------------- TEAM USER FILTER ----------------
//     let whereClause = {
//       isDelete: 0,
//       ...(selectedTeamMembers.length > 0 && {
//         a_application_login_id: { [Op.in]: selectedTeamMembers },
//       }),
//     };

//     // ---------------- RIGHTS CHECK ----------------
//     const a_application_login_type_rights = req.body.a_application_login_id;
//     const { showAllData, showPersonalData } = await getUserRights({
//       company_masters_id: company_master_id,
//       a_application_login_id: a_application_login_type_rights,
//       page_id: PAGE_ID.ALLVISIT_REPORT,
//       tenentId: req.tenantDB
//     });

//     if (showAllData) {
//       whereClause = { company_masters_id: company_master_id };
//     } else if (showPersonalData) {
//       whereClause = { a_application_login_id: req.body.a_application_login_id };
//     }

//     // ---------------- TEAM MEMBERS ----------------
//     const companyVsApplicationLoginResult = await companyVsApplicationLoginModel.findAll({
//       where: whereClause,
//       attributes: ['a_application_login_id'],
//     });
//     let contactCondition = {};

//     if (selectedContactId && referenceWiseContact == 1) {
//       contactCondition = {
//         contact_id: selectedContactId,
//       };

//     } else if (selectedContactId && referenceWiseContact == 2) {

//       const Contact = contactModel(req.tenantDB);

//       const findreffrancewiseContact = await Contact.findAll({
//         where: {
//           referance_contact: selectedContactId,
//           isDelete: 0,
//         },
//         attributes: ["id"],
//         raw: true,
//       });

//       const contactIds = findreffrancewiseContact.map(item => item.id);

//       contactCondition = {
//         contact_id: {
//           [Op.in]: contactIds,
//         },
//       };
//     }
//     const visitsModels = visitsModel(req.tenantDB);
//     const contactModels = contactModel(req.tenantDB);

//     // ---------------- MAIN VISIT LOOP ----------------
//     const visitData = await Promise.all(
//       companyVsApplicationLoginResult.map(async (item) => {

//         // Get User Details
//         const [user] = await loginModel.findAll({
//           where: {
//             isDelete: 0,
//             id: item.a_application_login_id,
//           },
//           attributes: ["username", "recovery_mobile"],
//           limit: 1,
//         });


//         const visits = await visitsModels.findAll({
//           where: {
//             ...fullTextSearchCondition,
//             ...contactCondition,
//             isDelete: 0,
//             company_masters_id: company_master_id,
//             a_application_login_id: item.a_application_login_id,
//             ...dateFilter,
//           },
//           order: [['id', 'DESC']],
//           offset,
//           limit,
//         });

//         const customFieldModelInstance = customFieldFormModel(req.tenantDB);
//         const CustomFormFeilds = await customFieldModelInstance.findAll({
//           where: {
//             form_type: 3,
//             isDelete: 0,
//             report_print_or_not: 1,
//             data_type: { [Op.ne]: 11 },
//           },
//         });

//         // ---------------- FIX: REMOVE DELETED CONTACT VISITS ----------------
//         const results = await Promise.all(
//           visits.map(async (visit) => {

//             const contactNumber = await contactModels.findOne({
//               where: {
//                 id: visit.contact_id,
//                 isDelete: 0,
//                 ...whereForContact,
//               },
//               attributes: ["person_name", "company_name"],
//             });

//             if (!contactNumber) {
//               return null;
//             }

//             return {
//               ...visit.toJSON(),
//               contactNumber: `${contactNumber.company_name} (${contactNumber.person_name})`,
//               customForm: CustomFormFeilds,
//               visit_image: visit.visit_image
//                 ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_image}`
//                 : null,
//             };
//           })
//         );

//         // FILTER NULL VALUES
//         const filteredResults = results.filter(v => v !== null);

//         return {
//           user: user || null,
//           visits: filteredResults,
//         };
//       })
//     );

//     return resSuccess({
//       ack_msg: "Success",
//       data: visitData,
//     });

//   } catch (error) {
//     logger.error("Error in getVisitReport:", error);
//     return resError({
//       ack_msg: "Internal Server Error",
//       developer_msg: error.message,
//     });
//   }
// };

export const getVisitReport = async (req) => {
  try {
    const {
      a_application_login_id,
      selectedDates = [],
      selectedTeamMembers = [],
      selectedDemography,
      ul = 0,
      ll = 50,
      selectedContactId,
      globalSearch = "",
      referenceWiseContact
    } = req.body;

    if (!a_application_login_id) {
      return resError({ ack_msg: "Invalid Request", developer_msg: "a_application_login_id is required" });
    }
    if (selectedDates.length !== 2) {
      return resError({ ack_msg: "Invalid Request", developer_msg: "Please provide both start and end dates" });
    }

    const offset = Number(ul) || 0;
    const limit = Number(ll) || 50;
    const trimmedSearch = globalSearch.trim();

    // ---------------- DATE FILTER ----------------
    const startDate = moment(selectedDates[0]).startOf('day').format('YYYY-MM-DD');
    const endDate = moment(selectedDates[1]).endOf('day').format('YYYY-MM-DD');

    const dateFilter = {
      // start_date: { [Op.between]: [startDate, endDate] },
      start_date: {
        [Op.gte]: `${startDate} 00:00:00`,
        [Op.lt]: `${endDate} 23:59:59`,
      },
    };

    // ---------------- COMPANY ----------------
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company?.company_masters_id) {
      return resError({ ack_msg: "Company Not Found", developer_msg: "No company found..." });
    }
    const company_master_id = company.company_masters_id;

    // ---------------- RIGHTS CHECK ----------------
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: company_master_id,
      a_application_login_id,
      page_id: PAGE_ID.ALLVISIT_REPORT,
      tenentId: req.tenantDB
    });

    // ---------------- TEAM FILTER LOGIC ----------------
    let teamIds = [];

    if (showAllData) {
      if (selectedTeamMembers.length > 0) {
        teamIds = selectedTeamMembers;
      } else {
        // selectedTeamMembers is empty → Get ALL team members
        const allTeamMembers = await companyVsApplicationLoginModel.findAll({
          where: {
            company_masters_id: company_master_id,
            isDelete: 0
          },
          attributes: ['a_application_login_id'],
          raw: true
        });
        teamIds = allTeamMembers.map(item => item.a_application_login_id);
      }
    } else if (showPersonalData) {
      teamIds = [a_application_login_id];   // only himself
    } else {
      return resBadRequest({ ack_msg: "You don't have permission to view this report" });
    }

    // ---------------- DEMOGRAPHY FILTER (for contacts) ----------------
    let whereForContact = {};
    if (Array.isArray(selectedDemography)) {
      if (selectedDemography[0]) whereForContact.country = parseInt(selectedDemography[0]);
      if (selectedDemography[1]) whereForContact.state = parseInt(selectedDemography[1]);
      if (selectedDemography[2]) whereForContact.city = parseInt(selectedDemography[2]);
      if (selectedDemography[3]) whereForContact.area = parseInt(selectedDemography[3]);
    }

    // ---------------- GLOBAL SEARCH ----------------
    let fullTextSearchCondition = {};
    if (trimmedSearch) {
      const visitColumns = Object.keys(visitsModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = visitsModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      fullTextSearchCondition = {
        [Op.or]: visitColumns.map(col => ({ [col]: { [Op.like]: `%${trimmedSearch}%` } }))
      };
    }

    // ---------------- CONTACT REFERENCE FILTER ----------------
    let contactCondition = {};
    if (selectedContactId && referenceWiseContact == 1) {
      contactCondition = {
        contact_id: selectedContactId,
      };

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

      const contactIds = findreffrancewiseContact.map(item => item.id);

      contactCondition = {
        contact_id: {
          [Op.in]: contactIds,
        },
      };
    }

    const visitsModels = visitsModel(req.tenantDB);
    const contactModels = contactModel(req.tenantDB);

    // ---------------- MAIN QUERY - GLOBAL SORT BY ID DESC ----------------
    const visitDataRaw = await Promise.all(
      teamIds.map(async (loginId) => {
        const user = await loginModel.findOne({
          where: { id: loginId, isDelete: 0 },
          attributes: ["username", "recovery_mobile"],
        });

        const visits = await visitsModels.findAll({
          where: {
            ...fullTextSearchCondition,
            ...contactCondition,
            isDelete: 0,
            company_masters_id: company_master_id,
            a_application_login_id: loginId,
            ...dateFilter,
          },
          order: [["id", "DESC"]],        // Keep per user for now
          offset,
          limit,
        });

        // ... rest of your custom fields and contact logic remains same
        const CustomFormFeilds = await customFieldFormModel(req.tenantDB).findAll({
          where: {
            form_type: 3,
            isDelete: 0,
            report_print_or_not: 1,
            data_type: { [Op.ne]: 11 },
          },
        });
        console.log("CustomFormFeildsCustomFormFeilds", CustomFormFeilds);

        const results = await Promise.all(
          visits.map(async (visit) => {
            const contact = await contactModels.findOne({
              where: { id: visit.contact_id, isDelete: 0, ...whereForContact },
              attributes: ["person_name", "company_name"],
            });

            if (!contact) return null;

            return {
              ...visit.toJSON(),
              contactNumber: `${contact.company_name}`,
              customForm: CustomFormFeilds,
              visit_image: visit.visit_image
                ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_image}`
                : null,
              visit_column_attechments_1: visit.visit_column_attechments_1
                ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_column_attechments_1}`
                : null,
              visit_column_attechments_2: visit.visit_column_attechments_2
                ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_column_attechments_2}`
                : null,
              visit_column_attechments_3: visit.visit_column_attechments_3
                ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_column_attechments_3}`
                : null,
              visit_column_attechments_4: visit.visit_column_attechments_4
                ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_column_attechments_4}`
                : null,
              visit_column_attechments_5: visit.visit_column_attechments_5
                ? `${VISIT_IMG_LINK_EXTENDED}/${visit.visit_column_attechments_5}`
                : null,
            };
          })
        );

        return {
          user: user || null,
          visits: results.filter(Boolean),
          maxVisitId: visits.length > 0 ? Math.max(...visits.map(v => v.id)) : 0   // For sorting
        };
      })
    );

    // ---------------- GLOBAL SORT BY VISIT ID DESC ----------------
    const visitData = visitDataRaw
      .filter(item => item.visits.length > 0)                    // Optional: remove users with no visits
      .sort((a, b) => (b.maxVisitId || 0) - (a.maxVisitId || 0)) // Sort users by newest visit first
      .map(({ user, visits }) => ({ user, visits }));            // Clean output

    return resSuccess({
      ack_msg: "Success",
      data: visitData,
    });

  } catch (error) {
    logger.error("Error in getVisitReport:", error);
    return resError({
      ack_msg: "Internal Server Error",
      developer_msg: error.message,
    });
  }
};
