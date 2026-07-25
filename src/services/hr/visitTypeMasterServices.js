import { visitsModel } from "../../models/activities/visitModel.js";

import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { Op } from "sequelize";
import {
  formatDateAndTimeCreateDateTime,
  isValid,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
// import { __dirnameConstant } from "../utils/appConstants.js";
import loginModel from "../../models/application_login/loginModel.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

import { getUserRights } from "../../helpers/rightsHelper.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { taskMessageHistroyModel } from "../../models/activities/taskMessageHistroyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { visitTypeModel } from "../../models/hr/visitTypeModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { VISIT_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";

export const getAllVisitMaster = async (req) => {
  try {
    const { ul, ll, a_application_login_id, contactId, searchTerm, team_id } = req.body;
    // Fetch company details
    const company = await getCompanyByLoginId(a_application_login_id);
    if (!company) {
      return resError({
        ack_msg: "Company Not Found",
        developer_msg: "No company found for the provided login ID",
      });
    }

    // Fetch owner data
    const ownerData = await companyVsApplicationLoginModel.findOne({
      where: { a_application_login_id, isDelete: 0 },
      attributes: ["company_flag"],
    });
    if (!ownerData) {
      return resError({
        ack_msg: "User Not Found",
        developer_msg: "No user found for the provided login ID",
      });
    }

    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: company.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.VISIT,
      tenentId: req.tenantDB
    });


    // Initialize where clause
    let whereClause = { isDelete: 0, isActive: 1 };
    let caseKey;

    // Determine caseKey based on access rights and contactId
    if (contactId && !isNaN(parseInt(contactId)) && contactId.toString().trim() !== "") {
      caseKey = "contact_id";
    } else if (showAllData) {
      caseKey = "all_data";
    } else if (showPersonalData) {
      caseKey = "personal";
    } else {
      caseKey = "invalid";
    }
    // Function to apply search term filters
    const applySearch = (whereClause, searchTerm) => {
      if (searchTerm && typeof searchTerm === "string" && searchTerm.trim()) {
        const trimmedSearch = searchTerm.trim().toLowerCase();
        whereClause[Op.or] = [
          { person_name: { [Op.like]: `%${trimmedSearch}%` } },
          { remark: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_number_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_number_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_number_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_number_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_number_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_area_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_area_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_area_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_area_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_text_area_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_and_time_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_and_time_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_and_time_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_and_time_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_date_and_time_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_time_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_time_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_time_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_time_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_time_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_switch_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_switch_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_switch_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_switch_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_switch_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_decimal_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_decimal_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_decimal_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_decimal_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_decimal_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_dropdown_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_dropdown_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_dropdown_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_dropdown_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_dropdown_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_radio_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_radio_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_radio_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_radio_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_radio_5: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_attechments_1: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_attechments_2: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_attechments_3: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_attechments_4: { [Op.like]: `%${trimmedSearch}%` } },
          { visit_column_attechments_5: { [Op.like]: `%${trimmedSearch}%` } },
        ];
      }
    };

    // Apply whereClause based on caseKey

    switch (caseKey) {
      case "contact_id":
        whereClause.contact_id = contactId;
        if (showPersonalData && !showAllData) {
          whereClause.a_application_login_id = a_application_login_id;
        } else if (showAllData) {
          whereClause.company_masters_id = company.company_masters_id;

          // NEW: Respect team_id even in contact_id + all_data scenario
          if (team_id) {
            whereClause.a_application_login_id = team_id;
          }
        }
        applySearch(whereClause, searchTerm);
        break;

      case "all_data":
        whereClause.company_masters_id = company.company_masters_id;

        // ✅ FIXED: Apply team_id filter when provided
        if (team_id) {
          whereClause.a_application_login_id = team_id;
        }

        applySearch(whereClause, searchTerm);
        break;

      case "personal":
        if (team_id) {
          whereClause.a_application_login_id = team_id;
        } else {
          whereClause.a_application_login_id = a_application_login_id;
        }
        applySearch(whereClause, searchTerm);
        break;

      default:
        return resBadRequest({
          developer_msg: "Invalid access rights or filtering condition",
          ack_msg: "You do not have permission to access this data.",
        });
    }
    // Fetch visits
    const visitsModelInstance = visitsModel(req.tenantDB);
    const visits = await visitsModelInstance.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
      limit: Number(ll) || 50,
      offset: Number(ul) || 0,
      attributes: {
        include: [
          [
            Sequelize.literal(
              `(SELECT visit_type FROM visit_type_masters WHERE visit_type_masters.id = visits.visit_type_id AND visit_type_masters.isDelete = 0 LIMIT 1)`
            ),
            "visit_type",
          ],
        ],
      },
    });

    const contactModels = contactModel(req.tenantDB);

    // Map and sanitize visit data
    const sanitizedVisits = await Promise.all(
      visits.map(async (visit) => {
        const sanitized = sanitizeObjectOfNull(visit.toJSON());
        let applicationLoginName = null;
        let contact_mobile = null;
        let company_name = null;

        if (sanitized.a_application_login_id) {
          const userData = await loginModel.findOne({
            where: { id: sanitized.a_application_login_id, isDelete: 0 },
            attributes: ["username"],
          });
          applicationLoginName = userData ? userData.username : null;
        }
        if (sanitized.contact_id) {
          const contactData = await contactModels.findOne({
            where: {
              id: sanitized.contact_id,
            },
            attributes: ["mobile_number", "company_name"],
          });
          contact_mobile = contactData ? contactData.mobile_number : null;
          company_name = contactData ? contactData.company_name : null;
        }

        return {
          ...sanitized,
          visit_image: sanitized.visit_image
            ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_image}`
            : null,
          // visit_column_attechments_1:
          //   sanitized.visit_column_attechments_1
          //     ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_1}`
          //     : null,

          // visit_column_attechments_2:
          //   sanitized.visit_column_attechments_2
          //     ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_2}`
          //     : null,

          // visit_column_attechments_3:
          //   sanitized.visit_column_attechments_3
          //     ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_3}`
          //     : null,

          // visit_column_attechments_4:
          //   sanitized.visit_column_attechments_4
          //     ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_4}`
          //     : null,

          // visit_column_attechments_5:
          //   sanitized.visit_column_attechments_5
          //     ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_5}`
          //     : null,
          visit_column_attechments_1: sanitized.visit_column_attechments_1
            ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_1.replace(/\\/g, "/")}`
            : null,
          visit_column_attechments_2: sanitized.visit_column_attechments_2
            ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_2.replace(/\\/g, "/")}`
            : null,
          visit_column_attechments_3: sanitized.visit_column_attechments_3
            ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_3.replace(/\\/g, "/")}`
            : null,
          visit_column_attechments_4: sanitized.visit_column_attechments_4
            ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_4.replace(/\\/g, "/")}`
            : null,
          visit_column_attechments_5: sanitized.visit_column_attechments_5
            ? `${VISIT_IMG_LINK_EXTENDED}/${sanitized.visit_column_attechments_5.replace(/\\/g, "/")}`
            : null,
          created_date_time: sanitized.created_date_time
            ? formatDateAndTimeCreateDateTime(sanitized.created_date_time)
            : "",
          companyFlag: ownerData.company_flag,
          applicationLoginName,
          contact_mobile,
          company_name,
        };
      })
    );

    // Return response
    if (sanitizedVisits.length > 0) {
      return resSuccess({ data: { item: sanitizedVisits } });
    } else {
      return resError({
        ack_msg: "No Visit Data",
        developer_msg: "No visits found for the provided criteria",
      });
    }
  } catch (e) {
    console.error("Error in getAllVisitMaster:", e);
    return resBadRequest({ developer_msg: `Error: ${e.message}` });
  }
};

