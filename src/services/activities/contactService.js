import { GoogleGenerativeAI } from '@google/generative-ai';
import { randomUUID } from "crypto";
import fs from "fs-extra";
import { google } from "googleapis";
import jwt from 'jsonwebtoken';
import moment from "moment";
import path from "path";
import Sequelize, { Op } from "sequelize";
import { getUserRights } from '../../helpers/rightsHelper.js';
import { buildSearchQuery } from '../../helpers/searchAlgoV1.js';
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { routePlanVsContactsModel } from "../../models/activities/routePlanVsContactsModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { labelModel } from "../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { stateModel } from "../../models/masters/stateModel.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { priceListMastersModel } from "../../models/product_settings/priceListMastersModel.js";
import { CONTACT_AUTO_REFRESH_INACTIVITY_DELAY, CONTACT_AUTO_REFRESH_ON, CONTACT_AUTO_REFRESH_TIMEOUT, EXPORTS_LINK_EXTENDED, JWT_TOKEN_SIGNATURE, PDF_LINK_CONTACT_PRINT, VISITING_CARD_VIEW } from "../../utils/appConstants.js";
import { GOOGLE_API, PAGE_ID } from "../../utils/AppEnumeration.js";
import { exportData } from "../../utils/exporter.js";
import logger from "../../utils/logger.js";
import { getDateTimeColumnsWithType } from '../../utils/sequelizeDateColumns.js';
import {
  customFormFiledDataAddToChatHistory,
  formatDateAndTimeCreateDateTime,
  generateOTP,
  isDuplicateContact,
  isValid,
  normalizeToTenDigit,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, getCompanyDetailByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";
import { isFeatureEnabled } from "../company_setup/featureFlagServices.js";
import { ClaudeOfficeWhatsAppOtp, sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";
import { autoAssignmentContactIdsGet, prepareMailAndWhatsappSenderToTheContact } from "../other_settings/wrkflwAutoAssignmentContactService.js";
import { generateContactAddressPdf, generateContactEnvelopePdf } from "../pdfmeEngine/contactPrintGenerate.js";
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_API.GOOGLE_CLIENT_ID,
  GOOGLE_API.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: GOOGLE_API.GOOGLE_REDIRECT_URI });

const people = google.people({ version: "v1", auth: oauth2Client });
export const getContactByIds = async (req) => {
  try {
    let { id, a_application_login_id } = req.body;
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    let whereClause = {
      id: id,
      company_masters_id: findCompanyId.company_masters_id,
    };

    const contact = contactModel(req.tenantDB);

    const findContact = await contact.findOne({
      where: whereClause,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = contact_masters.country AND a_countries.isDelete=0)"
            ),
            "country_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_states.state_name FROM a_states WHERE a_states.id = contact_masters.state)"
            ),
            "state_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = contact_masters.city)"
            ),
            "city_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_areas.area_name FROM a_areas WHERE a_areas.id = contact_masters.area)"
            ),
            "area_name",
          ],
        ]
      }
    });
    const findContactJson = findContact ? findContact.toJSON() : null;
    if (findContactJson && findContactJson.mobile_number && !String(findContactJson.mobile_number).startsWith('+')) {
      findContactJson.mobile_number = `+${findContactJson.mobile_number}`;
    }
    return resSuccess({
      data: findContactJson,
    });
  } catch (e) {
    throw e;
  }
};

// Contact address label / envelope print — pdfme Document Designer path for
// the "Print Address"/"Print Envelope" buttons in Profile.tsx. Unlike
// shippingLabel there's no backend legacy fallback here (the legacy print is
// pure frontend, ContactAddressPrintView1.tsx/ContactAddressEnvelopePrintView.tsx
// call window.print() directly, never hitting the backend) — Profile.tsx
// checks the flag before ever calling these routes, so a flag-off request
// reaching here is refused rather than silently rendered.
const fetchContactPrint = async (req, docType, generateFn) => {
  try {
    const contactRes = await getContactByIds(req);
    // resSuccess coerces a null/not-found data into [] (truthy), so check for
    // a real contact row (contact.id) rather than just truthiness.
    const contact = contactRes?.data;
    if (!contact || !contact.id) return resError({ ack_msg: "Contact not found" });

    const findCompanyId = await getCompanyByLoginId(req.body.a_application_login_id);
    const company = await getCompanyDetailByLoginId(req.body.a_application_login_id);

    const City = cityModel(req.tenantDB);
    const State = stateModel(req.tenantDB);
    const companyCity = await City.findOne({ where: { id: company.city_id, isDelete: 0 }, attributes: ["city_name"], raw: true });
    const companyState = await State.findOne({ where: { id: company.state_id, isDelete: 0 }, attributes: ["state_name"], raw: true });
    company.city_name = companyCity?.city_name || "";
    company.state_name = companyState?.state_name || "";

    const documentDesignerEnabled = await isFeatureEnabled(findCompanyId.company_masters_id, "document_designer");
    if (!documentDesignerEnabled) {
      return resBadRequest({ ack_msg: "Document Designer is not enabled for this company" });
    }

    const outputDir = `media-folder/ContactPrint/${findCompanyId.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `contact_${docType === "contactAddress" ? "address" : "envelope"}_${Date.now()}.pdf`;
    const fullPath = path.join(uploadDir, fileName);
    const pdfPath = `${findCompanyId.company_masters_id}/${fileName}`;

    const buffer = await generateFn({
      contact,
      company: { ...company, id: findCompanyId.company_masters_id },
      documentTemplateId: req.body.document_template_id,
      tenantDB: req.tenantDB,
    });
    fs.writeFileSync(fullPath, buffer);

    return resSuccess({
      ack_msg: "PDF Generated",
      data: { path: PDF_LINK_CONTACT_PRINT + pdfPath, file_name: fileName },
    });
  } catch (err) {
    console.log("ContactPrint Error:", err);
    return resBadRequest({ developer_msg: err.message });
  }
};

export const fetchContactAddressPrint = async (req, res) => {
  return fetchContactPrint(req, "contactAddress", generateContactAddressPdf);
};

export const fetchContactEnvelopePrint = async (req, res) => {
  return fetchContactPrint(req, "contactEnvelope", generateContactEnvelopePdf);
};

export const getAllContact = async (req, feed = false, onlyMyBlog = false) => {
  try {
    let { ul, ll, labelId, sourceId, stageStatusId, request_flag, a_application_login_id, isPinByApplicationId, checkedOptionsContactassignOrNot, ids, route_id } = req.body;
    let masterWhere;
    const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: req.body })
    masterWhere = whereClause
    // Calculate total unread contacts across the entire table
    const User = contactModel(req.tenantDB);
    let unreadWhereClause = {
      isDelete: "0",
      is_archive: "0", // Unread contacts are not archived
    };

    if (request_flag == "location") {

      masterWhere = {
        ...masterWhere,
        isDelete: 0,
        latitude: { [Op.ne]: null, [Op.ne]: "" },
        longitude: { [Op.ne]: null, [Op.ne]: "" },
      };
    }

    // if single contact id provided
    if (ids && Array.isArray(ids)) {
      masterWhere["id"] = {
        [Op.in]: ids.map(Number),
      }
    } else if (route_id) {
      const routePlanVsContactsModelInstance = routePlanVsContactsModel(req.tenantDB);
      const assignedRouteContacts = await routePlanVsContactsModelInstance.findAll({
        where: { route_id: Number(route_id), isDelete: "0" },
        attributes: ["contact_id"],
        raw: true
      });
      const routeContactIds = assignedRouteContacts.map(c => Number(c.contact_id));
      masterWhere["id"] = {
        [Op.in]: routeContactIds,
      };
    }

    if (findCompanyId.company_flag === 1 || (findCompanyId.company_flag === 2 && showAllData)) {
      unreadWhereClause.company_masters_id = findCompanyId.company_masters_id;
    } else if (findCompanyId.company_flag === 2 && showPersonalData) {
      unreadWhereClause[Op.or] = [
        // { a_application_login_id: a_application_login_id },
        Sequelize.literal(
          `FIND_IN_SET(${a_application_login_id}, assinged_to_work_a_application_id)`
        ),
      ];
    } else {
      unreadWhereClause.a_application_login_id = a_application_login_id; // No data if no rights
    }

    unreadWhereClause[Op.and] = [...(unreadWhereClause[Op.and] || []), Sequelize.literal(`FIND_IN_SET(${a_application_login_id}, is_read_by_a_application_login_id) = 0`),];
    const totalUnreadOnPage = await User.count({ where: unreadWhereClause });

    const limit = Number(ll);
    const offset = Number(ul);

    /* Sorting and ordering */
    const order = [];

    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }


    if (stageStatusId) {
      // Kanban board fetch (single stage column) — respect the drag-order
      // within this column; NULL (never dragged) sorts last.
      order.push(Sequelize.literal("position IS NULL, position ASC"));
    }
    order.push([
      Sequelize.literal(
        `FIND_IN_SET(${isPinByApplicationId || 0}, is_pin_by_a_application_login_id)`
      ),
      'DESC'
    ]);

    order.push(['modified_date', 'DESC']);
    /* Sorting and ordering */

    const currentDate = new Date();
    const getTodayFormatDate = moment(currentDate).format("YYYY-MM-DD HH:mm:ss");
    const queryOptions = {
      where: masterWhere,
      order,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = contact_masters.country AND a_countries.isDelete=0)"
            ),
            "country_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_states.state_name FROM a_states WHERE a_states.id = contact_masters.state)"
            ),
            "state_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = contact_masters.city)"
            ),
            "city_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_areas.area_name FROM a_areas WHERE a_areas.id = contact_masters.area)"
            ),
            "area_name",
          ],
          [
            Sequelize.literal(
              `(SELECT source_types.source_name FROM source_types WHERE source_types.id = ${sourceId || "NULL"
              } AND source_types.isDelete = 0)`
            ),
            "selected_source_name",
          ],
          [
            Sequelize.literal(
              `(SELECT source_types.color FROM source_types WHERE source_types.id = ${sourceId || "NULL"
              } AND source_types.isDelete = 0)`
            ),
            "selected_source_color",
          ],
          [
            Sequelize.literal(
              `(SELECT CASE WHEN source_types.source_name IS NOT NULL THEN source_types.source_name ELSE '' END FROM source_types WHERE source_types.id = contact_masters.source_type_id AND source_types.isDelete = 0)`
            ),
            "source_name",
          ],
          [
            Sequelize.literal(
              "(SELECT COALESCE(source_types.color, '') FROM source_types WHERE source_types.id = contact_masters.source_type_id AND source_types.isDelete=0)"
            ),
            "source_name_color",
          ],
          [
            Sequelize.literal(
              "(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = contact_masters.contact_status AND stage_status_masters.isDelete = 0)"
            ),
            "stage_status_name",
          ],
          [
            Sequelize.literal(
              "(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = contact_masters.contact_status AND stage_status_masters.isDelete = 0)"
            ),
            "stage_status_color",
          ],
          [
            Sequelize.literal(
              `(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = ${stageStatusId || "NULL"
              } AND stage_status_masters.isDelete = 0)`
            ),
            "selected_label_name",
          ],
          [
            Sequelize.literal(
              `(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = ${stageStatusId || "NULL"
              } AND stage_status_masters.isDelete = 0)`
            ),
            "selected_label_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_masters.color) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, contact_masters.lable))`
            ),
            "label_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_masters.lable_name) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, contact_masters.lable))`
            ),
            "label_name",
          ],
          [
            Sequelize.literal(
              `(SELECT lable_masters.lable_name FROM lable_masters WHERE lable_masters.id = ${labelId || "NULL"
              } AND lable_masters.isDelete = 0)`
            ),
            "selected_label_name",
          ],
          [
            Sequelize.literal(
              `(SELECT lable_masters.color FROM lable_masters WHERE lable_masters.id = ${labelId || "NULL"
              } AND lable_masters.isDelete = 0)`
            ),
            "selected_label_color",
          ],
          //     [
          //       Sequelize.literal(
          //         `(SELECT contact_message_histories.description FROM contact_message_histories WHERE contact_message_histories.id = contact_masters.pinned_message AND contact_masters.isDelete = 0)`
          //       ),
          //       "pinned_message_decr",
          //     ],
          //     [
          //       Sequelize.literal(
          //         `(SELECT count(*) 
          // FROM reminder_messages 
          // WHERE reminder_messages.contact_masters_id = contact_masters.id 
          // AND reminder_messages.isDelete = 0 
          // AND reminder_data_time < '${getTodayFormatDate}')`
          //       ),
          //       "reminderDueCount",
          //     ]
        ],
      },
    };

    // Get total count of contacts matching the filters

    const totalCountFilter = await User.count({ where: whereClause });

    // Apply pagination
    // if (!searchTerm) {
    if (limit !== -1 && request_flag != 'location') queryOptions.limit = limit || 10;
    if (offset !== -1 && request_flag != 'location') queryOptions.offset = offset || 0;
    // }

    console.log("aaaa", masterWhere)
    console.log("----Contact Query--------")
    const contacts = await User.findAll(queryOptions);

    const formaDateColumntMap = getDateTimeColumnsWithType(User, {
      excludeTimestamps: true
    });
    const columnTypeMap = new Map(
      formaDateColumntMap?.map(item => [item.column, item.type])
    );
    function getColumnType(columnKey) {
      return columnTypeMap.get(columnKey) || null;
    }

    let activeTeamList;
    let activeTeamMap;
    if (contacts) {
      activeTeamList = await loginModel.findAll(
        {
          where: {
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT a_application_login_id
                FROM company_vs_application_logins
                WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
              )`)
            },
            isDelete: 0
          },
          attributes: ["username", "id"],
          raw: true
        }
      );
      activeTeamMap = new Map(
        activeTeamList.map(user => [user.id, user.username])
      );
    }
    const sanitizedContacts = await Promise.all(
      contacts.map(async (contactItem) => {
        const sanitized = sanitizeObjectOfNull(contactItem.toJSON());

        const isUnread = (sanitized?.is_read_by_a_application_login_id ?? "").split(",").map((id) => id.trim()).includes(String(a_application_login_id)) ? 0 : 1;

        const loginId = sanitized.a_application_login_id;

        let createORassignName;
        let assignedNameList;

        if (isValid(sanitized.assinged_to_work_a_application_id)) {
          const assignedIds = sanitized.assinged_to_work_a_application_id.split(",").map((id) => id.trim()).filter((id) => id);

          if (assignedIds.length > 0) {
            createORassignName = activeTeamMap.get(Number(assignedIds[0])) || null;
            assignedNameList = assignedIds.map(id => activeTeamMap.get(Number(id))).filter(Boolean).join(', ');
          }
        }

        const created_by_name = activeTeamMap.get(Number(loginId)) || null;

        if (!isValid(createORassignName)) {
          createORassignName = created_by_name || "";
        }

        const finalName = `${isValid(sanitized.assinged_to_work_a_application_id) && createORassignName ? "Assign to: " : "Created by: "}${createORassignName || ""}`

        const assined_team_person_list = assignedNameList ? `Assign to: ${assignedNameList}` : "";
        const platform_x = req.body?.platform_x || "";
        let mobile_number = sanitized.mobile_number;
        if (platform_x == '1') {
          mobile_number =
            sanitized.mobile_number &&
              !String(sanitized.mobile_number).startsWith("+")
              ? `+${sanitized.mobile_number}`
              : sanitized.mobile_number;
        }
        return {
          ...sanitized,
          mobile_number: mobile_number,
          created_date_time: sanitized.created_date_time ? formatDateAndTimeCreateDateTime(sanitized.created_date_time) : "",
          is_unread: isUnread,
          teamMemberName: finalName || "",
          assined_team_person_list,
          created_by_name: created_by_name || "",
          reminderDueCount: 0,
          pinned_message_decr: "",
        };
      })
    );

    const formatedContacts = await Promise.all(
      sanitizedContacts.map(row => {
        const formatted = { ...row };

        Object.keys(formatted).forEach(column => {
          if (!getColumnType(column)) return;
          if ((
            formatted[column] &&
            formatted[column] != "" &&
            formatted[column] != "00:00:00" &&
            formatted[column] != "0000-00-00" &&
            formatted[column] != '0000-00-00 00:00:00')
          ) {
            switch (getColumnType(column)) {
              case "DATEONLY":
                formatted[column] = moment(formatted[column]).format("DD-MM-YYYY");
                break;

              case "DATE":
                formatted[column] = moment(formatted[column]).format("DD-MM-YYYY hh:mm A");
                break;

              case "TIME":
                formatted[column] = moment(formatted[column], ["HH:mm:ss", "HH:mm"])
                  .format("hh:mm A");
                break;
            }
          }
        });
        return formatted;
      })
    );

    return resSuccess({
      data: {
        ack: 1,
        item: formatedContacts,
        totalUnreadOnPage,
        totalCountFilter, // Added total count
        CONTACT_AUTO_REFRESH_ON: CONTACT_AUTO_REFRESH_ON,
        CONTACT_AUTO_REFRESH_TIMEOUT: CONTACT_AUTO_REFRESH_TIMEOUT,
        CONTACT_AUTO_REFRESH_INACTIVITY_DELAY: CONTACT_AUTO_REFRESH_INACTIVITY_DELAY

      },
    });
  } catch (e) {
    console.log("error--------------", e);

    return resBadRequest({
      ack: 0,
      developer_msg: e.message,
    });
  }
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatDateForDisplay = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${day}-${month}-${year} ${hours12}:${minutes} ${ampm}`;
};
export const addContact = async (req, res) => {
  try {

    const currentDate = new Date();
    const formattedDate = formatDate(currentDate);

    // Validate req.tenantDB
    if (!req.tenantDB || typeof req.tenantDB !== "object") {
      return resError({
        ack_msg: "Invalid tenant database configuration",
        developer_msg: "req.tenantDB is not properly initialized",
      });
    }

    // Validate req.body
    if (!req.body || !req.body.a_application_login_id) {
      return resError({
        ack_msg: "Invalid request data",
        developer_msg: "Request body or a_application_login_id is missing",
      });
    }
    const contactBody = {
      person_name: req.body.person_name || "unknown",
      mobile_number: normalizeToTenDigit(req.body.mobile_number) || "",
      raw_mobile_number: req.body.mobile_number || "",
      email_id: req.body.email_id || "",
      country: req.body.country || "",
      state: req.body.state || "",
      company_name: req.body.company_name || "",
      district: req.body.district || "",
      city: req.body.city || "",
      area: req.body.area || "",
      pincode: req.body.pincode || "",
      address: req.body.address || "",
      a_application_login_id: req.body.a_application_login_id,
      source_type_id: req.body.source_type_id || "",
      assinged_to_price_list: req.body.assinged_to_price_list || 0,
      shipping_address: req.body.shipping_address || "",
      gst_number: req.body.gst_number || "",
      gst_reg_type: req.body.gst_reg_type || "",
      gst_reg_date: req.body.gst_reg_date || null,
      lable: req.body.lable || "",
      referance_contact: req.body.referance_contact || 0,
      assinged_to_work_a_application_id: req.body.a_application_login_id || "",
      cntc_column_number_1: req.body.cntc_column_number_1 || "",
      cntc_column_number_2: req.body.cntc_column_number_2 || "",
      cntc_column_number_3: req.body.cntc_column_number_3 || "",
      cntc_column_number_4: req.body.cntc_column_number_4 || "",
      cntc_column_number_5: req.body.cntc_column_number_5 || "",
      cntc_column_text_1: req.body.cntc_column_text_1 || "",
      cntc_column_text_2: req.body.cntc_column_text_2 || "",
      cntc_column_text_3: req.body.cntc_column_text_3 || "",
      cntc_column_text_4: req.body.cntc_column_text_4 || "",
      cntc_column_text_5: req.body.cntc_column_text_5 || "",
      cntc_column_text_area_1: req.body.cntc_column_text_area_1 || "",
      cntc_column_text_area_2: req.body.cntc_column_text_area_2 || "",
      cntc_column_text_area_3: req.body.cntc_column_text_area_3 || "",
      cntc_column_text_area_4: req.body.cntc_column_text_area_4 || "",
      cntc_column_text_area_5: req.body.cntc_column_text_area_5 || "",
      cntc_column_date_1: req.body.cntc_column_date_1 || "",
      cntc_column_date_2: req.body.cntc_column_date_2 || "",
      cntc_column_date_3: req.body.cntc_column_date_3 || "",
      cntc_column_date_4: req.body.cntc_column_date_4 || "",
      cntc_column_date_5: req.body.cntc_column_date_5 || "",
      cntc_column_date_and_time_1: req.body.cntc_column_date_and_time_1 || "",
      cntc_column_date_and_time_2: req.body.cntc_column_date_and_time_2 || "",
      cntc_column_date_and_time_3: req.body.cntc_column_date_and_time_3 || "",
      cntc_column_date_and_time_4: req.body.cntc_column_date_and_time_4 || "",
      cntc_column_date_and_time_5: req.body.cntc_column_date_and_time_5 || "",
      cntc_column_time_1: req.body.cntc_column_time_1 || "",
      cntc_column_time_2: req.body.cntc_column_time_2 || "",
      cntc_column_time_3: req.body.cntc_column_time_3 || "",
      cntc_column_time_4: req.body.cntc_column_time_4 || "",
      cntc_column_time_5: req.body.cntc_column_time_5 || "",
      cntc_column_switch_1: req.body.cntc_column_switch_1 || false,
      cntc_column_switch_2: req.body.cntc_column_switch_2 || false,
      cntc_column_switch_3: req.body.cntc_column_switch_3 || false,
      cntc_column_switch_4: req.body.cntc_column_switch_4 || false,
      cntc_column_switch_5: req.body.cntc_column_switch_5 || false,
      cntc_column_decimal_1: req.body.cntc_column_decimal_1 || "",
      cntc_column_decimal_2: req.body.cntc_column_decimal_2 || "",
      cntc_column_decimal_3: req.body.cntc_column_decimal_3 || "",
      cntc_column_decimal_4: req.body.cntc_column_decimal_4 || "",
      cntc_column_decimal_5: req.body.cntc_column_decimal_5 || "",
      cntc_column_dropdown_1: req.body.cntc_column_dropdown_1 || "",
      cntc_column_dropdown_2: req.body.cntc_column_dropdown_2 || "",
      cntc_column_dropdown_3: req.body.cntc_column_dropdown_3 || "",
      cntc_column_dropdown_4: req.body.cntc_column_dropdown_4 || "",
      cntc_column_dropdown_5: req.body.cntc_column_dropdown_5 || "",
      cntc_column_radio_1: req.body.cntc_column_radio_1 || "",
      cntc_column_radio_2: req.body.cntc_column_radio_2 || "",
      cntc_column_radio_3: req.body.cntc_column_radio_3 || "",
      cntc_column_radio_4: req.body.cntc_column_radio_4 || "",
      cntc_column_radio_5: req.body.cntc_column_radio_5 || "",
      longitude: req.body.longitude || "",
      latitude: req.body.latitude || "",
      client_code: req.body.client_code || "",
      address_location: req.body.address_location || "",
    };

    const findCompanyId = await getCompanyByLoginId(
      contactBody.a_application_login_id
    );
    if (!findCompanyId || !findCompanyId.company_masters_id) {
      logger.error(
        "Company not found for a_application_login_id:",
        contactBody.a_application_login_id
      );
      return resError({
        ack_msg: "Company not found",
        developer_msg: "No company found for the provided login ID",
      });
    }
    contactBody.company_masters_id = findCompanyId.company_masters_id;

    // Initialize models
    const COTModel = contactModel(req.tenantDB);
    if (!COTModel || typeof COTModel.create !== "function") {
      logger.error("Invalid contactModel:", COTModel);
      return resError({
        ack_msg: "Invalid database model",
        developer_msg: "contactModel is not properly initialized",
      });
    }

    const INqModel = inquiryModel(req.tenantDB);
    const CTMModel = contactMessageHistory(req.tenantDB);

    // Check user rights limit
    const userList = await COTModel.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: ["company_masters_id", "a_application_login_id"],
    });
    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        page_id: PAGE_ID.CONTACT,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    });

    const userCount = userList.length;
    for (const userRight of userRightsList) {
      try {
        const rightsJson = JSON.parse(
          userRight.dataValues.a_page_id_rights_jason || "{}"
        );

        if (
          typeof rightsJson.limit === "number" &&
          rightsJson.limit > 0 &&
          userCount >= rightsJson.limit
        ) {
          return resError({
            ack_msg: `Your Contacts Limit Exceeded`,
            developer_msg: `Limit ${rightsJson.limit} reached for Company`,
          });
        }
      } catch (err) {
        logger.error(
          "Error parsing JSON for a_application_login_id:",
          userRight.a_application_login_id,
          err
        );
      }
    }
    const companyData = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["is_contact_validation", "company_name", "id"],
    });

    const a_company_name = companyData.dataValues.company_name;
    const a_company_id = companyData.dataValues.id;

    {
      const existingMobileNum = await COTModel.findOne({
        where: {
          mobile_number: contactBody.mobile_number,
          company_masters_id: findCompanyId.company_masters_id,
          isDelete: 0,
        },
        attributes: ["mobile_number", "person_name", "id"],
      });

      if (
        existingMobileNum?.dataValues?.mobile_number &&
        isDuplicateContact(
          companyData?.is_contact_validation,
          existingMobileNum.dataValues.person_name,
          contactBody.person_name,
        )
      ) {
        return resError({
          ack_msg: "Mobile number already exists in this company.",
          developer_msg: "Mobile number already exists in this company.",
        });
      }
    }

    // Check for existing GST number
    if (contactBody.gst_number) {
      const existingGst = await COTModel.findOne({
        where: {
          gst_number: contactBody.gst_number,
          company_masters_id: findCompanyId.company_masters_id,
          isDelete: 0,
        },
        attributes: ["gst_number", "id"],
      });
      if (existingGst && existingGst.dataValues.gst_number) {
        return resError({
          ack_msg: "GST number already exists in this company.",
          developer_msg: "GST number already exists in this company.",
        });
      }
    }

    // Check for existing GST number
    if (isValid(contactBody.client_code)) {
      const existingClientCode = await COTModel.findOne({
        where: {
          client_code: contactBody.client_code,
          company_masters_id: findCompanyId.company_masters_id,
          isDelete: 0,
        },
        attributes: ["client_code", "id"],
      });
      if (existingClientCode && existingClientCode.dataValues.client_code) {
        return resError({
          ack_msg: "This client code already exists.",
          developer_msg: "Client Code already exists in this company.",
        });
      }
    }

    /* Contact Assignment */
    const whatsappEmailSendTeamPersonList = [];
    const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
      source_type_id: req.body.source_type_id,
      country_id: req.body.country,
      state_id: req.body.state,
      city_id: req.body.city,
      area_id: req.body.area,
      description: req.body.description
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

    const assingd_ids = [
      ...(contactAssignedIdsStr ? contactAssignedIdsStr.split(",") : []),
      req.body.a_application_login_id,
    ].join(",");
    contactBody.assinged_to_work_a_application_id = assingd_ids || req.body.a_application_login_id
    /* Contact Assignment */

    // Create contact
    const contactCreate = await COTModel.create(contactBody);
    if (!contactCreate || !contactCreate.dataValues.id) {
      logger.error("Failed to create contact:", contactCreate);
      return resError({
        ack_msg: "Failed to create contact",
        developer_msg: "Contact creation returned no data",
      });
    }
    const contactEmailSendList = [];
    const contactWhatsappSendList = [];

    if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactCreate.dataValues.email_id)) {
      const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactAssignedIdsStr);
      if (result) {
        contactEmailSendList.push({
          email_id: contactCreate.dataValues.email_id,
          contact_detail: {
            person_name: contactCreate.dataValues.person_name,
            mobile_number: contactCreate.dataValues.mobile_number,
            company_name: contactCreate.dataValues.company_name
          },
          team_person: contactCreate.dataValues.assinged_to_work_a_application_id,
          company_name: a_company_name,
          a_company_id: a_company_id,
          send_message: result?.send_message,
        });
      }
    }

    if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactCreate.dataValues.mobile_number)) {
      const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactAssignedIdsStr);
      if (result) {
        contactWhatsappSendList.push({
          whatsapp_number: contactCreate.dataValues.mobile_number,
          contact_detail: {
            person_name: contactCreate.dataValues.person_name,
            mobile_number: contactCreate.dataValues.mobile_number,
            company_name: contactCreate.dataValues.company_name,
            customer_id: contactCreate.dataValues.id
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
        reference_id: contactCreate.dataValues.id,
        status_id: "-1",
        a_application_login_id: req.body.a_application_login_id
      }
    );
    /* Status Log Entry Added BY Dinesh -> 20-11-2025 */



    // Handle inquiry creation
    let contactInquiry = null;
    if (
      req.body.description ||
      req.body.category_id ||
      req.body.product_id ||
      req.body.qty ||
      req.body.static
    ) {
      if (!INqModel || typeof INqModel.create !== "function") {
        logger.error("Invalid inquiryModel:", INqModel);
        return resError({
          ack_msg: "Invalid database model",
          developer_msg: "inquiryModel is not properly initialized",
        });
      }

      const inquiryBody = {
        contact_master_id: contactCreate.dataValues.id,
        description: req.body.description || "",
        qty: req.body.qty || "",
        category_id: req.body.category_id || 0,
        product_id: req.body.product_id || 0,
        source_type_id: req.body.source_type_id || "",
        static: req.body.static || 0,
        a_application_login_id: req.body.a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        inquiry_date_time: formattedDate,
        column_number_1: req.body.column_number_1 || "",
        column_number_2: req.body.column_number_2 || "",
        column_number_3: req.body.column_number_3 || "",
        column_number_4: req.body.column_number_4 || "",
        column_number_5: req.body.column_number_5 || "",
        column_text_1: req.body.column_text_1 || "",
        column_text_2: req.body.column_text_2 || "",
        column_text_3: req.body.column_text_3 || "",
        column_text_4: req.body.column_text_4 || "",
        column_text_5: req.body.column_text_5 || "",
        column_text_area_1: req.body.column_text_area_1 || "",
        column_text_area_2: req.body.column_text_area_2 || "",
        column_text_area_3: req.body.column_text_area_3 || "",
        column_text_area_4: req.body.column_text_area_4 || "",
        column_text_area_5: req.body.column_text_area_5 || "",
        column_date_1: req.body.column_date_1 || "",
        column_date_2: req.body.column_date_2 || "",
        column_date_3: req.body.column_date_3 || "",
        column_date_4: req.body.column_date_4 || "",
        column_date_5: req.body.column_date_5 || "",
        column_date_and_time_1: req.body.column_date_and_time_1 || "",
        column_date_and_time_2: req.body.column_date_and_time_2 || "",
        column_date_and_time_3: req.body.column_date_and_time_3 || "",
        column_date_and_time_4: req.body.column_date_and_time_4 || "",
        column_date_and_time_5: req.body.column_date_and_time_5 || "",
        column_time_1: req.body.column_time_1 || "",
        column_time_2: req.body.column_time_2 || "",
        column_time_3: req.body.column_time_3 || "",
        column_time_4: req.body.column_time_4 || "",
        column_time_5: req.body.column_time_5 || "",
        column_switch_1: req.body.column_switch_1 || false,
        column_switch_2: req.body.column_switch_2 || false,
        column_switch_3: req.body.column_switch_3 || false,
        column_switch_4: req.body.column_switch_4 || false,
        column_switch_5: req.body.column_switch_5 || false,
        column_decimal_1: req.body.column_decimal_1 || "",
        column_decimal_2: req.body.column_decimal_2 || "",
        column_decimal_3: req.body.column_decimal_3 || "",
        column_decimal_4: req.body.column_decimal_4 || "",
        column_decimal_5: req.body.column_decimal_5 || "",
        column_dropdown_1: req.body.column_dropdown_1 || "",
        column_dropdown_2: req.body.column_dropdown_2 || "",
        column_dropdown_3: req.body.column_dropdown_3 || "",
        column_dropdown_4: req.body.column_dropdown_4 || "",
        column_dropdown_5: req.body.column_dropdown_5 || "",
        column_radio_1: req.body.column_radio_1 || "",
        column_radio_2: req.body.column_radio_2 || "",
        column_radio_3: req.body.column_radio_3 || "",
        column_radio_4: req.body.column_radio_4 || "",
        column_radio_5: req.body.column_radio_5 || "",
      };

      contactInquiry = await INqModel.create(inquiryBody);
      if (!contactInquiry || !contactInquiry.dataValues.id) {
        logger.error("Failed to create inquiry:", contactInquiry);
        return resError({
          ack_msg: "Failed to create inquiry",
          developer_msg: "Inquiry creation returned no data",
        });
      }

      // Create message history
      if (!CTMModel || typeof CTMModel.create !== "function") {
        logger.error("Invalid contactMessageHistory:", CTMModel);
        return resError({
          ack_msg: "Invalid database model",
          developer_msg: "contactMessageHistory is not properly initialized",
        });
      }

      const messageBody = {
        contact_masters_id: contactCreate.dataValues.id,
        a_application_login_id: req.body.a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        description:
          `Name: ${contactCreate.dataValues.person_name || ""}<br>` +
          `Email: ${contactCreate.dataValues.email_id || ""}<br>` +
          `<b>Mobile No.:</b> <b>${contactCreate.dataValues.mobile_number || ""
          }</b><br>` +
          `<b>Date:</b> <b>${contactInquiry.dataValues.inquiry_date_time
            ? formatDateForDisplay(
              contactInquiry.dataValues.inquiry_date_time
            )
            : ""
          }</b><br>` +
          `Message: ${contactInquiry.dataValues.description || ""}`,
        created_date_time: formattedDate,
        message_side: "2",
        message_type_id: "0",
      };

      const updateUnread = await CTMModel.update(
        {
          is_read_by_a_application_login_id: req.body.a_application_login_id,
        },
        {
          where: {
            id: contactCreate.dataValues.id,
          },
        }
      );

      const contactToMessage = await CTMModel.create(messageBody);

      // Google People API call
      try {
        if (!people || typeof people.people.createContact !== "function") {
          logger.error("Google People API not properly initialized:", people);
          throw new Error("Google People API client is not initialized");
        }

        const response = await people.people.createContact({
          requestBody: {
            names: [{ givenName: contactCreate.dataValues.person_name || "" }],
            emailAddresses: [
              { value: contactCreate.dataValues.email_id || "" },
            ],
            phoneNumbers: [
              { value: contactCreate.dataValues.mobile_number || "" },
            ],
          },
        });

      } catch (googleError) {
        logger.error("Google People API error:", googleError);
      }
    }
    let userData = await loginModel.findOne({
      where: { id: contactBody.a_application_login_id, isDelete: 0 },
      attributes: ["reporting_member", "username"], // Only fetch reporting_member and username
    });

    const reportingMemberId = userData?.reporting_member;

    const reportingMemberData = reportingMemberId
      ? await loginModel.findOne({
        where: { id: reportingMemberId, isDelete: 0 },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
        ],
      })
      : null;

    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        company_flag: 1,
      },
      attributes: ["a_application_login_id"],
    });

    // Filter out the creator's login ID from allLoginIds
    const allLoginIds = ownerTokenData
      .map((item) => item.a_application_login_id)
      .filter((loginId) => loginId !== contactBody.a_application_login_id);

    const ownerTokens = await loginModel.findAll({
      where: { id: allLoginIds, isDelete: 0 },
      attributes: [
        "android_refresh_token",
        "web_refresh_token",
        "ios_refresh_token",
      ],
    });

    // Collect tokens for reporting member and owners only (exclude user)
    const allTokens = [
      ...(reportingMemberData
        ? [
          reportingMemberData.web_refresh_token,
          reportingMemberData.android_refresh_token,
          reportingMemberData.ios_refresh_token,
        ]
        : []),
      ...ownerTokens.flatMap((tokenObj) => [
        tokenObj.dataValues.android_refresh_token,
        tokenObj.dataValues.web_refresh_token,
        tokenObj.dataValues.ios_refresh_token,
      ]),
    ].filter((token) => token && token.trim() !== "");

    const uniqueTokens = [...new Set(allTokens)];

    if (uniqueTokens.length > 0) {
      try {
        await sendMultipleNotification({
          deviceTokens: uniqueTokens,
          title: `${userData?.username || "Person"} added a new contact`,
        });

      } catch (notificationError) {
        logger.error(
          "Notification failed (non-critical):",
          notificationError.message
        );
      }
    } else {
      logger.info("No device tokens found for reporting member or owners.");
    }
    return resSuccess({
      ack_msg: "Contact is created successfully",
      data: contactCreate.dataValues,
    });
  } catch (error) {
    return resBadRequest({
      ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
      developer_msg: `error ${error.message || error}`,
    });
  }
};