export const visitMasterCreate = async (req) => {
  const currentDate = new Date();
  const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");

  try {
    const requiredFields = [
      "visit_type_id",
      "remark",
      "a_application_login_id",
    ];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return resError({
        ack_msg: "Missing required fields",
        developer_msg: `Required fields missing: ${missingFields.join(", ")}`,
      });
    }

    const {
      visit_type_id,
      remark,
      a_application_login_id,
      contact_id,
      person_name,
    } = req.body;

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "Company not found for the given login ID",
      });
    }
    console.log("frfrfrfrfrfrfrfr", req.body);

    // Create visit
    const visitTypeMaster = visitsModel(req.tenantDB);
    const companyId = findCompanyId.company_masters_id.toString();
    const attachmentPaths = {};

    for (let i = 1; i <= 5; i++) {
      const fieldName = `visit_column_attechments_${i}`;
      const file = req.files?.[fieldName]?.[0];

      if (file && file.path) {
        const fileName = path.basename(file.path);

        const directoryPath = path.join(
          process.cwd(),
          "media-folder",
          "visit_image",
          companyId
        );

        await fs.mkdirp(directoryPath);

        const destinationPath = path.join(directoryPath, fileName);

        await fs.move(file.path, destinationPath);

        attachmentPaths[fieldName] = path.join(companyId, fileName);
      }
    }
    const newVisitData = await visitTypeMaster.create({
      visit_type_id,
      start_date: formattedDate,
      remark,
      a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      contact_id,
      person_name,
      created_date_time: formattedDate,
      visit_column_number_1: req.body.visit_column_number_1 || "",
      visit_column_number_2: req.body.visit_column_number_2 || "",
      visit_column_number_3: req.body.visit_column_number_3 || "",
      visit_column_number_4: req.body.visit_column_number_4 || "",
      visit_column_number_5: req.body.visit_column_number_5 || "",
      visit_column_text_1: req.body.visit_column_text_1 || "",
      visit_column_text_2: req.body.visit_column_text_2 || "",
      visit_column_text_3: req.body.visit_column_text_3 || "",
      visit_column_text_4: req.body.visit_column_text_4 || "",
      visit_column_text_5: req.body.visit_column_text_5 || "",
      visit_column_text_area_1: req.body.visit_column_text_area_1 || "",
      visit_column_text_area_2: req.body.visit_column_text_area_2 || "",
      visit_column_text_area_3: req.body.visit_column_text_area_3 || "",
      visit_column_text_area_4: req.body.visit_column_text_area_4 || "",
      visit_column_text_area_5: req.body.visit_column_text_area_5 || "",
      visit_column_date_1: req.body.visit_column_date_1 || "",
      visit_column_date_2: req.body.visit_column_date_2 || "",
      visit_column_date_3: req.body.visit_column_date_3 || "",
      visit_column_date_4: req.body.visit_column_date_4 || "",
      visit_column_date_5: req.body.visit_column_date_5 || "",
      visit_column_date_and_time_1: req.body.visit_column_date_and_time_1 || "",
      visit_column_date_and_time_2: req.body.visit_column_date_and_time_2 || "",
      visit_column_date_and_time_3: req.body.visit_column_date_and_time_3 || "",
      visit_column_date_and_time_4: req.body.visit_column_date_and_time_4 || "",
      visit_column_date_and_time_5: req.body.visit_column_date_and_time_5 || "",
      visit_column_time_1: req.body.visit_column_time_1 || "",
      visit_column_time_2: req.body.visit_column_time_2 || "",
      visit_column_time_3: req.body.visit_column_time_3 || "",
      visit_column_time_4: req.body.visit_column_time_4 || "",
      visit_column_time_5: req.body.visit_column_time_5 || "",
      visit_column_switch_1: req.body.visit_column_switch_1 || false,
      visit_column_switch_2: req.body.visit_column_switch_2 || false,
      visit_column_switch_3: req.body.visit_column_switch_3 || false,
      visit_column_switch_4: req.body.visit_column_switch_4 || false,
      visit_column_switch_5: req.body.visit_column_switch_5 || false,
      visit_column_decimal_1: req.body.visit_column_decimal_1 || "",
      visit_column_decimal_2: req.body.visit_column_decimal_2 || "",
      visit_column_decimal_3: req.body.visit_column_decimal_3 || "",
      visit_column_decimal_4: req.body.visit_column_decimal_4 || "",
      visit_column_decimal_5: req.body.visit_column_decimal_5 || "",
      visit_column_dropdown_1: req.body.visit_column_dropdown_1 || "",
      visit_column_dropdown_2: req.body.visit_column_dropdown_2 || "",
      visit_column_dropdown_3: req.body.visit_column_dropdown_3 || "",
      visit_column_dropdown_4: req.body.visit_column_dropdown_4 || "",
      visit_column_dropdown_5: req.body.visit_column_dropdown_5 || "",
      visit_column_radio_1: req.body.visit_column_radio_1 || "",
      visit_column_radio_2: req.body.visit_column_radio_2 || "",
      visit_column_radio_3: req.body.visit_column_radio_3 || "",
      visit_column_radio_4: req.body.visit_column_radio_4 || "",
      visit_column_radio_5: req.body.visit_column_radio_5 || "",
      visit_column_attechments_1: attachmentPaths.visit_column_attechments_1 || "",
      visit_column_attechments_2: attachmentPaths.visit_column_attechments_2 || "",
      visit_column_attechments_3: attachmentPaths.visit_column_attechments_3 || "",
      visit_column_attechments_4: attachmentPaths.visit_column_attechments_4 || "",
      visit_column_attechments_5: attachmentPaths.visit_column_attechments_5 || "",
      longitude: req.body.longitude || "",
      latitude: req.body.latitude || "",
      address: req.body.address || "",
    });

    // Notification permission check
    const notictionpermission = await loginModel.findOne({
      where: {
        isDelete: 0,
        id: a_application_login_id,
      },
      attributes: ["team_visit_entry"],
    });


    if (notictionpermission) {
      // Fetch the contact details to get assigned_team_member
      const contactData = await contactModel(req.tenantDB).findOne({
        where: {
          id: newVisitData.contact_id, // Assuming contactBody has contact_id
          isDelete: 0,
        },
        attributes: ["assinged_to_work_a_application_id"],
      });

      // Parse assigned_team_member (comma-separated string) into an array
      const assignedTeamMembers = contactData?.assinged_to_work_a_application_id
        ? contactData.assinged_to_work_a_application_id
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !isNaN(id))
        : [];

      // Fetch owner login IDs for the company
      const ownerTokenData = await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          company_masters_id: findCompanyId.company_masters_id,
          company_flag: 1,
        },
        attributes: ["a_application_login_id"],
      });

      // Fetch reporting member details
      const reportingMemberData = await loginModel.findOne({
        where: {
          isDelete: 0,
          id: findCompanyId.a_application_login_id,
        },
        attributes: ["reporting_member"],
      });

      // Safely handle reporting_member (ensure it's an array)
      const reportingMembers = Array.isArray(
        reportingMemberData?.reporting_member
      )
        ? reportingMemberData.reporting_member
        : reportingMemberData?.reporting_member
          ? [reportingMemberData.reporting_member]
          : [];


      // Combine owner login IDs, reporting members, and assigned team members, excluding the creator

      const uniqueLoginIds = new Set([
        ...ownerTokenData.map((item) => item.a_application_login_id),
        ...reportingMembers,
        ...assignedTeamMembers,
      ]);
      const allLoginIds = [...uniqueLoginIds].filter(
        (loginId) => loginId != newVisitData.a_application_login_id
      );
      if (allLoginIds.length > 0) {
        // Fetch tokens for all login IDs
        const findTokens = await loginModel.findAll({
          where: {
            id: {
              [Sequelize.Op.in]: allLoginIds,
            },
            isDelete: 0,
          },
          attributes: [
            "android_refresh_token",
            "web_refresh_token",
            "ios_refresh_token",
          ],
        });

        // Collect and filter non-empty tokens
        const tokens = findTokens
          .flatMap((tokenObj) => [
            tokenObj.android_refresh_token,
            tokenObj.web_refresh_token,
            tokenObj.ios_refresh_token,
          ])
          .filter((token) => token && token.trim() !== "");

        if (tokens.length > 0) {
          try {
            await sendMultipleNotification({
              deviceTokens: tokens,
              title: "Visit Created",
              // body: remark || 'A new visit has been created',
              data: {
                page_id: PAGE_ID.VISIT,
              },
            });
            console.log(
              "Notifications sent successfully to",
              tokens.length,
              "devices"
            );
          } catch (notificationError) {
            console.error(
              "Notification failed (non-critical):",
              notificationError.message
            );
          }
        } else {
          console.log(
            "No device tokens found for owners, reporting members, or assigned team members."
          );
        }
      } else {
        console.log(
          "No owner login IDs, reporting members, or assigned team members found."
        );
      }
    } else {
      console.log("Permission denied: team_visit_entry is not 1");
    }

    return resSuccess({
      data: { item: newVisitData },
      ack_msg: "Visit created successfully",
    });
  } catch (error) {
    console.error("Error in visitMasterCreate:", error);
    return resBadRequest({
      ack_msg: "Error creating visit",
      developer_msg: error.message,
    });
  }
};

const processVisitFile = async (file, companyId) => {
  if (!file?.path) return null;

  const fileName = path.basename(file.path);

  const directoryPath = path.join(
    process.cwd(),
    "media-folder",
    "visit_image",
    companyId
  );

  await fs.mkdirp(directoryPath);

  const destinationPath = path.join(directoryPath, fileName);

  await fs.move(file.path, destinationPath);

  return path.join(companyId, fileName);
};

export const visitMasterUpdate = async (req) => {
  const currentDate = new Date();
  const formattedDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");

  try {
    console.log("FILES => ", req.files);
    const { visit_type_id, remark, a_application_login_id, visit_id } =
      req.body;

    const visit_image = req.files?.visit_image?.[0];

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const companyId = findCompanyId.company_masters_id.toString();

    let convertPathVisitImage = null;
    let directoryPath;

    if (visit_image && visit_image.path) {
      const fileName = path.basename(visit_image.path);

      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "visit_image",
        companyId
      );

      await fs.mkdirp(directoryPath);

      const destinationPath = path.join(directoryPath, fileName);
      await fs.move(visit_image.path, destinationPath);

      convertPathVisitImage = path.join(companyId, fileName);
    }
    const attachmentPaths = {};

    for (let i = 1; i <= 5; i++) {

      const fieldName = `visit_column_attechments_${i}`;

      const file = req.files?.[fieldName]?.[0];

      if (file && file.path) {

        const fileName = path.basename(file.path);

        const directoryPath = path.join(
          process.cwd(),
          "media-folder",
          "visit_image",
          companyId
        );

        await fs.mkdirp(directoryPath);

        const destinationPath = path.join(
          directoryPath,
          fileName
        );

        await fs.move(
          file.path,
          destinationPath
        );

        attachmentPaths[fieldName] =
          path.join(companyId, fileName);
      }
    }

    const visitTypeMaster = visitsModel(req.tenantDB);
    const visitTypeModels = visitTypeModel(req.tenantDB);
    const whereClause = {
      isDelete: 0,
      id: visit_id,
    };
    const customVisitColumnKeys = [
      'visit_column_number_1', 'visit_column_number_2', 'visit_column_number_3', 'visit_column_number_4', 'visit_column_number_5',
      'visit_column_text_1', 'visit_column_text_2', 'visit_column_text_3', 'visit_column_text_4', 'visit_column_text_5',
      'visit_column_text_area_1', 'visit_column_text_area_2', 'visit_column_text_area_3', 'visit_column_text_area_4', 'visit_column_text_area_5',
      'visit_column_date_1', 'visit_column_date_2', 'visit_column_date_3', 'visit_column_date_4', 'visit_column_date_5',
      'visit_column_date_and_time_1', 'visit_column_date_and_time_2', 'visit_column_date_and_time_3', 'visit_column_date_and_time_4', 'visit_column_date_and_time_5',
      'visit_column_time_1', 'visit_column_time_2', 'visit_column_time_3', 'visit_column_time_4', 'visit_column_time_5',
      'visit_column_switch_1', 'visit_column_switch_2', 'visit_column_switch_3', 'visit_column_switch_4', 'visit_column_switch_5',
      'visit_column_decimal_1', 'visit_column_decimal_2', 'visit_column_decimal_3', 'visit_column_decimal_4', 'visit_column_decimal_5',
      'visit_column_dropdown_1', 'visit_column_dropdown_2', 'visit_column_dropdown_3', 'visit_column_dropdown_4', 'visit_column_dropdown_5',
      'visit_column_radio_1', 'visit_column_radio_2', 'visit_column_radio_3', 'visit_column_radio_4', 'visit_column_radio_5', 'visit_column_attechments_1', 'visit_column_attechments_2', 'visit_column_attechments_3', 'visit_column_attechments_4', 'visit_column_attechments_5',];

    const filledCustomColumns = customVisitColumnKeys.filter(key => {
      let value = req.body[key];
      if (value === undefined || value === null) return false;
      if (typeof value === 'string' && key.includes('switch')) {
        value = value.trim().toLowerCase();
        if (value === 'true') return true;
        if (value === 'false' || value === '' || value === '0') return false;
      }
      if (key.includes('switch')) {
        if (typeof value === 'boolean') return value === true;
        if (typeof value === 'string') {
          return value.trim().toLowerCase() === 'true';
        }
        return false;
      }
      if (key.includes('date') && typeof value === 'string') {
        if (value === '0000-00-00' || value === '' || value.trim() === '') return false;
      }
      if (key.includes('time') && typeof value === 'string') {
        if (value === '00:00:00' || value === '00:00' || value.trim() === '') return false;
      }
      if (typeof value === 'string') {
        return value.trim() !== '';
      }
      if (typeof value === 'number') {
        return true;
      }
      return !!value;
    });
    console.log("filledCustomColumnsfilledCustomColumnsfilledCustomColumns", filledCustomColumns);


    let customFieldTitles = [];
    if (filledCustomColumns.length > 0) {
      const customFormFiledModel = customFieldFormModel(req.tenantDB);
      const customFields = await customFormFiledModel.findAll({
        where: {
          reference_column_name: filledCustomColumns
        },
        attributes: ['reference_column_name', 'title'],
        raw: true
      });
      const titleMap = {};
      customFields.forEach(field => {
        titleMap[field.reference_column_name] = field.title;
      });

      customFieldTitles = filledCustomColumns.map(key => {
        let value = req.body[key];

        if (key.includes('attechments')) {
          const fileUrl = attachmentPaths[key] || req.body[key]; // new upload OR existing url
          if (fileUrl) {
            value = `<a href="${fileUrl}" target="_blank">View Attachment</a>`;
          }
        }

        return {
          key,
          title: titleMap[key] || key.replace(/_/g, ' ').toUpperCase(),
          value
        };
      });
    }
    const updateData = {
      visit_type_id,
      remark,
      end_date: formattedDate,
      visit_column_number_1: req.body.visit_column_number_1,
      visit_column_number_2: req.body.visit_column_number_2,
      visit_column_number_3: req.body.visit_column_number_3,
      visit_column_number_4: req.body.visit_column_number_4,
      visit_column_number_5: req.body.visit_column_number_5,
      visit_column_text_1: req.body.visit_column_text_1,
      visit_column_text_2: req.body.visit_column_text_2,
      visit_column_text_3: req.body.visit_column_text_3,
      visit_column_text_4: req.body.visit_column_text_4,
      visit_column_text_5: req.body.visit_column_text_5,
      visit_column_text_area_1: req.body.visit_column_text_area_1,
      visit_column_text_area_2: req.body.visit_column_text_area_2,
      visit_column_text_area_3: req.body.visit_column_text_area_3,
      visit_column_text_area_4: req.body.visit_column_text_area_4,
      visit_column_text_area_5: req.body.visit_column_text_area_5,
      visit_column_date_1: req.body.visit_column_date_1,
      visit_column_date_2: req.body.visit_column_date_2,
      visit_column_date_3: req.body.visit_column_date_3,
      visit_column_date_4: req.body.visit_column_date_4,
      visit_column_date_5: req.body.visit_column_date_5,
      visit_column_date_and_time_1: req.body.visit_column_date_and_time_1,
      visit_column_date_and_time_2: req.body.visit_column_date_and_time_2,
      visit_column_date_and_time_3: req.body.visit_column_date_and_time_3,
      visit_column_date_and_time_4: req.body.visit_column_date_and_time_4,
      visit_column_date_and_time_5: req.body.visit_column_date_and_time_5,
      visit_column_time_1: req.body.visit_column_time_1,
      visit_column_time_2: req.body.visit_column_time_2,
      visit_column_time_3: req.body.visit_column_time_3,
      visit_column_time_4: req.body.visit_column_time_4,
      visit_column_time_5: req.body.visit_column_time_5,
      visit_column_switch_1: req.body.visit_column_switch_1,
      visit_column_switch_2: req.body.visit_column_switch_2,
      visit_column_switch_3: req.body.visit_column_switch_3,
      visit_column_switch_4: req.body.visit_column_switch_4,
      visit_column_switch_5: req.body.visit_column_switch_5,
      visit_column_decimal_1: req.body.visit_column_decimal_1,
      visit_column_decimal_2: req.body.visit_column_decimal_2,
      visit_column_decimal_3: req.body.visit_column_decimal_3,
      visit_column_decimal_4: req.body.visit_column_decimal_4,
      visit_column_decimal_5: req.body.visit_column_decimal_5,
      visit_column_dropdown_1: req.body.visit_column_dropdown_1,
      visit_column_dropdown_2: req.body.visit_column_dropdown_2,
      visit_column_dropdown_3: req.body.visit_column_dropdown_3,
      visit_column_dropdown_4: req.body.visit_column_dropdown_4,
      visit_column_dropdown_5: req.body.visit_column_dropdown_5,
      visit_column_radio_1: req.body.visit_column_radio_1,
      visit_column_radio_2: req.body.visit_column_radio_2,
      visit_column_radio_3: req.body.visit_column_radio_3,
      visit_column_radio_4: req.body.visit_column_radio_4,
      visit_column_radio_5: req.body.visit_column_radio_5,
      visit_column_attechments_1:
        attachmentPaths.visit_column_attechments_1,

      visit_column_attechments_2:
        attachmentPaths.visit_column_attechments_2,

      visit_column_attechments_3:
        attachmentPaths.visit_column_attechments_3,

      visit_column_attechments_4:
        attachmentPaths.visit_column_attechments_4,

      visit_column_attechments_5:
        attachmentPaths.visit_column_attechments_5,
      stop_latitude: req.body.stop_latitude || "",
      stop_longitude: req.body.stop_longitude || "",
      stop_address: req.body.stop_address || "",
    };

    const visitTable = await visitTypeMaster.findOne({
      where: {
        isDelete: 0,
        id: visit_id,
      },
      attributes: ["contact_id", "a_application_login_id", "person_name"],
    });
    const usernameLiteral = async (a_application_login_id) => {
      const user = await loginModel.findOne({
        where: {
          id: a_application_login_id,
          isDelete: 0,
        },
        attributes: ["username"],
      });

      return user?.username || null;
    };

    const visitType = await visitTypeModels.findOne({
      where: {
        id: visit_type_id,
        isDelete: 0,
      },
      attributes: ["visit_type"],
    });

    const username = await usernameLiteral(a_application_login_id);
    const visitBy = await usernameLiteral(
      visitTable.dataValues.a_application_login_id
    );
    const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    let customFieldsHTML = "";
    if (customFieldTitles.length > 0) {
      customFieldsHTML = "<br><b>Custom Fields:</b><br>" +
        customFieldTitles.map(field =>
          `<b>${field.title}:</b> ${field.value}`
        ).join("<br>");
    }

    const visitMsgBody = {
      contact_masters_id: visitTable.dataValues.contact_id,
      a_application_login_id: a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      description: `
        <b>Visits</b><br>
        <b>#${visit_id}</b><br>
        <b>Visit Type:</b> ${visitType.dataValues.visit_type || "N/A"}<br>
        <b>Visit By:</b> ${visitBy || "N/A"}<br>
        <b>Contact Name:</b> ${visitTable.dataValues.person_name || "N/A"}<br>
        <b>Remark:</b> ${remark || "N/A"}<br>
        ${customFieldsHTML}
      `,

      created_date_time: formattedDateTime,
      message_side: 1,
      message_type_id: 2,
      application_login_name: username,
    };
    const ContactMSG = contactMessageHistory(req.tenantDB);
    const ContactMaster = contactModel(req.tenantDB);

    const contactToMessage = await ContactMSG.create(visitMsgBody);

    if (req.body.stop_task_id) {
      const TaskMessageHistory = taskMessageHistroyModel(req.tenantDB);

      await TaskMessageHistory.create({
        task_id: req.body.stop_task_id,
        a_application_login_id: a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        description: `
      <b>Visits</b><br>
      <b>#${visit_id}</b><br>
      <b>Visit Type:</b> ${visitType.dataValues.visit_type || "N/A"}<br>
      <b>Visit By:</b> ${visitBy || "N/A"}<br>
      <b>Contact Name:</b> ${visitTable.dataValues.person_name || "N/A"}<br>
      <b>Remark:</b> ${remark || "N/A"}<br>
      ${customFieldsHTML}
    `,
        created_date_time: formattedDateTime,
        message_side: 1,
        message_type_id: 0,
        application_login_name: username,
      });
    }
    console.log("FINAL DESCRIPTION =>", visitMsgBody.description);

    const updateUnread = await ContactMaster.update({
      is_read_by_a_application_login_id: a_application_login_id
    }, {
      where: {
        id: visitTable.dataValues.contact_id
      }
    })

    if (convertPathVisitImage) {
      updateData.visit_image = convertPathVisitImage;
    }

    const updateVisitResult = await visitTypeMaster.update(updateData, {
      where: whereClause,
    });

    if (updateVisitResult) {
      const visitData = await visitTypeMaster.findOne({
        where: {
          isDelete: 0,
          id: visit_id,
        },
        attributes: ["a_application_login_id"],
        raw: true
      });

      if (!visitData || visitData.length === 0) {
        return resError({
          ack_msg: "No visit data found.",
          developer_msg: `No visit data found for visit_id: ${visit_id}`,
        });
      }

      const contactData = await contactModel(req.tenantDB).findOne({
        where: {
          a_application_login_id: visitData.a_application_login_id,
        },
        attributes: ["assinged_to_work_a_application_id", "person_name"],
      });

      const assignedIds = contactData?.assinged_to_work_a_application_id ? contactData?.assinged_to_work_a_application_id.split(",").map((id) => id.trim()) : [];
      if (isValid(assignedIds)) {
        const findTokens = await loginModel.findAll({
          where: {
            id: assignedIds,
            isDelete: 0,
          },
          attributes: [
            "android_refresh_token",
            "web_refresh_token",
            "ios_refresh_token",
          ],
        });

        const tokens = findTokens
          .flatMap((tokenObj) => {
            const {
              android_refresh_token,
              web_refresh_token,
              ios_refresh_token,
            } = tokenObj.dataValues;
            return [android_refresh_token, web_refresh_token, ios_refresh_token];
          })
          .filter((token) => token && token.trim() !== "");

        if (tokens.length > 0) {
          try {
            await sendMultipleNotification({
              deviceTokens: tokens,
              title: `#${visit_id} Visit Stopped by ${contactData.person_name}`,
              data: {
                page_id: PAGE_ID.VISIT,
              },
            });
          } catch (notificationError) {
            console.error(
              "Notification failed (non-critical):",
              notificationError.message
            );
          }
        } else {
          console.log("No device tokens found for owners.");
        }
      }
    } else {
      console.log("Permission denied: team_visit_entry is not 1");
    }
    if (updateVisitResult[0] > 0) {
      return resSuccess({
        data: { item: updateVisitResult },
        ack_msg: "Visit Stopped successfully",
      });
    } else {
      return resError({
        ack_msg: "Update failed",
        developer_msg: "Visit data not found or not updated",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error updating visit",
      developer_msg: error.message,
    });
  }
};