export const addContactByQR = async (req, res) => {

  const qr_code = req.params.qrcode;

  const { contact_name, contact_email, your_requirement, company_name } = req.body;
  const mobile_number = normalizeToTenDigit(req.body.mobile_number);

  const inquiry_date_time = new Date();
  try {
    if (!qr_code) {
      return resError({
        ack_msg: "Invalid QR Code",
        developer_msg: "Invalid QR Code",
      });
    }
    // Find company details by QR code
    const companyData = await companyModel.findOne({
      where: { qr_code, isDelete: 0 },
      attributes: ["id", "a_application_login_id", "qr_code", "company_name", "is_contact_validation"],
    });
    if (!companyData) {
      return resError({
        ack_msg: "Company Not Found",
        developer_msg: "Company Not Found",
      });
    }
    const company_masters_id = companyData.dataValues.id;
    const a_application_login_id =
      companyData.dataValues.a_application_login_id;
    const tenantId = a_application_login_id;
    let a_company_name = companyData.dataValues.company_name;
    let a_company_id = companyData.dataValues.id;
    req.headers["x-tenant-id"] = tenantId;
    req.headers["x-company-id"] = company_masters_id;
    req.body.company_masters_id = company_masters_id;
    await new Promise((resolve, reject) => {
      tenantMiddleware(req, {}, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
    // Initialize tenant-scoped models
    const contactData = contactModel(req.tenantDB);

    // Check user rights limit
    const userList = await contactData.findAll({
      where: {
        company_masters_id: company_masters_id,
        isDelete: 0,
      },
      attributes: ["company_masters_id", "a_application_login_id"],
    });

    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    const userRights = await applicationLoginTypeRightModelIntance.findOne({
      where: {
        company_masters_id: company_masters_id,
        a_application_login_id: a_application_login_id,
        page_id: 1,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    });

    const userCount = userList.length;
    if (userRights && userRights.a_page_id_rights_jason) {
      try {
        const rightsJson = JSON.parse(
          userRights.a_page_id_rights_jason || "{}"
        );

        if (
          typeof rightsJson.limit === "number" &&
          rightsJson.limit > 0 &&
          userCount >= rightsJson.limit
        ) {
          return resError({
            ack_msg: `Your Contacts Limit Exceeded`,
            developer_msg: `Limit ${rightsJson.limit} reached for Company`,
          });
        }
      } catch (err) {
        logger.error(
          "Error parsing JSON for a_application_login_id:",
          a_application_login_id,
          err
        );
      }
    }

    const InquiryModel = inquiryModel(req.tenantDB);
    const contactMessageData = contactMessageHistory(req.tenantDB);
    if (!contactData?.findOne) {
      return resError({
        ack_msg: "Contact model not initialized",
        developer_msg: "contactModel is invalid",
      });
    }
    const existingUser = await contactData.findOne({
      where: { mobile_number, isDelete: 0 },
      attributes: ["id"],
    });
    let contactCreate;
    contactCreate = await contactData.findOne({
      where: { mobile_number, company_masters_id, isDelete: 0 },
      attributes: ["mobile_number", "person_name", "id"],
    });
    if (
      contactCreate &&
      !isDuplicateContact(companyData.dataValues.is_contact_validation, contactCreate.person_name, contact_name)
    ) {
      // Same mobile, different name, and this company allows it - treat as a
      // brand-new lead rather than attaching to the existing contact.
      contactCreate = null;
    }
    if (!contactCreate) {
      const whatsappEmailSendTeamPersonList = [];
      /* Contact Assignment */
      const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
        source_type_id: -12,
        description: your_requirement
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

      const assinged_to_work_a_application_id = contactAssignedIdsStr || a_application_login_id;
      /* Contact Assignment */
      contactCreate = await contactData.create({
        person_name: contact_name,
        company_name: company_name || "",
        mobile_number,
        email_id: contact_email,
        company_masters_id,
        a_application_login_id,
        description: your_requirement,
        source_type_id: -12,
        is_read_by_a_application_login_id: "",
        is_unread: 1,
        assinged_to_work_a_application_id: assinged_to_work_a_application_id
      });
      const contactEmailSendList = [];
      const contactWhatsappSendList = [];
      if (!contactCreate?.id) {
        if (isValid(whatsappEmailSendTeamPersonList) && isValid(contact_email)) {
          const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == assinged_to_work_a_application_id);
          if (result) {
            contactEmailSendList.push({
              email_id: contact_email,
              contact_detail: {
                person_name: contact_name,
                mobile_number: mobile_number,
                company_name: company_name
              },
              team_person: assinged_to_work_a_application_id,
              company_name: a_company_name,
              a_company_id: a_company_id,
              send_message: result?.send_message,
            });
          }
        }
        if (isValid(whatsappEmailSendTeamPersonList) && isValid(mobile_number)) {
          const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == assinged_to_work_a_application_id);
          if (result) {
            contactWhatsappSendList.push({
              whatsapp_number: mobile_number,
              contact_detail: {
                person_name: contact_name,
                mobile_number: mobile_number,
                company_name: company_name
              },
              team_person: assinged_to_work_a_application_id,
              company_name: a_company_name,
              a_company_id: a_company_id,
              send_message: result?.send_message,
              template_id: result?.template_id,
            });
          }
        }
        return resError({
          ack_msg: "Failed to create contact",
          developer_msg: "Contact creation failed",
        });
      }

      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "contact_masters",
          reference_id: contactCreate?.id,
          status_id: "-1",
          a_application_login_id: a_application_login_id
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

    }
    let contactInquiry = null;
    if (your_requirement && InquiryModel?.create) {
      contactInquiry = await InquiryModel.create({
        contact_master_id: contactCreate.id,
        description: your_requirement,
        inquiry_date_time,
        category_id: req.body.category_id || 0,
        product_id: req.body.product_id || 0,
        source_type_id: -12,
        a_application_login_id,
        company_masters_id,

        // Number fields
        column_number_1: req.body.column_number_1 || "",
        column_number_2: req.body.column_number_2 || "",
        column_number_3: req.body.column_number_3 || "",
        column_number_4: req.body.column_number_4 || "",
        column_number_5: req.body.column_number_5 || "",

        // Text fields
        column_text_1: req.body.column_text_1 || "",
        column_text_2: req.body.column_text_2 || "",
        column_text_3: req.body.column_text_3 || "",
        column_text_4: req.body.column_text_4 || "",
        column_text_5: req.body.column_text_5 || "",

        // Textarea fields
        column_text_area_1: req.body.column_text_area_1 || "",
        column_text_area_2: req.body.column_text_area_2 || "",
        column_text_area_3: req.body.column_text_area_3 || "",
        column_text_area_4: req.body.column_text_area_4 || "",
        column_text_area_5: req.body.column_text_area_5 || "",

        // Date fields
        column_date_1: req.body.column_date_1 || "",
        column_date_2: req.body.column_date_2 || "",
        column_date_3: req.body.column_date_3 || "",
        column_date_4: req.body.column_date_4 || "",
        column_date_5: req.body.column_date_5 || "",

        // Date & Time fields
        column_date_and_time_1: req.body.column_date_and_time_1 || "",
        column_date_and_time_2: req.body.column_date_and_time_2 || "",
        column_date_and_time_3: req.body.column_date_and_time_3 || "",
        column_date_and_time_4: req.body.column_date_and_time_4 || "",
        column_date_and_time_5: req.body.column_date_and_time_5 || "",

        // Time fields
        column_time_1: req.body.column_time_1 || "",
        column_time_2: req.body.column_time_2 || "",
        column_time_3: req.body.column_time_3 || "",
        column_time_4: req.body.column_time_4 || "",
        column_time_5: req.body.column_time_5 || "",

        // Switch fields
        column_switch_1: req.body.column_switch_1 || false,
        column_switch_2: req.body.column_switch_2 || false,
        column_switch_3: req.body.column_switch_3 || false,
        column_switch_4: req.body.column_switch_4 || false,
        column_switch_5: req.body.column_switch_5 || false,

        // Decimal fields
        column_decimal_1: req.body.column_decimal_1 || "",
        column_decimal_2: req.body.column_decimal_2 || "",
        column_decimal_3: req.body.column_decimal_3 || "",
        column_decimal_4: req.body.column_decimal_4 || "",
        column_decimal_5: req.body.column_decimal_5 || "",

        // Dropdown fields
        column_dropdown_1: req.body.column_dropdown_1 || "",
        column_dropdown_2: req.body.column_dropdown_2 || "",
        column_dropdown_3: req.body.column_dropdown_3 || "",
        column_dropdown_4: req.body.column_dropdown_4 || "",
        column_dropdown_5: req.body.column_dropdown_5 || "",

        // Radio fields
        column_radio_1: req.body.column_radio_1 || "",
        column_radio_2: req.body.column_radio_2 || "",
        column_radio_3: req.body.column_radio_3 || "",
        column_radio_4: req.body.column_radio_4 || "",
        column_radio_5: req.body.column_radio_5 || "",
      });
      if (!contactInquiry?.id) {
        return resError({
          ack_msg: "Failed to create inquiry",
          developer_msg: "Inquiry creation failed in QR flow",
        });
      }

      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "inquiries",
          reference_id: contactInquiry?.id,
          status_id: "-2",
          a_application_login_id: a_application_login_id
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */


      const dynamicFieldsHTML = customFormFiledDataAddToChatHistory(req);

      if (contactMessageData?.create) {
        await contactMessageData.create({
          contact_masters_id: contactCreate.id,
          description: `
    <span>
      Name: ${contact_name}<br />
      Email: ${contact_email}<br />
      <b>Mobile No.:</b> <b>${mobile_number}</b><br>
      <b>Date:</b> <b>${formatDateForDisplay(inquiry_date_time)}</b><br>
      <b>Message:</b> ${your_requirement}<br><br>

      <!-- Add all fields -->
      ${dynamicFieldsHTML}
    </span>
  `,
          company_masters_id,
          a_application_login_id,
          message_side: 2,
          message_type_id: 0,
        });
      }
    }
    try {
      if (people?.people?.createContact) {
        const response = await people.people.createContact({
          requestBody: {
            names: [{ givenName: contactCreate.person_name || "" }],
            emailAddresses: [{ value: contactCreate.email_id || "" }],
            phoneNumbers: [{ value: contactCreate.mobile_number || "" }],
          },
        });
      }
    } catch (googleError) {
      logger.error("Google People API error:", googleError.message);
    }
    const contactLoginId = a_application_login_id;

    const userData = await loginModel.findOne({
      where: { id: contactLoginId, isDelete: 0 },
      attributes: ["reporting_member", "username"],
    });

    const reportingMemberData = userData?.reporting_member
      ? await loginModel.findOne({
        where: { id: userData.reporting_member, isDelete: 0 },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
        ],
      })
      : null;

    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
      where: { isDelete: 0, company_masters_id, company_flag: 1 },
      attributes: ["a_application_login_id"],
    });

    const allLoginIds = ownerTokenData.map(
      (item) => item.a_application_login_id
    );
    const ownerTokens = await loginModel.findAll({
      where: { id: allLoginIds, isDelete: 0 },
      attributes: [
        "android_refresh_token",
        "web_refresh_token",
        "ios_refresh_token",
      ],
    });

    const allTokens = [
      ...(reportingMemberData
        ? [
          reportingMemberData.web_refresh_token,
          reportingMemberData.android_refresh_token,
          reportingMemberData.ios_refresh_token,
        ]
        : []),
      ...ownerTokens.flatMap((tokenObj) => [
        tokenObj.android_refresh_token,
        tokenObj.web_refresh_token,
        tokenObj.ios_refresh_token,
      ]),
    ].filter((token) => token && token.trim() !== "");

    const uniqueTokens = [...new Set(allTokens)];

    if (uniqueTokens.length > 0) {
      await sendMultipleNotification({
        deviceTokens: uniqueTokens,
        title: `${userData?.username || "Person"} added a new contact`,
      });
    }

    return resSuccess({
      ack_msg: "Inquiry Submitted Successfully",
      developer_msg: "Inquiry Submitted Successfully",
    });
  } catch (error) {
    logger.error("Unhandled error in addContactByQR:", error);
    return resError({
      ack_msg: "Something went wrong",
      developer_msg: error.message,
    });
  }
};

export const addContactByOnlineStore = async (req, res) => {
  const qr_code = req.params.qrcode;
  const { contact_name, mobile_number: rawMobile, haveOTP, otp_token, otp } = req.body;
  const mobile_number = normalizeToTenDigit(rawMobile);

  const validations = [
    { condition: !qr_code, msg: "Invalid URL" },
    { condition: !contact_name, msg: "Name is required" },
    { condition: !mobile_number, msg: "Mobile Number is required" },
  ];
  for (const v of validations) {
    if (v.condition) return resError({ ack_msg: v.msg, developer_msg: v.msg });
  }

  try {
    const companyData = await companyModel.findOne({
      where: { qr_code, isDelete: 0 },
      attributes: ["id", "a_application_login_id", "qr_code"],
    });

    if (!companyData) {
      return resError({
        ack_msg: "Company Not Found",
        developer_msg: "Company Not Found",
      });
    }

    const company_masters_id = companyData.dataValues.id;
    const a_application_login_id = companyData.dataValues.a_application_login_id;
    const tenantId = a_application_login_id;

    req.headers["x-tenant-id"] = tenantId;
    req.headers["x-company-id"] = company_masters_id;
    req.body.company_masters_id = company_masters_id;

    await new Promise((resolve, reject) => {
      tenantMiddleware(req, {}, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const contactData = contactModel(req.tenantDB);
    if (!contactData?.findOne) {
      return resError({
        ack_msg: "Contact model not initialized",
        developer_msg: "contactModel is invalid",
      });
    }

    const userList = await contactData.findAll({
      where: { company_masters_id, isDelete: 0 },
      attributes: ["company_masters_id", "a_application_login_id"],
    });

    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    const userRights = await applicationLoginTypeRightModelIntance.findOne({
      where: {
        company_masters_id,
        a_application_login_id,
        page_id: 1,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    });

    const userCount = userList.length;

    if (userRights && userRights.a_page_id_rights_jason) {
      try {
        const rightsJson = JSON.parse(userRights.a_page_id_rights_jason || "{}");
        if (
          typeof rightsJson.limit === "number" &&
          rightsJson.limit > 0 &&
          userCount >= rightsJson.limit
        ) {
          return resError({
            ack_msg: `Your Contacts Limit Exceeded`,
            developer_msg: `Limit ${rightsJson.limit} reached for Company`,
          });
        }
      } catch (err) {
        logger.error("Error parsing JSON:", a_application_login_id, err);
      }
    }

    // ------------------------------
    // CHECK IF CONTACT EXISTS
    // ------------------------------
    let exists = await contactData.findOne({
      where: { mobile_number, company_masters_id, isDelete: 0 }
    });

    // ---------------------------------------------------------------------
    // 🔸 MODIFIED for existing contacts — treat EXACTLY like new contacts
    //     haveOTP = false → send OTP
    //     haveOTP = true → validate OTP and return existing contact
    // ---------------------------------------------------------------------

    if (exists && !haveOTP) {
      // EXISTING CONTACT → SEND OTP
      const otp = generateOTP(6);

      const payload = {
        mobile_number,
        company_masters_id,
        a_application_login_id,
        contact_name: exists.person_name,
        otp,
        existing: true   // extra flag
      };

      const token = jwt.sign(payload, JWT_TOKEN_SIGNATURE, { expiresIn: 600 });

      try {
        await ClaudeOfficeWhatsAppOtp(otp, mobile_number);
      } catch (whatsappError) {
        return resError({
          ack_msg: "Failed to send WhatsApp OTP",
          developer_msg: `WhatsApp OTP sending failed: ${whatsappError.message}`,
        });
      }

      return resSuccess({
        ack_msg: "OTP sent successfully",
        developer_msg: "OTP sent for existing contact",
        data: { otp_token: token }
      });
    }

    if (exists && haveOTP) {
      // EXISTING CONTACT → VALIDATE OTP
      if (!otp_token)
        return resError({ ack_msg: "OTP token missing", developer_msg: "otp_token is required" });

      if (!otp)
        return resError({ ack_msg: "OTP missing", developer_msg: "otp is required" });

      let decoded;
      try {
        decoded = jwt.verify(otp_token, JWT_TOKEN_SIGNATURE);
      } catch (err) {
        return resError({
          ack_msg: "Invalid or expired OTP token",
          developer_msg: "OTP token invalid or expired",
        });
      }

      if (
        !decoded ||
        decoded.mobile_number !== mobile_number ||
        decoded.company_masters_id !== company_masters_id
      ) {
        return resError({
          ack_msg: "OTP token does not match request data",
          developer_msg: "OTP token payload mismatch",
        });
      }

      if (String(decoded.otp) !== String(otp)) {
        return resError({
          ack_msg: "Invalid OTP",
          developer_msg: "OTP does not match",
        });
      }

      // SUCCESS — EXISTING CONTACT VERIFIED
      return resSuccess({
        ack_msg: "Contact already existed and OTP verified",
        developer_msg: "Existing contact OTP verified",
        data: exists
      });
    }

    // ---------------------------------------------------------------------
    // NEW CONTACT (YOUR ORIGINAL FLOW)
    // ---------------------------------------------------------------------
    if (!exists && haveOTP) {
      if (!otp_token)
        return resError({
          ack_msg: "OTP token missing",
          developer_msg: "otp_token is required",
        });

      if (!otp)
        return resError({
          ack_msg: "OTP missing",
          developer_msg: "otp is required",
        });

      let decoded;
      try {
        decoded = jwt.verify(otp_token, JWT_TOKEN_SIGNATURE);
      } catch (err) {
        logger.error("OTP JWT verify error:", err);
        return resError({
          ack_msg: "Invalid or expired OTP token",
          developer_msg: "OTP token invalid or expired",
        });
      }

      if (
        !decoded ||
        decoded.mobile_number !== mobile_number ||
        decoded.company_masters_id !== company_masters_id
      ) {
        return resError({
          ack_msg: "OTP token does not match request data",
          developer_msg: "OTP token payload mismatch",
        });
      }

      if (String(decoded.otp) !== String(otp)) {
        return resError({
          ack_msg: "Invalid OTP",
          developer_msg: "OTP does not match",
        });
      }

      exists = await contactData.create({
        person_name: contact_name,
        mobile_number,
        company_masters_id,
        a_application_login_id,
        source_type_id: -18
      });

      if (!exists?.id) {
        return resError({
          ack_msg: "Failed to create contact",
          developer_msg: "Contact creation failed",
        });
      }
    }

    if (!exists && !haveOTP) {
      const otp = generateOTP(6);
      const payload = {
        mobile_number,
        company_masters_id,
        a_application_login_id,
        contact_name,
        otp,
      };

      const token = jwt.sign(payload, JWT_TOKEN_SIGNATURE, { expiresIn: 600 });

      try {
        await ClaudeOfficeWhatsAppOtp(otp, mobile_number);
      } catch (whatsappError) {
        return resError({
          ack_msg: "Failed to send WhatsApp OTP",
          developer_msg: `WhatsApp OTP sending failed: ${whatsappError.message}`,
        });
      }

      return resSuccess({
        ack_msg: "OTP sent successfully",
        developer_msg: "OTP sent successfully",
        data: { otp_token: token },
      });
    }

    // ------------------------------
    // Google People API
    // ------------------------------
    try {
      if (people?.people?.createContact) {
        await people.people.createContact({
          requestBody: {
            names: [{ givenName: exists.person_name || "" }],
            emailAddresses: [{ value: exists.email_id || "" }],
            phoneNumbers: [{ value: exists.mobile_number || "" }],
          },
        });
      }
    } catch (googleError) {
      logger.error("Google People API error:", googleError.message);
    }

    const contactLoginId = a_application_login_id;

    const userData = await loginModel.findOne({
      where: { id: contactLoginId, isDelete: 0 },
      attributes: ["reporting_member", "username"],
    });

    const reportingMemberData = userData?.reporting_member
      ? await loginModel.findOne({
        where: { id: userData.reporting_member, isDelete: 0 },
        attributes: ["web_refresh_token", "android_refresh_token", "ios_refresh_token"],
      })
      : null;

    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
      where: { isDelete: 0, company_masters_id, company_flag: 1 },
      attributes: ["a_application_login_id"],
    });

    const allLoginIds = ownerTokenData.map(item => item.a_application_login_id);

    const ownerTokens = await loginModel.findAll({
      where: { id: allLoginIds, isDelete: 0 },
      attributes: ["android_refresh_token", "web_refresh_token", "ios_refresh_token"],
    });

    const allTokens = [
      ...(reportingMemberData
        ? [
          reportingMemberData.web_refresh_token,
          reportingMemberData.android_refresh_token,
          reportingMemberData.ios_refresh_token,
        ]
        : []),
      ...ownerTokens.flatMap((tokenObj) => [
        tokenObj.android_refresh_token,
        tokenObj.web_refresh_token,
        tokenObj.ios_refresh_token,
      ]),
    ].filter((token) => token && token.trim() !== "");

    const uniqueTokens = [...new Set(allTokens)];

    if (uniqueTokens.length > 0 && haveOTP) {
      await sendMultipleNotification({
        deviceTokens: uniqueTokens,
        title: `${userData?.username || "Person"} added a new contact`,
      });
    }

    const resMessage = exists?.createdAt ?
      "Contact created and verified successfully" :
      "Contact verified successfully";

    return resSuccess({
      ack_msg: resMessage,
      developer_msg: resMessage,
      data: exists
    });

  } catch (error) {
    logger.error("Unhandled error in addContactByOnlineStore:", error);
    return resError({
      ack_msg: "Something went wrong",
      developer_msg: error.message,
    });
  }
};


export const contactUpdate = async (req) => {
  try {
    const contactId = req.params.id;
    if (!contactId) {
      return resError({
        message: RequireMessage("Blog Id"),
      });
    }

    let contactBody = {
      title: req.body.title,
      image_path: req.body.image_path,
      description: req.body.description,
    };

    const updateBlog = await contact.update(contactBody, {
      where: { id: contactId },
    });
    return updateBlog;
  } catch (error) {
    logger.error(error);
  }
};

async function filterDeletableContacts(ids, cartModels, inquiryModels) {
  const [carts, inquiries] = await Promise.all([
    cartModels.findAll({
      where: {
        to_customer_id: { [Op.in]: ids },
        isDelete: 0,
        type: { [Op.in]: [2, 3, 4] },
      },
      attributes: ["to_customer_id"],
    }),
    inquiryModels.findAll({
      where: {
        contact_master_id: { [Op.in]: ids },
        isDelete: 0,
      },
      attributes: ["contact_master_id"],
    }),
  ]);

  const related = new Set([
    ...carts.map((c) => c.to_customer_id),
    ...inquiries.map((i) => i.contact_master_id),
  ]);

  return ids.filter((id) => !related.has(id));
}

export const contactDeleted = async (req) => {
  try {
    const contactInput = req.body.contactId; // Can be a number or array
    const contactIds = Array.isArray(contactInput)
      ? contactInput
      : [contactInput];

    const cartModels = cartModel(req.tenantDB);
    const inquiryModels = inquiryModel(req.tenantDB);
    const contactModels = contactModel(req.tenantDB);

    const carts = await cartModels.findAll({
      where: {
        to_customer_id: {
          [Sequelize.Op.in]: contactIds,
        },
        isDelete: 0,
        type: {
          [Sequelize.Op.in]: [2, 3, 4, 5],
        },
      },
      attributes: ["id", "cart_number", "to_customer_id"],
    });

    const inquirys = await inquiryModels.findAll({
      where: {
        contact_master_id: {
          [Sequelize.Op.in]: contactIds,
        },
        isDelete: 0,
      },
      attributes: ["id", "contact_master_id"],
    });

    const nonDeletableIds = [
      ...new Set([
        ...carts.map((cart) => cart.to_customer_id),
        ...inquirys.map((inquiry) => inquiry.contact_master_id),
      ]),
    ];

    const deletableIds = Array.isArray(contactInput)
      ? contactIds.filter((id) => !nonDeletableIds.includes(id))
      : contactIds;

    if (deletableIds.length === 0) {
      return resError({
        ack_msg: Array.isArray(contactInput)
          ? "No contacts deleted. All selected contacts have carts or inquiries. Please Delete it first."
          : "Contact not deleted. The selected contact has carts or inquiries. Please Delete it first..",
        developer_msg: "Deletion aborted: no valid contacts found.",
      });
    }

    // Soft delete all valid contacts
    await contactModels.update(
      { isDelete: 1 },
      {
        where: {
          id: { [Sequelize.Op.in]: deletableIds },
          isDelete: 0,
        },
      }
    );

    const deletedContacts = await contactModels.findAll({
      where: {
        id: { [Sequelize.Op.in]: deletableIds },
        isDelete: 1,
      },
      attributes: ["id", "assinged_to_work_a_application_id", "person_name"],
    });

    for (const contact of deletedContacts) {
      const assignedIds =
        contact.assinged_to_work_a_application_id
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) || [];

      for (const id of assignedIds) {
        try {
          const assignedContact = await loginModel.findOne({
            where: { id, isDelete: 0 },
            attributes: [
              "web_refresh_token",
              "android_refresh_token",
              "ios_refresh_token",
            ],
          });

          if (assignedContact) {
            const tokens = [
              assignedContact.web_refresh_token,
              assignedContact.android_refresh_token,
              assignedContact.ios_refresh_token,
            ].filter(Boolean);

            if (tokens.length > 0) {
              await sendMultipleNotification({
                deviceTokens: tokens,
                title: `${contact.person_name} is Deleted`,
                body: ``,
              });
            }
          }
        } catch (err) {
          logger.error(`Notification error for ID ${id}:`, err.message);
        }
      }
    }

    return resSuccess({
      ack_msg:
        Array.isArray(contactInput) && contactIds.length > deletableIds.length
          ? `${deletableIds.length} of ${contactIds.length} contact(s) deleted successfully. Others have carts or inquiries so please delete those first`
          : Array.isArray(contactInput)
            ? `${deletableIds.length} contact(s) deleted successfully.`
            : "Contact deleted successfully.",
      developer_msg: "Batch contact deletion completed.",
    });
  } catch (error) {
    logger.error("Deletion error:", error);
    return resError({
      ack_msg: "Unexpected error occurred during deletion.",
      developer_msg: error.message,
    });
  }
};

export const contactRecover = async (req) => {
  try {
    const contactInput = req.body.contactIds; // Can be a single ID or array of IDs

    if (!contactInput) {
      return resError({
        ack_msg: "Contact ID is required",
        developer_msg: "Missing contactId in request body",
      });
    }

    const contactIds = Array.isArray(contactInput)
      ? contactInput
      : [contactInput];

    const contactModels = contactModel(req.tenantDB);

    // Find contacts that are currently deleted (isDelete = 1)
    const existingDeletedContacts = await contactModels.findAll({
      where: {
        id: { [Sequelize.Op.in]: contactIds },
        isDelete: 1,           // Only recover actually deleted ones
      },
      attributes: ["id", "person_name"],
    });

    const recoverableIds = existingDeletedContacts.map(contact => contact.id);

    if (recoverableIds.length === 0) {
      return resError({
        ack_msg: Array.isArray(contactInput)
          ? "No contacts recovered. Either contacts don't exist or they are not deleted."
          : "Contact not recovered. It may not exist or is not in deleted state.",
        developer_msg: "No recoverable contacts found.",
      });
    }

    // Recover (Undelete) the contacts - Set isDelete back to 0
    await contactModels.update(
      { isDelete: 0 },
      {
        where: {
          id: { [Sequelize.Op.in]: recoverableIds },
          isDelete: 1,
        },
      }
    );

    // Optional: Send notification to assigned users that contact is recovered
    const recoveredContacts = await contactModels.findAll({
      where: {
        id: { [Sequelize.Op.in]: recoverableIds },
        isDelete: 0,
      },
      attributes: ["id", "assinged_to_work_a_application_id", "person_name"],
    });

    for (const contact of recoveredContacts) {
      const assignedIds =
        contact.assinged_to_work_a_application_id
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) || [];

      for (const id of assignedIds) {
        try {
          const assignedContact = await loginModel.findOne({
            where: { id, isDelete: 0 },
            attributes: [
              "web_refresh_token",
              "android_refresh_token",
              "ios_refresh_token",
            ],
          });

          if (assignedContact) {
            const tokens = [
              assignedContact.web_refresh_token,
              assignedContact.android_refresh_token,
              assignedContact.ios_refresh_token,
            ].filter(Boolean);

            if (tokens.length > 0) {
              await sendMultipleNotification({
                deviceTokens: tokens,
                title: `${contact.person_name} is Recovered`,
                body: `The contact has been restored successfully.`,
              });
            }
          }
        } catch (err) {
          logger.error(`Notification error for recovered contact ID ${id}:`, err.message);
        }
      }
    }

    return resSuccess({
      ack_msg: Array.isArray(contactInput) && contactIds.length > recoverableIds.length
        ? `${recoverableIds.length} of ${contactIds.length} contact(s) recovered successfully. Others were not in deleted state.`
        : Array.isArray(contactInput)
          ? `${recoverableIds.length} contact(s) recovered successfully.`
          : "Contact recovered successfully.",
      developer_msg: "Batch contact recovery completed.",
    });

  } catch (error) {
    logger.error("Recovery error:", error);
    return resError({
      ack_msg: "Unexpected error occurred during recovery.",
      developer_msg: error.message,
    });
  }
};

export const singleContactGet = async (req, res) => {
  try {
    let { contact_master_id, a_application_login_id, request_flag } = req.body;

    //Validation
    if (!contact_master_id) {
      return resError({
        ack_msg: "Contact Id is Required",
        developer_msg: "Contact Id is Required",
      });
    }

    const ContactModels = contactModel(req.tenantDB);
    const customFormFiled = customFieldFormModel(req.tenantDB);

    //Get company details
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (!findCompanyId) {
      return resError({
        ack_msg: "Invalid login",
        developer_msg: "Company not found",
      });
    }

    const company_flag = findCompanyId.company_flag;
    const company_id = findCompanyId.company_masters_id;

    let where = {};

    //Sanitize login id (prevent SQL injection)
    const loginId = Number(a_application_login_id) || 0;

    //Rights-based filtering (only if request_flag not provided)
    if (!request_flag) {
      const applicationLoginTypeRightModelIntance =
        applicationLoginTypeRightModel(req.tenantDB);

      const userRightsList =
        await applicationLoginTypeRightModelIntance.findOne({
          where: {
            company_masters_id: company_id,
            a_application_login_id,
            isDelete: 0,
            page_id: PAGE_ID.CONTACT,
          },
          attributes: ["a_page_id_rights_jason"],
        });

      if (userRightsList?.a_page_id_rights_jason) {
        try {
          const rights = JSON.parse(
            userRightsList.a_page_id_rights_jason
          );

          if (rights.all_data == 1) {
            where = {
              company_masters_id: company_id,
              id: contact_master_id,
            };
          } else if (rights.personal == 1) {
            where = {
              id: contact_master_id,
              [Sequelize.Op.or]: [
                Sequelize.literal(
                  `FIND_IN_SET(${loginId}, assinged_to_work_a_application_id)`
                ),
                { a_application_login_id: loginId },
              ],
            };
          }
        } catch (err) {
          console.error("Rights JSON error:", err);
        }
      }
    }

    //Override ONLY when needed
    if (company_flag === 1 || request_flag === 1) {
      where = {
        company_masters_id: company_id,
        id: contact_master_id,
      };
    }

    //Fallback if where is still empty
    if (!where.id) {
      where = {
        id: contact_master_id,
        [Sequelize.Op.or]: [
          Sequelize.literal(
            `FIND_IN_SET(${loginId}, assinged_to_work_a_application_id)`
          ),
          { a_application_login_id: loginId },
        ],
      };
    }

    //Main Query
    const contactData = await ContactModels.findOne({
      where,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT country_name FROM a_countries WHERE id = contact_masters.country AND isDelete=0)"
            ),
            "country_name",
          ],
          [
            Sequelize.literal(
              "(SELECT state_name FROM a_states WHERE id = contact_masters.state)"
            ),
            "state_name",
          ],
          [
            Sequelize.literal(
              "(SELECT city_name FROM a_cities WHERE id = contact_masters.city)"
            ),
            "city_name",
          ],
          [
            Sequelize.literal(
              "(SELECT area_name FROM a_areas WHERE id = contact_masters.area)"
            ),
            "area_name",
          ],
          [
            Sequelize.literal(
              `(SELECT COALESCE(SUM(amount),0) FROM account_transactions 
                WHERE contact_masters_id = contact_masters.id 
                AND isDelete=0 AND type=1)`
            ),
            "credit_amount",
          ],
          [
            Sequelize.literal(
              `(SELECT COALESCE(SUM(amount),0) FROM account_transactions 
                WHERE contact_masters_id = contact_masters.id 
                AND isDelete=0 AND type=2)`
            ),
            "debit_amount",
          ],
          [
            Sequelize.literal(
              `(SELECT source_name FROM source_types 
                WHERE id = contact_masters.source_type_id AND isDelete=0)`
            ),
            "source_name",
          ],
          [
            Sequelize.literal(
              `(SELECT color FROM source_types 
                WHERE id = contact_masters.source_type_id AND isDelete=0)`
            ),
            "source_name_color",
          ],
          [
            Sequelize.literal(
              `(SELECT name FROM stage_status_masters 
                WHERE id = contact_masters.contact_status AND isDelete=0)`
            ),
            "stage_status_name",
          ],
          [
            Sequelize.literal(
              `(SELECT color FROM stage_status_masters 
                WHERE id = contact_masters.contact_status AND isDelete=0)`
            ),
            "stage_status_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(color) FROM lable_masters 
                WHERE isDelete=0 
                AND FIND_IN_SET(id, contact_masters.lable))`
            ),
            "label_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_name) FROM lable_masters 
                WHERE isDelete=0 
                AND FIND_IN_SET(id, contact_masters.lable))`
            ),
            "label_name",
          ],
          [Sequelize.col("contact_masters.sync_whatsapp"), "sync_whatsapp"],
        ],
      },
    });
    console.log("contactDatacontactDatacontactData", contactData);

    //No data found
    if (!contactData) {
      return resError({
        ack_msg: "Please assign this contact first.",
        developer_msg:
          "No contact found or user is not assigned.",
      });
    }

    // Sanitize & format
    const sanitized = sanitizeObjectOfNull(contactData.toJSON());

    const credit = parseFloat(sanitized.credit_amount || 0);
    const debit = parseFloat(sanitized.debit_amount || 0);

    const sanitizedContact = {
      ...sanitized,
      mobile_number: sanitized.mobile_number && !String(sanitized.mobile_number).startsWith('+')
        ? `+${sanitized.mobile_number}`
        : sanitized.mobile_number,
      created_date_time: sanitized.created_date_time
        ? formatDateAndTimeCreateDateTime(
          sanitized.created_date_time
        )
        : "",
      closing_balance: (credit - debit).toFixed(2),
    };

    // ✅ Assigned team members
    if (sanitized.assinged_to_work_a_application_id) {
      const assignedIds = sanitized.assinged_to_work_a_application_id
        .split(",")
        .map((id) => Number(id.trim()))
        .filter((id) => id);

      if (assignedIds.length > 0) {
        try {
          const teamMembersMulti = await loginModel.findAll({
            where: {
              id: { [Sequelize.Op.in]: assignedIds },
              isDelete: 0,
            },
            attributes: ["username"],
          });

          sanitizedContact.assign_team_members_name =
            teamMembersMulti.map((m) => m.username).join(", ");
        } catch (error) {
          console.error("Team fetch error:", error);
          sanitizedContact.assign_team_members_name = "";
        }
      }
    }

    // ✅ Success response
    return resSuccess({
      data: sanitizedContact,
    });

  } catch (error) {
    console.error("singleContactGet error:", error);

    return resBadRequest({
      ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
      developer_msg: error.message || error,
    });
  }
};

export const contactPinUpin = async (req) => {
  const { request_flag, contact_master_id, a_application_login_id } = req.body;

  // request_flag 1 =====> Pin Contact;
  // request_flag 2 =====> UnPin Contact;

  if (!contact_master_id) {
    return resError({
      ack_msg: "Contact Id is Required",
      developer_msg: "Contact Id is Required",
    });
  }

  const ContactModels = contactModel(req.tenantDB);

  if (request_flag === 1) {
    try {
      // Pin Contact: Add application ID to the comma-separated string
      const contact = await ContactModels.findOne({
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (!contact) {
        return resError({
          ack_msg: "Contact not found",
          developer_msg: "Contact not found or has been deleted",
        });
      }

      let pinnedIds = [];
      // remove 0 when contact pinned
      if (contact.is_pin_by_a_application_login_id) {
        pinnedIds = contact.is_pin_by_a_application_login_id
          .split(",")
          .filter((id) => id && id !== "0"); // Remove 0 from pinned IDs
      }

      // Add ID if not already present
      if (!pinnedIds.includes(a_application_login_id)) {
        pinnedIds.push(a_application_login_id);
      } else {
        return {
          success: true,
          ack_msg: "Contact already pinned by this application",
          data: pinnedIds,
        };
      }

      const updateData = {
        is_pin_by_a_application_login_id:
          pinnedIds.length > 0 ? pinnedIds.join(",") : "0",
        is_pin: pinnedIds.length > 0 ? 1 : 0,
      };

      const [affectedRows] = await ContactModels.update(updateData, {
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (affectedRows === 0) {
        return resError({
          ack_msg: "Failed to pin contact",
          developer_msg: "No rows were updated in the database",
        });
      }

      return resSuccess({
        ack: 1,
        ack_msg: "Contact pinned successfully",
        data: { pinnedIds },
      });
    } catch (error) {
      return resError({
        ack: 0,
        ack_msg: "Something went wrong while pinning contact",
        developer_msg: error.message,
      });
    }
  } else {
    try {
      // Unpin Contact: Remove application ID from the comma-separated string
      const contact = await ContactModels.findOne({
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (!contact) {
        return resError({
          ack_msg: "Contact not found",
          developer_msg: "Contact not found or has been deleted",
        });
      }

      let pinnedIds = [];
      if (contact.is_pin_by_a_application_login_id) {
        pinnedIds = contact.is_pin_by_a_application_login_id
          .split(",")
          .filter((id) => id && id !== "0"); // Remove 0 from pinned IDs
      }

      // Remove ID if present
      if (pinnedIds.includes(a_application_login_id)) {
        pinnedIds = pinnedIds.filter((id) => id !== a_application_login_id);
      } else {
        logger.info(`Application ID ${a_application_login_id} not pinned`);
      }

      const updateData = {
        is_pin_by_a_application_login_id:
          pinnedIds.length > 0 ? pinnedIds.join(",") : "0",
        is_pin: pinnedIds.length > 0 ? 1 : 0,
      };

      const [affectedRows] = await ContactModels.update(updateData, {
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (affectedRows === 0) {
        return resError({
          ack_msg: "Failed to unpin contact",
          developer_msg: "No rows were updated in the database",
        });
      }

      return resSuccess({
        ack: 1,
        ack_msg: "Contact unpinned successfully",
        data: { pinnedIds },
      });
    } catch (error) {
      logger.error("Error in unpinning contact:", error);
      return resError({
        ack: 0,
        ack_msg: "Something went wrong while unpinning contact",
        developer_msg: error.message,
      });
    }
  }
};

export const contactread = async (req) => {
  const { request_flag, contact_master_id, a_application_login_id } = req.body;
  const contactIds = Array.isArray(contact_master_id) ? contact_master_id : [contact_master_id];

  // request_flag 1 =====> Mark as Read
  // request_flag 0 =====> Mark as Unread

  if (!contact_master_id || !a_application_login_id) {
    return resError({
      ack_msg: "Contact Id and Application Login Id are Required",
      developer_msg: "Contact Id and Application Login Id are Required",
    });
  }

  const ContactModels = contactModel(req.tenantDB);

  try {
    const contact = await ContactModels.findAll({
      where: {
        id: { [Sequelize.Op.in]: contactIds },
        isDelete: 0,
      },
      raw: true,
      attributes: ["is_read_by_a_application_login_id", "id"]
    });

    if (!isValid(contact)) {
      return resError({
        ack_msg: "Contact not found",
        developer_msg: "Contact not found or has been deleted",
      });
    }

    for (const contactt of contact) {
      let readIds = [];

      readIds = contactt.is_read_by_a_application_login_id ? contactt.is_read_by_a_application_login_id.split(",").filter((id) => id && id !== "0") : [];
      if (request_flag === 1) {
        // Mark as Read
        if (!readIds.includes(String(a_application_login_id))) {
          readIds.push(String(a_application_login_id));
        }
      } else if (request_flag === 0) {
        // Mark as Unread
        if (readIds.includes(String(a_application_login_id))) {
          readIds = readIds.filter((id) => id !== String(a_application_login_id));
        }
      }

      const updateData = {
        is_read_by_a_application_login_id: readIds.length > 0 ? readIds.join(",") : null,
        is_unread: readIds.length > 0 ? 0 : 1,
      };

      await ContactModels.update(updateData, {
        where: {
          id: contactt.id,
          isDelete: 0,
        },
      });

    }

    return resSuccess({
      ack: 1,
      code: 200,
      ack_msg: `Contact marked as ${request_flag === 1 ? "read" : "unread"
        } successfully`,
      developer_msg: "Operation completed successfully",
      // data: { readIds },
    });
  } catch (error) {
    logger.error(
      `Error in marking contact as ${request_flag === 1 ? "read" : "unread"}:`,
      error
    );
    return resError({
      ack: 0,
      ack_msg: `Something went wrong while marking contact as ${request_flag === 1 ? "read" : "unread"
        }`,
      developer_msg: error.message,
    });
  }
};

export const contactarchive = async (req) => {
  const { request_flag, contact_master_id } = req.body;

  if (!contact_master_id) {
    return resError({
      ack_msg: "Contact Id is Required",
      developer_msg: "Contact Id is Required",
    });
  }

  const contactIds = Array.isArray(contact_master_id)
    ? contact_master_id
    : [contact_master_id];

  const ContactModels = contactModel(req.tenantDB);

  try {
    const contact = await ContactModels.findAll({
      where: {
        id: { [Sequelize.Op.in]: contactIds },
        isDelete: 0,
      },
    });

    if (!contact) {
      return resError({
        ack_msg: "No Contact found",
        developer_msg: "No Contact found or has/have been deleted",
      });
    }

    // Set is_archive based on request_flag: 0 = unarchive, 1 = archive
    const updateData = {
      is_archive: request_flag === 1 ? 1 : 0,
    };

    const [affectedRows] = await ContactModels.update(updateData, {
      where: {
        id: { [Sequelize.Op.in]: contactIds },
        isDelete: 0,
      },
    });

    if (affectedRows === 0) {
      return resError({
        ack_msg: "Failed to update contact",
        developer_msg: "No rows were updated in the database",
      });
    }

    return resSuccess({
      ack: 1,
      code: 200,
      ack_msg: `Contact marked as ${request_flag === 1 ? "archived" : "unarchived"
        } successfully`,
      developer_msg: "Operation completed successfully",
    });
  } catch (error) {
    logger.error("Error in updating contact:", error);
    return resError({
      ack: 0,
      ack_msg: "Something went wrong while updating contact",
      developer_msg: error.message,
    });
  }
};

export const getExportsContacts = async (req) => {
  try {
    let { labelId, sourceId, stageStatusId } = req.body;
    let {
      a_application_login_id,
      isPinByApplicationId,
    } = req.body;

    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    const fileName = randomUUID();
    const format = 'xlsx'
    const cols = null;
    const headersObj = null;
    const outputDir = `media-folder/exports/contacts/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    /* Populating Data */
    const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: req.body })

    // Calculate total unread contacts across the entire table
    const User = contactModel(req.tenantDB);
    const lableModelIntance = labelModel(req.tenantDB);
    const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);


    /* Sorting and ordering */
    const order = [];

    if (relevanceOrder && relevanceOrder.length > 0) {
      order.push(...relevanceOrder);
    }

    order.push([
      Sequelize.literal(
        `FIND_IN_SET(${isPinByApplicationId || 0}, is_pin_by_a_application_login_id)`
      ),
      'DESC'
    ]);

    order.push(['modified_date', 'DESC']);
    /* Sorting and ordering */

    const queryOptions = {
      where: whereClause,
      order,
      attributes: {
        include: [
          [
            Sequelize.literal(
              "(SELECT a_countries.country_name FROM a_countries WHERE a_countries.id = contact_masters.country AND a_countries.isDelete=0)"
            ),
            "country_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_states.state_name FROM a_states WHERE a_states.id = contact_masters.state)"
            ),
            "state_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_cities.city_name FROM a_cities WHERE a_cities.id = contact_masters.city)"
            ),
            "city_name",
          ],
          [
            Sequelize.literal(
              "(SELECT a_areas.area_name FROM a_areas WHERE a_areas.id = contact_masters.area)"
            ),
            "area_name",
          ],
          [
            Sequelize.literal(
              `(SELECT source_types.source_name FROM source_types WHERE source_types.id = ${sourceId || "0"
              } AND source_types.isDelete = 0)`
            ),
            "selected_source_name",
          ],
          [
            Sequelize.literal(
              `(SELECT source_types.color FROM source_types WHERE source_types.id = ${sourceId || "0"
              } AND source_types.isDelete = 0)`
            ),
            "selected_source_color",
          ],
          [
            Sequelize.literal(
              `(SELECT CASE WHEN source_types.source_name IS NOT NULL THEN source_types.source_name ELSE '' END FROM source_types WHERE source_types.id = contact_masters.source_type_id AND source_types.isDelete = 0)`
            ),
            "source_name",
          ],
          [
            Sequelize.literal(
              "(SELECT COALESCE(source_types.color, '') FROM source_types WHERE source_types.id = contact_masters.source_type_id AND source_types.isDelete=0)"
            ),
            "source_name_color",
          ],
          [
            Sequelize.literal(
              "(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = contact_masters.contact_status AND stage_status_masters.isDelete = 0)"
            ),
            "stage_status_name",
          ],
          [
            Sequelize.literal(
              "(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = contact_masters.contact_status AND stage_status_masters.isDelete = 0)"
            ),
            "stage_status_color",
          ],
          [
            Sequelize.literal(
              `(SELECT stage_status_masters.name FROM stage_status_masters WHERE stage_status_masters.id = ${stageStatusId || "NULL"
              } AND stage_status_masters.isDelete = 0)`
            ),
            "selected_label_name",
          ],
          [
            Sequelize.literal(
              `(SELECT stage_status_masters.color FROM stage_status_masters WHERE stage_status_masters.id = ${stageStatusId || "NULL"
              } AND stage_status_masters.isDelete = 0)`
            ),
            "selected_label_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_masters.color) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, contact_masters.lable))`
            ),
            "label_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_masters.lable_name) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, contact_masters.lable))`
            ),
            "label_name",
          ],
          [
            Sequelize.literal(
              `(SELECT lable_masters.lable_name FROM lable_masters WHERE lable_masters.id = ${labelId || "NULL"
              } AND lable_masters.isDelete = 0)`
            ),
            "selected_label_name",
          ],
          [
            Sequelize.literal(
              `(SELECT lable_masters.color FROM lable_masters WHERE lable_masters.id = ${labelId || "NULL"
              } AND lable_masters.isDelete = 0)`
            ),
            "selected_label_color",
          ],
        ],
      },
    };

    /* get custome form field */
    const getCustomFormFieldR = await customFormFieldModelIntance.findAll({
      where: { form_type: 1, isDelete: 0 },
      attributes: ["title", "reference_column_name"],
      raw: true
    });
    const getCustomFormFieldObj = isValid(getCustomFormFieldR) ? getCustomFormFieldR.reduce((acc, { reference_column_name, title }) => {
      acc[reference_column_name] = title;
      return acc;
    }, {}) : {};
    /* get custome form field */
    const stageAndStatusMasterModelIntance = stagestatusModel(req.tenantDB);
    const sourceTypesModelIntance = sourceTypesModel(req.tenantDB);
    const priceListMastersModelIntance = priceListMastersModel(req.tenantDB);
    const excelColumnDefineArray = {
      "person_name": "Contact Name",
      "company_name": "Company Name",
      "client_code": "Client Code",
      "mobile_number": "Mobile Number",
      "email_id": "Email",
      "lable": "Assign Label",
      "contact_status": "Status",
      "country_name": "Country",
      "state_name": "State",
      "city_name": "City",
      "area_name": "Area",
      "pincode": "PinCode",
      "address": "Address",
      "shipping_address": "Shipping Address",
      "gst_number": "GST Number",
      "referance_contact": "Reference Contact Details",
      "a_application_login_id": "Created by",
      "assinged_to_price_list": "Pricelist",
      "assinged_to_work_a_application_id": "Assigned User",
      "source_type_id": "Source Type",
      "created_date_time": "Created At",
      "longitude": "Longitude",
      "latitude": "Latitude",
    };

    const excelColumnDefineArrayDy = { ...excelColumnDefineArray, ...getCustomFormFieldObj };

    const contacts = await User.findAll(queryOptions);
    let activeTeamList;
    let activeTeamMap;
    if (contacts) {
      activeTeamList = await loginModel.findAll(
        {
          where: {
            id: {
              [Op.in]: Sequelize.literal(`(
                SELECT a_application_login_id
                FROM company_vs_application_logins
                WHERE isDelete=0 AND company_masters_id = '${findCompanyId.company_masters_id}'
              )`)
            },
            isDelete: 0
          },
          attributes: ["username", "id"],
          raw: true
        }
      );
      activeTeamMap = new Map(
        activeTeamList.map(user => [user.id, user.username])
      );
    }
    const sanitizedContacts = await Promise.all(
      contacts.map(async (contactItem) => {

        const sanitized = sanitizeObjectOfNull(contactItem.toJSON());

        sanitized.created_date_time = sanitized.created_date_time ? formatDateAndTimeCreateDateTime(sanitized.created_date_time) : ""
        const lableIds = sanitized.lable ? sanitized.lable.split(",").map((id) => id.trim()).filter((id) => id) : [];

        if (isValid(sanitized.assinged_to_work_a_application_id)) {
          const assignedIds = sanitized.assinged_to_work_a_application_id.split(",").map((id) => id.trim()).filter((id) => id);
          if (assignedIds.length > 0) {
            sanitized.assinged_to_work_a_application_id = assignedIds.map(id => activeTeamMap.get(Number(id))).filter(Boolean).join(', ');
          }
        }

        sanitized.a_application_login_id = activeTeamMap.get(Number(sanitized.a_application_login_id)) || null;

        if (isValid(sanitized.contact_status)) {
          const stateStatusName = await stageAndStatusMasterModelIntance.findOne({
            where: {
              id: sanitized.contact_status,
              isDelete: 0,
              order_type: 1,
            },
            attributes: ["name"],
            raw: true
          });

          sanitized.contact_status = stateStatusName?.name || "";
        }

        if (isValid(sanitized.source_type_id)) {
          const sourceTypesName = await sourceTypesModelIntance.findOne({
            where: {
              id: sanitized.source_type_id,
              isDelete: 0,
            },
            attributes: ["source_name"],
            raw: true
          });

          sanitized.source_type_id = sourceTypesName?.source_name || "";
        }

        if (isValid(sanitized.referance_contact)) {
          const contactPersonName = await User.findOne({
            where: {
              id: sanitized.referance_contact,
              isDelete: 0,
            },
            attributes: ["person_name"],
            raw: true
          });

          sanitized.referance_contact = contactPersonName?.person_name || "";
        }

        if (isValid(sanitized.assinged_to_price_list)) {
          const priceListName = await priceListMastersModelIntance.findOne({
            where: {
              id: sanitized.assinged_to_price_list,
              isDelete: 0,
            },
            attributes: ["price_list_name"],
            raw: true
          });

          sanitized.assinged_to_price_list = priceListName?.price_list_name || "";
        }

        if (isValid(lableIds)) {
          const lableNames = await lableModelIntance.findAll({
            where: {
              id: { [Op.in]: lableIds },
              isDelete: 0,
            },
            attributes: ["lable_name"],
            raw: true
          });

          const lable_nameList = isValid(lableNames) ? lableNames.map(u => u.lable_name).join(', ') : "";
          sanitized.lable = lable_nameList;
        }

        let objectTemp = {};
        Object.keys(excelColumnDefineArrayDy).map((k) => {
          objectTemp[excelColumnDefineArrayDy[k]] = sanitized[k];
        })

        return objectTemp;
      })
    );

    const data = sanitizedContacts;
    /* Populating Data */

    const savedPath = await exportData(data, { format, fileName, columns: cols, headers: headersObj, autoDownload: false, outputDir: uploadDir });
    const fileUrl = `${EXPORTS_LINK_EXTENDED}contacts/${companyDetail.company_masters_id}/${savedPath.file_name}`
    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name }
    });
  } catch (err) {
    console.error("getExportsContacts Error", err);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${err.message}`,
    });
  }
};

export const CreateContactWithReminder = async (req, res) => {
  try {
    const { person_name, mobile_number, a_application_login_id, remark, call_date, call_duration, call_type, datetime } = req.body;


    if (!a_application_login_id || !mobile_number) {
      return resError({
        ack_msg: "Missing required fields",
        developer_msg: "a_application_login_id or mobile_number is missing",
      });
    }


    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: "No company found for the provided login ID",
      });
    }

    //checks for switch in company master for contact number duplication
    const isContactDuplicationAllowed = await companyModel.findAll({
      where: { id: findCompanyId?.company_masters_id, isDelete: 0 },
      attributes: ["is_contact_validation", "company_name", "id"],
    });


    const COTModel = contactModel(req.tenantDB);
    const CTMModel = contactMessageHistory(req.tenantDB);
    const reminderModel = reminderMessagesModel(req.tenantDB);


    const normalizedMobile = normalizeToTenDigit(mobile_number);
    const CurrentdateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    // Check if contact already exists ONLY when duplication is NOT allowed
    let a_company_name;
    let a_company_id;
    a_company_name = isContactDuplicationAllowed[0]?.dataValues.company_name;
    a_company_id = isContactDuplicationAllowed[0]?.dataValues.id;
    let isNewContact = false;
    const source_type_id = -20;
    const whatsappEmailSendTeamPersonList = [];

    /* Contact Assignment */
    const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
      source_type_id,
      description: remark
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
    /* Contact Assignment */
    const assinged_to_work_a_application_id = contactAssignedIdsStr || a_application_login_id;
    let contactData;
    contactData = await COTModel.findOne({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        mobile_number: {
          [Op.like]: `%${normalizedMobile}`,
        },
        [Op.or]: [
          {
            a_application_login_id: a_application_login_id,
          },
          {
            assinged_to_work_a_application_id:
              [a_application_login_id],
          },
        ],
      },
      order: [['id', 'DESC']],
      attributes: ["id", "person_name"],
    });

    // If not found, search globally
    if (!contactData) {
      contactData = await COTModel.findOne({
        where: {
          isDelete: 0,
          mobile_number: {
            [Op.like]: `%${normalizedMobile}`,
          },
        },
        order: [['id', 'DESC']],
        attributes: ["id", "person_name"],
      });
    }

    if (
      contactData &&
      !isDuplicateContact(isContactDuplicationAllowed[0]?.dataValues?.is_contact_validation, contactData.person_name, person_name)
    ) {
      // Same mobile, different name, and this company allows it - treat as a
      // brand-new contact rather than attaching to the existing one.
      contactData = null;
    }

    if (!contactData) {
      // No existing → create new
      const contactBody = {
        source_type_id: source_type_id || "",
        person_name: person_name || "",
        mobile_number: normalizedMobile,
        company_masters_id: findCompanyId.company_masters_id,
        assinged_to_work_a_application_id: assinged_to_work_a_application_id,
        a_application_login_id,
      };
      contactData = await COTModel.create(contactBody);
      isNewContact = true;
    }

    if (isNewContact) {
      const contactEmailSendList = [];
      const contactWhatsappSendList = [];

      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "contact_masters",
          reference_id: contactData.id,
          status_id: "-1",
          a_application_login_id: a_application_login_id
        }
      );
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

      if (isValid(whatsappEmailSendTeamPersonList) && isValid(normalizedMobile)) {
        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == assinged_to_work_a_application_id);
        if (result) {
          contactWhatsappSendList.push({
            whatsapp_number: normalizedMobile,
            contact_detail: {
              person_name: person_name,
              mobile_number: normalizedMobile,
              company_name: null,
              customer_id: contactData.id
            },
            team_person: assinged_to_work_a_application_id,
            company_name: a_company_name,
            a_company_id: a_company_id,
            send_message: result?.send_message,
            template_id: result?.template_id,
          });
        }
      }
      await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });
    }

    const userData = await loginModel.findOne({
      where: { id: a_application_login_id, isDelete: 0 },
      attributes: ["reporting_member", "username"],
    });
    const isDatetimeEmpty = !datetime || datetime === "" || datetime === null || datetime === undefined;

    const isReminderAppFlag = isDatetimeEmpty ? 1 : 0;
    const statusValue = isDatetimeEmpty ? "-99" : 0;

    let contactMessageId = 0;

    if (!isDatetimeEmpty) {
      const contactMessage = await CTMModel.create({
        company_masters_id: findCompanyId.company_masters_id,
        description: remark || "",
        a_application_login_id,
        message_type_id: 0,
        contact_masters_id: contactData.id,
        message_side: 1,
        is_reminder: 1,
        created_date_time: CurrentdateTime
      });
      contactMessageId = contactMessage.id;
    }

    const durationInSeconds = Number(call_duration);

    const test = await reminderModel.create({
      company_masters_id: findCompanyId.company_masters_id,
      remark: remark || "",
      a_application_login_id,
      assigned_to: a_application_login_id,
      reference_id: contactMessageId,
      reference_table: "contact_message_histories",
      assigned_to_name: userData?.username || "",
      contact_masters_id: contactData.id,
      reminder_data_time: datetime,
      call_date: call_date,
      call_duration: Number.isFinite(durationInSeconds) && durationInSeconds >= 0
        ? `${String(Math.floor(durationInSeconds / 60)).padStart(2, '0')}:${String(durationInSeconds % 60).padStart(2, '0')}`
        : "00:00",
      call_type: call_type,
      is_reminder_app_flag: isReminderAppFlag,
      status: statusValue
    });



    const reportingMemberId = userData?.reporting_member;
    const reportingMemberData = reportingMemberId
      ? await loginModel.findOne({
        where: { id: reportingMemberId, isDelete: 0 },
        attributes: [
          "web_refresh_token",
          "android_refresh_token",
          "ios_refresh_token",
        ],
      })
      : null;

    const ownerTokenData = await companyVsApplicationLoginModel.findAll({
      where: {
        isDelete: 0,
        company_masters_id: findCompanyId.company_masters_id,
        company_flag: 1,
      },
      attributes: ["a_application_login_id"],
    });

    const allLoginIds = ownerTokenData
      .map((item) => item.a_application_login_id)
      .filter((id) => id !== a_application_login_id);

    const ownerTokens = await loginModel.findAll({
      where: { id: allLoginIds, isDelete: 0 },
      attributes: [
        "android_refresh_token",
        "web_refresh_token",
        "ios_refresh_token",
      ],
    });

    const allTokens = [
      ...(reportingMemberData
        ? [
          reportingMemberData.web_refresh_token,
          reportingMemberData.android_refresh_token,
          reportingMemberData.ios_refresh_token,
        ]
        : []),
      ...ownerTokens.flatMap((t) => [
        t.dataValues.android_refresh_token,
        t.dataValues.web_refresh_token,
        t.dataValues.ios_refresh_token,
      ]),
    ].filter((t) => t && t.trim() !== "");

    const uniqueTokens = [...new Set(allTokens)];

    if (uniqueTokens.length > 0) {
      try {
        await sendMultipleNotification({
          deviceTokens: uniqueTokens,
          title: `${userData?.username || "Person"} ${isNewContact
            ? "added a new contact"
            : "added a reminder for existing contact"
            }`,
        });
      } catch (notificationError) {
        console.error("Notification failed:", notificationError.message);
      }
    }

    return resSuccess({
      ack_msg: isNewContact
        ? "New contact and reminder created successfully"
        : "Reminder added for existing contact",
      data: contactData,
    });
  } catch (error) {
    console.error("Error:", error);
    return resBadRequest({
      ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
      developer_msg: error.message || error,
    });
  }
};

export const visitingCardReadByGeminiAndInsertDetail = async (req, res) => {
  try {
    const a_application_login_id = req.headers["x-tenant-id"];
    const findCompanyId = await getCompanyByLoginId(
      a_application_login_id
    );

    // Fetch Gemini API key
    const findGeminiKey = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: "0",
      },
      attributes: ["id", "gimini_appkey", "company_name"],
    });
    if (!findGeminiKey || !findGeminiKey.dataValues.gimini_appkey) {
      return resError({
        ack_msg: "Gemini API key not found",
        developer_msg: `No API key found for company ID`,
      });
    }

    let a_company_name;
    let a_company_id;

    a_company_name = findGeminiKey.dataValues.company_name;
    a_company_id = findGeminiKey.dataValues.id;

    // ---------- Gemini ----------
    const genAI = new GoogleGenerativeAI(findGeminiKey.dataValues.gimini_appkey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    /* --------------------------------------------------------------
   PROMPT – forces Gemini to return **pure JSON only**
   -------------------------------------------------------------- */
    const PROMPT = `You are a multilingual OCR expert. Extract **exactly** these fields from the visiting-card image(s) in **any language**.

    Return **valid JSON only** – **no markdown, no extra text, no explanations**.

    {
      "company_name": "",
      "person_name": "",     // REQUIRED
      "mobile_1": "",        // REQUIRED – digits only
      "mobile_2": "",
      "email": "",
      "address": "",
      "country": "",
      "state": "",
      "city": ""
    }

    Rules:
    - Keep original script (Devanagari, Latin, Arabic, Chinese, …).
    - Missing field → empty string "".
    - Mobile → keep only digits.
    - Email → lowercase, exact.
    - Split address into city/state/country when possible.
    - get company name from card sometimes company name are designed so carefully fetch company name.
    - **Never** add any characters before or after the JSON object.
    `;

    const frontPath = req.files.front?.[0]?.path;
    if (!frontPath) {
      return resBadRequest({
        ack_msg: " ",
        developer_msg: 'Front image required',
      });
    }

    const toBase64 = (p) => ({
      inlineData: {
        data: fs.readFileSync(p, 'base64'),
        mimeType: path.extname(p) === '.png' ? 'image/png' : 'image/jpeg',
      },
    });

    const parts = [toBase64(frontPath)];
    const backPath = req.files.back?.[0]?.path;
    if (backPath) parts.push(toBase64(backPath));

    const result = await model.generateContent([PROMPT, ...parts]);
    const text = result.response.text();

    /* --------------------------------------------------------------
       ROBUST JSON CLEAN-UP – eliminates the “Unexpected non-whitespace…”
       error that appears when Gemini adds ```, new-lines, or stray text.
       -------------------------------------------------------------- */
    let jsonStr = text
      .replace(/^```json\s*/i, '')   // opening ```json
      .replace(/^```/i, '')          // opening ```
      .replace(/```$/g, '')          // closing ```
      .replace(/[\r\n]+/g, ' ')      // collapse line-breaks
      .trim();

    // Keep only the first { … } object
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}') + 1;
    if (start === -1 || end === 0) {
      return resBadRequest({
        ack_msg: " ",
        developer_msg: `No JSON object found`,
        data: { raw: text }
      });
    }
    jsonStr = jsonStr.slice(start, end);

    // Safe parse
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (e) {
      return resBadRequest({
        ack_msg: " ",
        developer_msg: `Invalid JSON from Gemini`,
        data: {
          raw: text,
          cleaned: jsonStr,
        }
      });
    }


    if (!isValid(data?.person_name) || !isValid(data?.mobile_1)) {
      return resError({
        ack_msg: "Scan failed. Please ensure the card is clearly visible."
      })
    }

    /* Contact Entry */
    const mobile_number = normalizeToTenDigit(data?.mobile_1);
    const contactModelIntance = contactModel(req.tenantDB);
    const contactMessageInstance = contactMessageHistory(req.tenantDB);
    const checkDuplication = await contactModelIntance.count({ where: { isDelete: 0, mobile_number: mobile_number } });
    if (checkDuplication) {
      return resError({
        ack_msg: "You’ve already added this contact."
      })
    }

    /* Contact Assignement */
    const whatsappEmailSendTeamPersonList = [];
    const contactAssignedIds = await autoAssignmentContactIdsGet(req, {
      source_type_id: "-17",
      country_id: null,
      state_id: null,
      city_id: null,
      area_id: null,
    });
    console.log("Error Log 1", contactAssignedIds);
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

    const currentDate = new Date();
    const formattedDate = formatDate(currentDate);
    const contactBody = {
      person_name: data?.person_name,
      company_name: data?.company_name || "",
      mobile_number: normalizeToTenDigit(data?.mobile_1),
      email_id: data?.email || "",
      address: data?.address || "",
      a_application_login_id: a_application_login_id,
      company_masters_id: findCompanyId.company_masters_id,
      assinged_to_work_a_application_id: contactAssignedIdsStr || a_application_login_id,
      source_type_id: "-17"
      /* country: data?.country_id || "",
            state: data?.state_id || "",
            city: data?.city_id || "", */
    };

    const visitFrontImage = req.files?.front?.[0];
    const visitbackImage = req.files?.back?.[0];

    let directoryPath;
    let convertPathForntImage;
    let convertPathBackImage;
    const company_id = findCompanyId.company_masters_id;
    if (visitFrontImage) {
      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "visiting_card_image",
        company_id.toString()
      );
    }
    if (visitFrontImage) {
      fs.mkdirp(directoryPath);
    }
    if (visitFrontImage) {
      const frontfilepath = visitFrontImage.path;
      const frontFileName = path.basename(frontfilepath);
      const frontDestinationPath = path.join(directoryPath, frontFileName);

      await fs.move(frontfilepath, frontDestinationPath);
      convertPathForntImage = company_id.toString() + "/" + frontFileName;
    }

    if (visitbackImage) {
      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "visiting_card_image",
        company_id.toString()
      );
    }
    if (visitbackImage) {
      await fs.mkdirp(directoryPath);
    }
    if (visitbackImage) {
      const backfilepath = visitbackImage.path;
      const backFileName = path.basename(backfilepath);
      const backDestinationPath = path.join(directoryPath, backFileName);

      await fs.move(backfilepath, backDestinationPath);
      convertPathBackImage = company_id.toString() + "/" + backFileName;
    }

    const insertContact = await contactModelIntance.create(contactBody)
    if (insertContact) {
      const contactEmailSendList = [];
      const contactWhatsappSendList = [];

      if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactBody?.email_id)) {
        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactBody?.assinged_to_work_a_application_id);
        if (result) {
          contactEmailSendList.push({
            email_id: contactBody?.email_id,
            contact_detail: {
              person_name: contactBody?.person_name,
              mobile_number: contactBody?.mobile_number,
              company_name: contactBody?.company_name
            },
            team_person: contactBody?.assinged_to_work_a_application_id,
            company_name: a_company_name,
            a_company_id: a_company_id,
            send_message: result?.send_message,
          });
        }
      }
      if (isValid(whatsappEmailSendTeamPersonList) && isValid(contactBody?.mobile_number)) {
        const result = whatsappEmailSendTeamPersonList.find(item => item.team_id == contactBody?.assinged_to_work_a_application_id);
        if (result) {
          contactWhatsappSendList.push({
            whatsapp_number: contactBody?.mobile_number,
            contact_detail: {
              person_name: contactBody?.person_name,
              mobile_number: contactBody?.mobile_number,
              company_name: contactBody?.company_name,
              customer_id: insertContact.dataValues.id,
            },
            team_person: contactBody?.assinged_to_work_a_application_id,
            company_name: a_company_name,
            a_company_id: a_company_id,
            send_message: result?.send_message,
            template_id: result?.template_id,
          });
        }
      }
      await prepareMailAndWhatsappSenderToTheContact(req, { contactWhatsappSendList, contactEmailSendList });

      await insertStagesAndStatusLogs(req, {
        reference_table: "contact_masters",
        reference_id: insertContact.dataValues.id,
        status_id: "-1",
        a_application_login_id: a_application_login_id
      })

      const frontImageBlock = convertPathForntImage
        ? `
          <strong>Front Side Image:</strong>
          <a href="${VISITING_CARD_VIEW}${convertPathForntImage}" target="_blank">View Front Image</a><br>
        `
        : "";

      const backImageBlock = convertPathBackImage
        ? `
          <strong>Back Side Image:</strong>
          <a href="${VISITING_CARD_VIEW}${convertPathBackImage}" target="_blank">View Back Image</a><br>
          `
        : "";
      const messageBody = {
        contact_masters_id: insertContact.dataValues.id,
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,

        description: `
          Name: ${data?.person_name || ""}<br>
          Company name: ${data?.company_name || ""}<br>
          Email: ${data?.email || ""}<br>
          Address: ${data?.address || ""}<br>
          Country: ${data?.country || ""}<br>
          State: ${data?.state || ""}<br>
          City: ${data?.city || ""}<br>
          <b>Mobile No.:</b> <b>${data?.mobile_1 || ""}</b><br>
          ${frontImageBlock}
          ${backImageBlock}
       `,

        created_date_time: formattedDate,
        message_side: "2",
        message_type_id: "0",
      };
      await contactMessageInstance.create(messageBody);
    }
    /* Contact Entry */

    return resSuccess({
      data: { success: true, data, ack_msg: 'Visiting card scanned successfully!' }
    });

  } catch (error) {
    return resBadRequest({
      ack_msg: isGeminiQuotaError(error) ? 'Gemini AI feature is temporarily unavailable due to usage limits. Please enable billing or try again later.' : '',
      developer_msg: `${error.message}`,
    });
  } finally {
    ['front', 'back'].forEach((key) => {
      const file = req.files[key]?.[0];
      if (file?.path && fs.existsSync(file.path)) {
        fs.unlink(file.path, () => { });
      }
    });
  }
};

export function isGeminiQuotaError(error) {
  if (!error) return false;

  // Axios / fetch style
  const status = error?.response?.status || error?.status;
  const message =
    error?.response?.data?.error?.message ||
    error?.message ||
    "";

  if (status === 429) return true;

  return (
    message.includes("Quota exceeded") ||
    message.includes("Too Many Requests") ||
    message.includes("generate_content_free_tier") ||
    message.includes("exceeded your current quota")
  );
}


export const generateContactSampleSheet = async (req, res) => {
  try {
    const { a_application_login_id } = req.body;
    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    const fileName = `sample_contact_sheet_${randomUUID()}`;
    const format = 'xlsx'
    const cols = null;
    const headersObj = null;
    const outputDir = `media-folder/exports/contacts/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);

    /** Fetch dynamic custom fields **/
    const getCustomFormFieldR = await customFormFieldModelIntance.findAll({
      where: { form_type: 1, isDelete: 0 },
      attributes: ["title", "reference_column_name", "required_or_not"],
      raw: true,
    });

    const getCustomFormFieldObj = Array.isArray(getCustomFormFieldR)
      ? getCustomFormFieldR.reduce((acc, { reference_column_name, title }) => {
        acc[title] = '';
        return acc;
      }, {})
      : {};

    const getCustomFormFieldBgMantegoryObj = Array.isArray(getCustomFormFieldR)
      ? getCustomFormFieldR.reduce((acc, { reference_column_name, title, required_or_not }) => {
        if (required_or_not == 1) {
          acc[title] = 'FFFF0000';
        }
        return acc;
      }, {})
      : {};

    /** Default fields **/
    const excelColumnDefineArray = {
      "person_name": "DEMO CONTACT",
      "company_name": "DEMO COMPANY",
      "Email": "test@demo.com",
      "mobile_number": "2525252525",
      "client_code": "0001",
      "Country": "india",
      "State": "gujarat",
      "City": "rajkot",
      "Area": "gondal",
      "Pincode": "360001",
      "Address": "TESTING, ADDRESS NEAR TEST, OPPOSITE TEST, 360023",
      "shipping_address": "TESTING, ADDRESS NEAR TEST, OPPOSITE TEST, 360023",
      "gst_number": "AAAAAAAAAAAAAAA",
      "price_list": "DEMO PRICELIST",
      "source_type": "INDIAMART",
      "label": "Contractor,Vendor,Distributor,Dealer",
      "category_name": "DEMO CATEGORY",
      "product_name": "DEMO PRODUCT",
      "required_quantity": "1",
      "requirement_type": "one time",
      "Description": "DEMO PRODUCT REQUIRMENT",
      "datetime": "2025-01-01 13:03:03",
      "latitude": "11111",
      "longitude": "11111",
    };

    /** Merge dynamic fields **/
    const excelColumnDefineArrayDy = {
      ...excelColumnDefineArray,
      ...getCustomFormFieldObj,
    };

    const data = [excelColumnDefineArrayDy]; // One row sample


    const colorColumns = {
      person_name: "FFFF0000",        // red
      mobile_number: "FFFF0000",   // blue
    };

    const requredBgColorColumn = { ...colorColumns, ...getCustomFormFieldBgMantegoryObj }

    /** Export Excel File **/
    const savedPath = await exportData(data, { format, fileName, columns: cols, headers: headersObj, autoDownload: false, outputDir: uploadDir, colorColumns: requredBgColorColumn });

    const fileUrl = `${EXPORTS_LINK_EXTENDED}contacts/${companyDetail.company_masters_id}/${savedPath.file_name}`;

    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name },
    });
  } catch (error) {
    console.error("exportContactSampleSheet Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};

export const assignContact = async (req) => {
  try {
    const { appliedFilers, updateCollection, appliedTo, a_application_login_id } = req.body;
    // if (!isValid(updateCollection)) {
    //   return resError({
    //     ack_msg: "Invalid Request."
    //   })
    // }
    let whereClause_e = {};
    if (appliedTo == "all") {
      appliedFilers.a_application_login_id = a_application_login_id;
      const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: appliedFilers })
      whereClause_e = whereClause;
    } else if (isValid(appliedTo)) {
      whereClause_e.id = appliedTo;
      whereClause_e.isDelete = 0;
    } else {
      return resBadRequest({
        ack_msg: "Something went wrong",
        developer_msg: `Something went wrong`,
      });
    }
    const User = contactModel(req.tenantDB);

    const contacts = await User.findAll({
      where: whereClause_e,
      attributes: ["id", "assinged_to_work_a_application_id"],
      raw: true
    });

    await Promise.all(
      contacts.map(async (contact) => {

        let assined_to = "";

        if (appliedFilers?.isOverrideExistingContactCheckbox) {

          if (isValid(updateCollection)) {
            const existing = contact.assinged_to_work_a_application_id
              ? contact.assinged_to_work_a_application_id.split(",").map(Number)
              : [];

            const merged = [...new Set([...existing, ...updateCollection.map(Number)])];

            assined_to = merged.join(",") || "";
          }
        } else {
          assined_to = updateCollection?.join(",") || "";
        }

        return User.update(
          { assinged_to_work_a_application_id: assined_to },
          { where: { id: contact.id } }
        );

      })
    );


    return resSuccess({
      // data: { 0 },
      ack_msg: "Team member assigned successfully."
    });
  } catch (error) {
    console.error("assignContact Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const assignLableContact = async (req) => {
  try {
    const { appliedFilers, updateCollection, appliedTo, a_application_login_id } = req.body;
    if (updateCollection.length > 0 && !isValid(updateCollection)) {
      return resError({
        ack_msg: "Selected Label Not Found."
      })
    }
    let whereClause_e = {};
    if (appliedTo == "all") {
      appliedFilers.a_application_login_id = a_application_login_id;
      const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: appliedFilers })
      whereClause_e = whereClause;
    } else if (isValid(appliedTo)) {
      whereClause_e.id = appliedTo;
      whereClause_e.isDelete = 0;
    } else {
      return resBadRequest({
        ack_msg: "Something went wrong",
        developer_msg: `Something went wrong`,
      });
    }
    const User = contactModel(req.tenantDB);

    const [affectedRows] = await User.update(
      {
        lable: updateCollection?.join(",") || ""
      },
      { where: whereClause_e }
    )
    return resSuccess({
      data: { affectedRows },
      ack_msg: "Label assigned successfully."
    });
  } catch (error) {
    console.error("assignLabelContact Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const assignSourceContact = async (req) => {
  try {
    const { appliedFilers, updateCollection, appliedTo, a_application_login_id } = req.body;
    if (!isValid(updateCollection)) {
      return resError({
        ack_msg: "Selected Source Not Found."
      })
    }
    let whereClause_e = {};
    if (appliedTo == "all") {
      appliedFilers.a_application_login_id = a_application_login_id;
      const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: appliedFilers })
      whereClause_e = whereClause;
    } else if (isValid(appliedTo)) {
      whereClause_e.id = appliedTo;
      whereClause_e.isDelete = 0;
    } else {
      return resBadRequest({
        ack_msg: "Something went wrong",
        developer_msg: `Something went wrong`,
      });
    }
    const User = contactModel(req.tenantDB);

    const [affectedRows] = await User.update(
      {
        source_type_id: updateCollection
      },
      { where: whereClause_e }
    )
    return resSuccess({
      data: { affectedRows },
      ack_msg: "Source assigned successfully."
    });
  } catch (error) {
    console.error("assignSourceContact Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const assignStatusContact = async (req) => {
  try {
    const { appliedFilers, updateCollection, appliedTo, a_application_login_id } = req.body;
    if (!isValid(updateCollection)) {
      return resError({
        ack_msg: "Selected Status Not Found."
      })
    }
    let whereClause_e = {};
    if (appliedTo == "all") {
      appliedFilers.a_application_login_id = a_application_login_id;
      const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: appliedFilers })
      whereClause_e = whereClause;
    } else if (isValid(appliedTo)) {
      whereClause_e.id = appliedTo;
      whereClause_e.isDelete = 0;
    } else {
      return resBadRequest({
        ack_msg: "Something went wrong",
        developer_msg: `Something went wrong`,
      });
    }
    const User = contactModel(req.tenantDB);

    const [affectedRows] = await User.update(
      {
        contact_status: updateCollection
      },
      { where: whereClause_e }
    )

    /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
    const fetchUpdatedContactIdsDb = await User.findAll({ where: whereClause_e, raw: true, attributes: ["id"] });
    await Promise.all(
      fetchUpdatedContactIdsDb.map((v) =>
        insertStagesAndStatusLogs(req, {
          reference_table: "contact_masters",
          reference_id: v.id,
          status_id: updateCollection,
          a_application_login_id: a_application_login_id
        })
      )
    );
    /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

    return resSuccess({
      data: { affectedRows },
      ack_msg: "Status assigned successfully."
    });
  } catch (error) {
    console.error("assignStatusContact Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const assignReadUnreadContact = async (req) => {
  try {
    const { appliedFilers, updateCollection, appliedTo, a_application_login_id } = req.body;
    // if (!isValid(updateCollection)) {
    //   return resError({
    //     ack_msg: "Selected Data Not Found."
    //   })
    // }
    let type;
    if (updateCollection === '1' || updateCollection === 1) { //unread
      type = 'unread';
    } else if (updateCollection === '0' || updateCollection === 0) { // read
      type = 'read';
    } else {
      return resError({
        ack_msg: "Selected Data Not Found."
      })
    }

    let whereClause_e = {};
    if (appliedTo == "all") {
      appliedFilers.a_application_login_id = a_application_login_id;
      const { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData } = await buildContactWhereClause({ req, params: appliedFilers })
      whereClause_e = whereClause;
    } else if (isValid(appliedTo)) {
      whereClause_e.id = appliedTo;
      whereClause_e.isDelete = 0;
    } else {
      return resBadRequest({
        ack_msg: "Something went wrong",
        developer_msg: `Something went wrong`,
      });
    }
    const User = contactModel(req.tenantDB);

    const contacts = await User.findAll({
      where: whereClause_e,
      attributes: ["id", "is_read_by_a_application_login_id"],
      raw: true
    });

    await Promise.all(
      contacts.map(async (contact) => {
        let updateObj = {};
        const is_read_by_a_application_login_id_arr = contact.is_read_by_a_application_login_id ? contact.is_read_by_a_application_login_id.split(",") : [a_application_login_id];
        const exists = is_read_by_a_application_login_id_arr.includes(a_application_login_id);
        if (type == 'unread') {
          const filterArr = exists
            ? is_read_by_a_application_login_id_arr.filter(item => item !== a_application_login_id)
            : is_read_by_a_application_login_id_arr;
          updateObj = {
            is_read_by_a_application_login_id: filterArr ? filterArr.join(",") : ""
          };

        } else if (type == 'read') {
          const filterArr = !exists ? [...is_read_by_a_application_login_id_arr, a_application_login_id] : is_read_by_a_application_login_id_arr;
          updateObj = { is_read_by_a_application_login_id: filterArr ? filterArr.join(",") : a_application_login_id };
        }
        return User.update(
          updateObj,
          { where: { id: contact.id } }
        );
      })
    );

    return resSuccess({
      ack_msg: "Updated successfully."
    });
  } catch (error) {
    console.error("assignStatusContact Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const checkContactMobileDuplicate = async (req, res) => {
  try {
    const { mobile_number, a_application_login_id, person_name } = req.body;

    // Basic validation
    if (!mobile_number) {
      return resError({
        ack_msg: "Mobile number is required",
        developer_msg: "mobile_number is missing in request body",
      });
    }

    const findCompanyId = await getCompanyByLoginId(
      a_application_login_id
    );
    const COTModel = contactModel(req.tenantDB);
    const normalizedMobile = normalizeToTenDigit(mobile_number);

    const companyData = await companyModel.findOne({
      where: { id: findCompanyId.company_masters_id, isDelete: 0 },
      attributes: ["is_contact_validation"],
    });
    let isDuplicate = false;
    let ack_msg = "Mobile number is available.";
    {
      const existingMobileNum = await COTModel.findOne({
        where: {
          mobile_number: normalizedMobile,
          company_masters_id: findCompanyId.company_masters_id,
          isDelete: 0,
        },
        attributes: ["mobile_number", "person_name", "id"],
      });

      if (
        existingMobileNum?.dataValues?.mobile_number &&
        isDuplicateContact(
          companyData?.is_contact_validation,
          existingMobileNum.dataValues.person_name,
          person_name,
        )
      ) {
        isDuplicate = true;
        ack_msg = `Mobile number ${normalizedMobile} already exists in this company.`;
      }
    }
    if (isDuplicate) {
      return resError({
        ack_msg: ack_msg,
        developer_msg: "Mobile number duplication detected",
        data: {
          isDuplicate: true,
        }
      });
    }

    // No duplicate
    return resSuccess({
      ack_msg: ack_msg,
      developer_msg: "Mobile number is available for use",
      data: {
        isDuplicate: false,
      }
    });

  } catch (error) {
    logger.error("Mobile duplicate check error:", error);
    return resError({
      ack_msg: "Failed to check mobile number duplication",
      developer_msg: error.message || "Unknown error occurred",
    });
  }
};

export async function buildContactWhereClause({
  req, params
}) {
  const {
    tenantDB,
    a_application_login_id,
    searchTerm,
    createdByMultiTeamMember,
    assignedByMultiTeamMember,
    country,
    state,
    city,
    area,
    labelFilter,
    labelId,
    sourceTypeFilter,
    startDate,
    endDate,
    statusFilter,
    selectedActiveId,
    selectedDays,
    isPinByApplicationId,
    isPin,
    isUnread,
    isArchive,
    sourceId,
    stageStatusId,
    labelwiseContactShowAndOrNot,
    checkedOptionsContactassignOrNot
  } = params;
  let whereClause = { isDelete: "0" };
  let relevanceOrder;
  /* -----------------------------------------------------------
      1. COMPANY + USER RIGHTS
  ------------------------------------------------------------ */
  const findCompanyId = await getCompanyByLoginId(a_application_login_id);

  const { showAllData, showPersonalData } = await getUserRights({
    company_masters_id: findCompanyId.company_masters_id,
    a_application_login_id,
    page_id: PAGE_ID.CONTACT,
    tenentId: req.tenantDB
  });

  if (showPersonalData) {
    whereClause[Op.or] = [
      Sequelize.literal(`FIND_IN_SET(${a_application_login_id}, assinged_to_work_a_application_id)`),
      // Sequelize.literal(`FIND_IN_SET(assinged_to_work_a_application_login_id, '${a_application_login_id}')`),
    ];
  } else if (showAllData) {
    // whereClause[Op.or] = [
    //   { company_masters_id: findCompanyId.company_masters_id },
    // ];
  } else {
    whereClause[Op.or] = [{ a_application_login_id: null }];
  }

  whereClause[Op.and] = whereClause[Op.and] || [];

  /* -----------------------------------------------------------
      2. TEAM MEMBER FILTERS (multi-select)
  ------------------------------------------------------------ */
  const parts = [];

  if (createdByMultiTeamMember?.length) {
    parts.push(
      ...createdByMultiTeamMember.map(id => `FIND_IN_SET(${id}, a_application_login_id) > 0`)
    );
  }

  if (assignedByMultiTeamMember?.length) {
    parts.push(
      ...assignedByMultiTeamMember.map(id => `FIND_IN_SET(${id}, assinged_to_work_a_application_id) > 0`)
    );
  }

  if (parts.length) {
    whereClause[Op.and].push(Sequelize.literal(`(${parts.join(" OR ")})`));
  }

  /* -----------------------------------------------------------
      3. FULL TEXT + EXACT SEARCH
  ------------------------------------------------------------ */

  if (isValid(searchTerm) && searchTerm !== "undefined") {
    const searchableColumns = [
      "person_name",
      "mobile_number",
      "company_name",
      "email_id",
      "client_code",
    ];

    const { searchClause, relevanceSearchOrder } = buildSearchQuery(searchTerm, searchableColumns);
    relevanceOrder = relevanceSearchOrder

    whereClause[Op.and].push({ searchClause });
  }

  /* -----------------------------------------------------------
      4. BASIC FILTERS
  ------------------------------------------------------------ */
  if (isValid(country)) whereClause.country = country;
  if (isValid(state)) whereClause.state = state;
  if (isValid(city)) whereClause.city = city;
  if (isValid(area)) whereClause.area = area;

  /* -----------------------------------------------------------
      5. LABEL / MULTI LABEL
  ------------------------------------------------------------ */
  if (isValid(labelFilter)) {

    const hasBlankLabel = labelFilter.includes(-9999);

    const normalLabelIds = labelFilter.filter(id => id !== -9999);

    const labelConditions = [];

    // Normal FIND_IN_SET conditions
    if (normalLabelIds.length > 0) {
      const labelCondition = normalLabelIds
        .map(id => `FIND_IN_SET(${id}, lable) > 0`)
        .join(labelwiseContactShowAndOrNot == 2 ? " AND " : " OR ");

      labelConditions.push(`(${labelCondition})`);
    }

    // Blank label condition for -9999
    if (hasBlankLabel) {
      labelConditions.push(`(lable IS NULL OR lable = '')`);
    }

    const conditions = [];
    // Combine all label conditions
    conditions.push(`(${labelConditions.join(" OR ")})`);

    // Combine all
    whereClause[Op.and].push(
      Sequelize.literal(`(${conditions.join(" OR ")})`)
    );
  } else if (isValid(labelId)) {
    whereClause[Op.and].push(
      Sequelize.literal(`FIND_IN_SET(${labelId}, lable)`)
    );
  }

  /* -----------------------------------------------------------
      6. SOURCE TYPE FILTER
  ------------------------------------------------------------ */
  if (sourceTypeFilter?.length > 0) {
    const hasBlank = sourceTypeFilter.includes(-8888);
    const normalSourceTypes = sourceTypeFilter.filter(
      id => id !== -8888
    );
    if (hasBlank && normalSourceTypes.length > 0) {
      whereClause.source_type_id = {
        [Op.or]: [
          { [Op.in]: normalSourceTypes },
          { [Op.is]: null },
          { [Op.eq]: 0 },
          { [Op.eq]: '' }
        ]
      };
    } else if (hasBlank) {
      whereClause.source_type_id = {
        [Op.or]: [
          { [Op.is]: null },
          { [Op.eq]: 0 },
          { [Op.eq]: '' }
        ]
      };
    } else {
      whereClause.source_type_id = { [Op.in]: normalSourceTypes };
    }
  }

  /* -----------------------------------------------------------
      7. DATE FILTER RANGE
  ------------------------------------------------------------ */
  if (startDate && endDate) {
    whereClause[Op.and].push(
      Sequelize.where(
        Sequelize.fn("DATE", Sequelize.col("created_date_time")),
        { [Op.gte]: startDate }
      )
    );
    whereClause[Op.and].push(
      Sequelize.where(
        Sequelize.fn("DATE", Sequelize.col("created_date_time")),
        { [Op.lte]: endDate }
      )
    );
  }

  /* -----------------------------------------------------------
      8. CONTACT STATUS FILTER
  ------------------------------------------------------------ */
  if (isValid(statusFilter)) {
    const hasBlank = statusFilter.includes(-7777);
    const normalStatus = statusFilter.filter(
      id => id !== -7777
    );
    if (hasBlank && normalStatus.length > 0) {
      whereClause.contact_status = {
        [Op.or]: [
          { [Op.in]: normalStatus },
          { [Op.is]: null },
          { [Op.eq]: 0 },
          { [Op.eq]: '' }
        ]
      };
    } else if (hasBlank) {
      whereClause.contact_status = {
        [Op.or]: [
          { [Op.is]: null },
          { [Op.eq]: 0 },
          { [Op.eq]: '' }
        ]
      };

    } else {
      whereClause.contact_status = { [Op.in]: normalStatus };
    }
  }


  /* -----------------------------------------------------------
      9. ACTIVE / DEACTIVATE CONTACT FILTER
  ------------------------------------------------------------ */
  if (isValid(selectedActiveId)) {
    let cartWhere = { type: 3 };
    const cartModelDb = await cartModel(req.tenantDB);

    if (isValid(selectedDays)) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - parseInt(selectedDays));

      cartWhere.created_date_time = { [Op.gte]: pastDate };
    }

    const cartContacts = await cartModelDb.findAll({
      where: cartWhere,
      attributes: ["to_customer_id"],
    });

    const cartIds = cartContacts.map(c => c.to_customer_id);

    if (selectedActiveId.toLowerCase() === "active") {
      whereClause.id = { [Op.in]: cartIds.length > 0 ? cartIds : [0] };
    } else if (selectedActiveId.toLowerCase() === "deactivate") {
      whereClause.id = { [Op.notIn]: cartIds.length > 0 ? cartIds : [0] };
    }
  }

  /* -----------------------------------------------------------
      10. PIN FILTER
  ------------------------------------------------------------ */
  if (isPinByApplicationId && isPin === 1) {
    whereClause[Op.and].push(
      Sequelize.literal(
        `FIND_IN_SET(${isPinByApplicationId}, is_pin_by_a_application_login_id)`
      )
    );
  }

  /* -----------------------------------------------------------
      11. UNREAD FILTER
  ------------------------------------------------------------ */
  if (isUnread == 1 && isArchive != 1) {
    whereClause[Op.and].push(
      Sequelize.literal(
        `FIND_IN_SET(${a_application_login_id}, is_read_by_a_application_login_id) = 0`
      )
    );
  }

  if (String(isArchive) === "1" || String(isArchive) === "0") {
    whereClause.is_archive = String(isArchive);
  }

  /* -----------------------------------------------------------
      12. SOURCE TYPE SINGLE
  ------------------------------------------------------------ */
  if (sourceId) whereClause.source_type_id = sourceId;

  /* -----------------------------------------------------------
      13. STAGE FILTER
  ------------------------------------------------------------ */
  if (isValid(stageStatusId)) {
    whereClause[Op.and].push(
      Sequelize.literal(`FIND_IN_SET(${stageStatusId}, contact_status)`)
    );
  }
  /* -----------------------------------------------------------
    14. Unassign Contact Filter
------------------------------------------------------------ */
  if (
    Array.isArray(checkedOptionsContactassignOrNot) &&
    checkedOptionsContactassignOrNot.includes(1)
  ) {
    whereClause[Op.and].push(
      Sequelize.literal(`
      a_application_login_id = ${a_application_login_id}
      AND 
      (
        assinged_to_work_a_application_id = '${a_application_login_id}' 
        OR assinged_to_work_a_application_id IS NULL 
        OR assinged_to_work_a_application_id = ''
      )
    `)
    );
  }
  return { whereClause, relevanceOrder, findCompanyId, showAllData, showPersonalData };
}

