import jwt from "jsonwebtoken";
import moment from "moment";
import { Op } from "sequelize";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import applicationPagesModel from "../../models/application_login/applicationPagesModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import planVsPageModel from "../../models/configuration/planVsPageModel.js";
import {
  formatDateAndTimeCreateDateTime,
  isValid,
  resBadRequest,
  resError,
  resSuccess
} from "../../utils/sharedFunctions.js";
import {
  getCompanyByLoginId,
  loginHistories
} from "../commonServices.js";

import { PAGE_ID } from "../../../src/utils/AppEnumeration.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { cartModel } from "../../models/activities/cartsModel.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { inquiryModel } from "../../models/activities/inquiryModel.js";
import { attendanceModel } from "../../models/hr/attendanceModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import {
  APPLICATION_LOGIN_PROFILE_IMG_LINK_EXTENDED,
  JWT_TOKEN_EXPIRES_TIME,
  JWT_TOKEN_SIGNATURE,
} from "../../utils/appConstants.js";
import logger from "../../utils/logger.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

export const getAllJoinURL = async (req, res) => {
  try {
    const { a_application_login_id, invitation_key, company_flag } = req.body;

    const companyMaster = {
      a_application_login_id,
      invitation_key,
      company_flag: company_flag || 2,
    };
    const findCompany = await companyModel.findOne({
      where: {
        isDelete: 0,
        invitation_key: companyMaster.invitation_key,
      },
    });



    if (!findCompany) {
      return resError({
        ack_msg:
          "Invitation key is Invalid. Please contact your Company Admin.",
        developer_msg: "Company not found with this invitation key.",
      });
    }
    const alreadyJoined = await companyVsApplicationLoginModel.findOne({
      where: {
        company_masters_id: findCompany.id,
        a_application_login_id: companyMaster.a_application_login_id,
        isDelete: 0,
      },
    });

    if (alreadyJoined) {
      return resError({
        ack_msg: "You have already joined this company.",
        developer_msg: "Duplicate join attempt.",
      });
    }

    const companyId = findCompany.dataValues.id;

    //Step 1: Count how many users are linked to this company
    const userList = await companyVsApplicationLoginModel.findAll({
      where: { company_masters_id: companyId, isDelete: 0 },
      attributes: ["company_masters_id", "a_application_login_id"],
    });

    const userCount = userList.length;

    //Step 2: Validate plan-wise limit
    // const userRightsList = await applicationLoginTypeRightModel.findAll({
    //   where: {
    //     company_masters_id: companyId,
    //     page_id: 34,
    //     isDelete: 0,
    //   },
    //   attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    // });
    const tenantUserId = userList?.[0]?.a_application_login_id;

    req.headers["x-tenant-id"] = tenantUserId;
    await new Promise((resolve, reject) => {
      tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
    });

    if (!req.tenantDB) {
      return resError(res, { ack_msg: "Tenant DB not initialized" });
    }
    const tenantDBConnection = req.tenantDB;
    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(tenantDBConnection);

    const userRightsList = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        company_masters_id: companyId,
        page_id: PAGE_ID.TEAM_MEMBER_ACESSES,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "a_page_id_rights_jason"],
    });

    for (const userRight of userRightsList) {
      try {
        const rightsJson = JSON.parse(
          userRight.dataValues.a_page_id_rights_jason
        );
        const result = !isNaN(rightsJson.limit) && rightsJson.limit !== "" ? Number(rightsJson.limit) : rightsJson.limit;
        if (typeof result === "number") {
          if (result > 0 && userCount >= result) {
            return resError({
              ack_msg: "Your Team Member Limit Exceeded",
              developer_msg: `Limit ${result} reached for Company`,
            });
          }
        }
      } catch (err) {
        console.error(
          "Error parsing JSON for a_application_login_id:",
          userRight.a_application_login_id,
          err
        );
      }
    }

    const isSelfJoinAttempt = await companyModel.findOne({
      where: {
        invitation_key: companyMaster.invitation_key,
        a_application_login_id: companyMaster.a_application_login_id,
        isDelete: 0,
      },
    });

    if (isSelfJoinAttempt) {
      return resError({
        ack_msg: "You are not allowed to join your own company via invite.",
        developer_msg: "Company creator trying to join as member.",
      });
    }
    const joinPayload = {
      company_masters_id: findCompany.id,
      company_flag: companyMaster.company_flag,
      a_application_login_id: companyMaster.a_application_login_id,
    };

    const invitationResult = await companyVsApplicationLoginModel.create(
      joinPayload
    );
    await companyPlaneCreateWayJoin({
      a_application_login_id: companyMaster.a_application_login_id,
      company_id: findCompany.id,
      plan_number: findCompany.plan_id,
      tenantDB: tenantDBConnection,
    });

    const token = jwt.sign(
      { a_application_login_id: companyMaster.a_application_login_id },
      JWT_TOKEN_SIGNATURE,
      { expiresIn: JWT_TOKEN_EXPIRES_TIME }
    );
    await loginHistories({
      a_application_login_id: companyMaster.a_application_login_id,
    });
    const joinedUser = await loginModel.findOne({
      where: { id: companyMaster.a_application_login_id, isDelete: 0 },
      attributes: ["username"],
      raw: true,
    });
    let currentTimestampNew = Date.now();

    const FindInvitationKeyId = await companyModel.findOne({
      where: {
        isDelete: 0,
        invitation_key: companyMaster.invitation_key,
      },
      attributes: ["id", "a_application_login_id"],
    });

    if (FindInvitationKeyId) {
      const newInvitationKey = `${currentTimestampNew}a${FindInvitationKeyId.a_application_login_id}`;

      await companyModel.update(
        {
          invitation_key: newInvitationKey,
        },
        {
          where: {
            isDelete: 0,
            id: FindInvitationKeyId.id,
          },
        }
      );
    }
    const companyMembers = await companyVsApplicationLoginModel.findAll({
      where: {
        company_masters_id: findCompany.id,
        isDelete: 0,
      },
      attributes: ["a_application_login_id"],
      raw: true,
    });

    const memberIds = companyMembers.map((m) => m.a_application_login_id);

    const tokenData = await loginModel.findAll({
      where: {
        id: memberIds,
        isDelete: 0,
      },
      attributes: [
        "android_refresh_token",
        "web_refresh_token",
        "ios_refresh_token",
      ],
      raw: true,
    });

    const tokens = tokenData
      .flatMap(
        ({ android_refresh_token, web_refresh_token, ios_refresh_token }) => [
          android_refresh_token,
          web_refresh_token,
          ios_refresh_token,
        ]
      )
      .filter((token) => token && token.trim() !== "");

    if (tokens.length > 0) {
      try {
        await sendMultipleNotification({
          deviceTokens: tokens,
          title: `${joinedUser.username} has joined the team.`,
          body: `Welcome to the team ${joinedUser.username}!`,
        });
      } catch (notificationError) {
        logger.error("Notification failed:", notificationError.message);
      }
    } else {
      logger.info("No tokens found for team members.");
    }

    return resSuccess({
      data: { item: invitationResult, token },
      ack_msg: "You have joined the company successfully.",
    });
  } catch (error) {
    console.error("Error in getAllJoinURL:", error);
    return resBadRequest({
      developer_msg: error.message || error,
    });
  }
};


const companyPlaneCreateWayJoin = async ({
  a_application_login_id,
  company_id,
  plan_number,
  tenantDB
}) => {
  try {
    const formattedDateAndTime = moment().format("YYYY-MM-DD HH:mm:ss");

    // 1 Get plan vs page mapping
    const planPages = await planVsPageModel.findAll({
      where: { isDelete: 0, plan_id: plan_number },
      attributes: ["page_id", "data_limit"]
    });

    if (!planPages.length) {
      return resError({
        developer_msg: "No pages found for the selected plan",
      });
    }

    const pageDataLimits = planPages.map(({ dataValues }) => ({
      page_id: dataValues.page_id,
      data_limit: dataValues.data_limit,
    }));

    const pageIds = pageDataLimits.map(item => item.page_id);

    // 2 Fetch application pages
    const applicationPages = await applicationPagesModel.findAll({
      where: { isDelete: 0, id: pageIds }
    });

    if (!applicationPages.length) {
      return resError({
        developer_msg: "No application pages found",
      });
    }

    const applicationLoginTypeRightModelInstance =
      applicationLoginTypeRightModel(tenantDB);

    // 3 Upsert rights for each page
    const upsertPromises = applicationPages.map(({ dataValues }) => {
      const matchingPage = pageDataLimits.find(
        item => item.page_id === dataValues.id
      );

      return applicationLoginTypeRightModelInstance.upsert({
        a_application_login_id,
        company_masters_id: company_id,
        page_id: dataValues.id,
        page_name: dataValues.page_name,
        a_page_id_rights_jason: JSON.stringify({
          view: 1,
          add: [45, 46, 47, 48].includes(dataValues.id) ? 0 : 1,
          edit: [45, 46, 47, 48].includes(dataValues.id) ? 0 : 1,
          delete: dataValues.id === 5 ? 1 : 0,
          approve: 0,
          import: 1,
          print: 1,
          share: 1,
          all_data: 0,
          personal: 1,
          limit: matchingPage ? matchingPage.data_limit : "",
        }),
        created_date_time: formattedDateAndTime,
      });
    });

    const result = await Promise.all(upsertPromises);

    return resSuccess({
      data: { result },
      developer_msg: "Your Plan is Created/Updated",
    });

  } catch (error) {
    console.error("companyPlaneCreateWayJoin Error", error);
    return resBadRequest({
      developer_msg: `${error}`,
    });
  }
};


export const getByIdTeam = async (req) => {
  try {
    const { a_application_login_id, searchTerm } = req.body;

    const findAllApplicationLogin = await getCompanyByLoginId(
      a_application_login_id
    );

    let targetCompanyId =
      req.body.company_masters_id ||
      findAllApplicationLogin?.company_masters_id;

    let targetCompanyIds = targetCompanyId ? [targetCompanyId] : [];

    if (targetCompanyId) {
      const companyRecord = await companyModel.findOne({
        where: { id: targetCompanyId, isDelete: 0 },
        attributes: ["id", "parent_company_id"]
      });

      if (companyRecord) {
        const isMainCompany =
          companyRecord.dataValues.parent_company_id === null ||
          companyRecord.dataValues.parent_company_id === undefined;

        if (isMainCompany) {
          // Main company login: show all team members belonging to main company and its sub-workspaces
          const sisterWorkspaces = await companyModel.findAll({
            where: {
              [Op.or]: [
                { id: targetCompanyId },
                { parent_company_id: targetCompanyId }
              ],
              isDelete: 0
            },
            attributes: ["id"],
            raw: true
          });

          if (sisterWorkspaces && sisterWorkspaces.length > 0) {
            targetCompanyIds = sisterWorkspaces.map((w) => w.id);
          }
          if (!targetCompanyIds.includes(targetCompanyId)) {
            targetCompanyIds.push(targetCompanyId);
          }
        } else {
          // Workspace login: show ONLY team members assigned to this specific workspace
          targetCompanyIds = [targetCompanyId];
        }
      }
    }

    const companyVsApplicationLoginResult =
      await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          company_masters_id: { [Op.in]: targetCompanyIds },
        },
      });

    const findApplicationId = [
      ...new Set(companyVsApplicationLoginResult.map((item) => item.a_application_login_id))
    ];

    const flagMap = new Map();
    for (const item of companyVsApplicationLoginResult) {
      const existing = flagMap.get(item.a_application_login_id);
      if (existing === undefined || item.company_flag < existing) {
        flagMap.set(item.a_application_login_id, item.company_flag);
      }
    }

    const findcompanyFlag = Array.from(flagMap.entries()).map(
      ([a_application_login_id, company_flag]) => ({
        a_application_login_id,
        company_flag,
      })
    );

    if (companyVsApplicationLoginResult) {
      const result = await loginModel.findAll({
        where: {
          id: findApplicationId,
          isDelete: "0",
          username: {
            [Op.like]: `%${searchTerm ? searchTerm : ""}%`,
          },
        },
      });
      const attendanceModels = attendanceModel(req.tenantDB);
      console.log("Attendance Model:", attendanceModels);

      // Get all user IDs
      const userIds = result.map(user => user.id);

      // Fetch latest attendance per user
      const latestAttendance = await attendanceModels.findAll({
        where: {
          a_application_login_id: userIds,
          isDelete: 0
        },
        attributes: [
          "a_application_login_id",
          "attendance_status",
          "check_in_out_date_time"
        ],
        order: [
          ["a_application_login_id", "ASC"],
          ["check_in_out_date_time", "DESC"]
        ],
        raw: true
      });
      const attendanceMap = {};

      for (const record of latestAttendance) {
        if (!attendanceMap[record.a_application_login_id]) {
          attendanceMap[record.a_application_login_id] = record;
        }
      }
      console.log("Users:", result.length);
      console.log("User IDs:", userIds);
      console.log("Attendance Model:", attendanceModels);

      const enrichedResult = result.map((user, index) => {
        const matchingFlag = findcompanyFlag.find(
          (flag) => flag.a_application_login_id === user.id
        );
        const attendance = attendanceMap[user.id];
        return {
          ...user.toJSON(),
          company_flag: matchingFlag ? matchingFlag.company_flag : null,
          attendance_status: attendance ? attendance.attendance_status : null,
          created_date_time: formatDateAndTimeCreateDateTime(
            user.dataValues.created_date_time
          ),
          profile_pic: user.dataValues.profile_pic
            ? APPLICATION_LOGIN_PROFILE_IMG_LINK_EXTENDED +
            user.dataValues.profile_pic
            : "",
        };
      });

      return resSuccess({
        data: { item: enrichedResult },
      });
    } else {
      return resError({
        ack_msg: "Recode not found",
        developer_msg: "There is no Data in database ",
      });
    }
  } catch (e) {
    console.error("ERROR IN getByIdTeam:", e);
    return resBadRequest({ developer_msg: e });
    throw e;
  }
};

export const getTeamChainWise = async (req, res) => {
  try {
    const { a_application_login_id, searchTerm = "" } = req.body;

    // Step 1️⃣: Get company and flag info
    const findAllApplicationLogin = await getCompanyByLoginId(a_application_login_id);

    if (!findAllApplicationLogin) {
      return resError({
        ack_msg: "Record not found",
        developer_msg: "No data found for provided login ID",
      });
    }

    const { company_masters_id, company_flag } = findAllApplicationLogin;

    let targetCompanyIds = [company_masters_id];
    if (company_masters_id) {
      const companyRecord = await companyModel.findOne({
        where: { id: company_masters_id, isDelete: 0 },
        attributes: ["id", "parent_company_id"]
      });

      if (companyRecord) {
        const isMainCompany =
          companyRecord.dataValues.parent_company_id === null ||
          companyRecord.dataValues.parent_company_id === undefined;

        if (isMainCompany) {
          // Main company login: show all team members belonging to main company and its sub-workspaces
          const sisterWorkspaces = await companyModel.findAll({
            where: {
              [Op.or]: [
                { id: company_masters_id },
                { parent_company_id: company_masters_id }
              ],
              isDelete: 0
            },
            attributes: ["id"],
            raw: true
          });

          if (sisterWorkspaces && sisterWorkspaces.length > 0) {
            targetCompanyIds = sisterWorkspaces.map((w) => w.id);
          }
        } else {
          // Workspace login: show ONLY team members assigned to this specific workspace
          targetCompanyIds = [company_masters_id];
        }
      }
    }

    let teamMembers = [];
    let companyUsers = [];
    // Step 1 for non-flag: First, get all company user IDs from companyVsApplicationLoginModel
    if (company_flag == 1) {
      companyUsers = await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: 0,
          company_masters_id: { [Op.in]: targetCompanyIds },
        },
        attributes: ["a_application_login_id"],
      });
    } else {
      companyUsers = await companyVsApplicationLoginModel.findAll({
        where: {
          isDelete: "0",
          a_application_login_id: a_application_login_id,
        },
        attributes: ["a_application_login_id"],
      });
    }

    const allUserIdsInCompany = companyUsers.map((u) => u.a_application_login_id);
    if (company_flag == 1) {

      teamMembers = await loginModel.findAll({
        where: {
          isDelete: "0",
          username: { [Op.like]: `%${searchTerm}%` },
          id: { [Op.in]: allUserIdsInCompany },
        },
        attributes: ["id", "username", "created_date_time"],
      });
    } else {
      teamMembers = await loginModel.findAll({
        where: {
          isDelete: "0",
          username: { [Op.like]: `%${searchTerm}%` },
          [Op.and]: [
            {
              [Op.or]: [
                { reporting_member: { [Op.in]: allUserIdsInCompany } },
                { id: a_application_login_id }
              ]
            }
          ]
        },
        attributes: ["id", "username", "created_date_time"],
      });
    }

    if (!teamMembers || teamMembers.length === 0) {
      return resError({
        ack_msg: "No team members found",
        developer_msg: "No matching records found in loginModel",
      });
    }

    // Step X️⃣: Return direct usernames (subordinates or self)
    const enrichedResult = teamMembers.map((user) => ({
      id: user.id,
      username: user.username,
      created_date_time: formatDateAndTimeCreateDateTime(user.created_date_time),
    }));

    // Step Y️⃣: Return success
    return resSuccess({
      data: { item: enrichedResult },
    });
  } catch (e) {
    console.error(e);
    return resBadRequest({ developer_msg: e.message || e });
  }
};

export const removeFromTeamList = async (req) => {
  try {
    const { id, company_masters_id, isDelete = "1" } = req.body;
    const updateResult = await companyVsApplicationLoginModel.update(
      { isDelete },
      {
        where: {
          company_masters_id,
          a_application_login_id: id,
        },
      }
    );
    if (!updateResult || updateResult[0] === 0) {
      return resError({
        ack_msg: "Record not found",
        developer_msg: "No matching entry in company_vs_application_logins",
      });
    }
    const removedUser = await loginModel.findOne({
      where: { id, isDelete: 0 },
      attributes: ["username"],
      raw: true,
    });
    // Step 3: Get remaining team members in the same company
    const companyMembers = await companyVsApplicationLoginModel.findAll({
      where: {
        company_masters_id,
        isDelete: 0,
      },
      attributes: ["a_application_login_id", "company_flag"],
      raw: true,
    });

    const loginIds = companyMembers.map((m) => m.a_application_login_id);

    // Step 4: Get tokens for notifications
    const tokenData = await loginModel.findAll({
      where: {
        id: loginIds,
        isDelete: 0,
      },
      attributes: [
        "android_refresh_token",
        "web_refresh_token",
        "ios_refresh_token",
      ],
      raw: true,
    });

    const tokens = tokenData
      .flatMap(
        ({ android_refresh_token, web_refresh_token, ios_refresh_token }) => [
          android_refresh_token,
          web_refresh_token,
          ios_refresh_token,
        ]
      )
      .filter((token) => token && token.trim() !== "");

    if (tokens.length > 0) {
      try {
        await sendMultipleNotification({
          deviceTokens: tokens,
          title: `removed from the team.`,
          body: `${removedUser.username} has been removed from the team.`,
        });
      } catch (notificationError) {
        logger.error("Notification failed:", notificationError.message);
      }
    } else {
      logger.info("No device tokens found for remaining members.");
    }

    return resSuccess({
      data: updateResult,
      msg: "User removed and notification sent.",
    });
  } catch (e) {
    logger.error("❌ Error in removeFromTeamList:", e.message);
    return resBadRequest();
  }
};

export const companyLeave = async (req) => {
  try {
  } catch (e) {
    return resBadRequest();
    throw e;
  }
};

export const companyPlanVsStatistics = async (req) => {
  try {
    const { a_application_login_id, plan_id } = req.body;

    const findCompany = await getCompanyByLoginId(a_application_login_id);
    const INqModel = inquiryModel(req.tenantDB);
    const PRTModel = productModel(req.tenantDB);
    const contactMsgModel = contactMessageHistory(req.tenantDB);
    // const planVsPageModel = companyVsPlansModel(req.tenantDB);

    const CATModel = cartModel(req.tenantDB);
    const COTModel = contactModel(req.tenantDB);

    const findOwnerDetails = await companyVsApplicationLoginModel.findOne({
      where: {
        company_masters_id: findCompany.company_masters_id,
        company_flag: 1,
        isDelete: 0,
      },
      attributes: ["company_masters_id", "company_flag", "a_application_login_id"]
    });
    console.log("findOwnerDetailsfindOwnerDetailsfindOwnerDetails", findOwnerDetails);

    if (findCompany.ack === 0) {
      return resError({
        ack_msg: "something went wrong",
        developer_msg:
          "application login is not there or company id is not there ",
      });
    }
    const findCountTeamMember = await companyVsApplicationLoginModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        company_flag: 2,
        isDelete: 0,
      },
    });
    const findCountContacts = await COTModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
      },
    });

    const findCountInquiry = await INqModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
      },
    });
    const findCountTotalEMail = await contactMsgModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
        entry_flag: 2,
      },
    });
    const findCountTotalSalesOrder = await CATModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
        type: 2,
      },
    });
    const findCountTotalProduct = await PRTModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
      },
    });

    const findCountTotalQuotation = await CATModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
        type: 1,
      },
    });
    const findCountTotalPurchaseInvoice = await CATModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
        type: 4,
      },
    });
    const findCountTotalSalesInvoice = await CATModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
        type: 3,
      },
    });
    const findCountTotalSalesB2bPortalInquiry = await INqModel.count({
      where: {
        company_masters_id: findCompany.company_masters_id,
        isDelete: 0,
        source_type_id: -3,
      },
    });
    const requiredPageIds = [
      PAGE_ID.CONTACT,
      PAGE_ID.INQUIRY,
      PAGE_ID.QUOTATION,
      PAGE_ID.ORDER,
      PAGE_ID.INVOICE,
      PAGE_ID.PURCHASE,
      PAGE_ID.EMAIL,
      PAGE_ID.PRODUCT,
      PAGE_ID.TEAM_MEMBER_ACESSES,
    ];
    const applicationLoginTypeRightModelInstance =
      applicationLoginTypeRightModel(req.tenantDB);

    const rightsData =
      await applicationLoginTypeRightModelInstance.findAll({
        where: {
          company_masters_id:
            findOwnerDetails.company_masters_id,

          a_application_login_id:
            findOwnerDetails.a_application_login_id,

          page_id: {
            [Op.in]: requiredPageIds,
          },

          isDelete: 0,
        },

        attributes: [
          "page_id",
          "a_page_id_rights_jason",
        ],

        raw: true,
      });
    console.log("zzxxxxxxxxxxxxzzzzzzzz", rightsData);

    const limitsMap = {};

    rightsData.forEach((item) => {

      let limitValue = "Unlimited";

      try {

        const rightsJson = JSON.parse(
          item.a_page_id_rights_jason || "{}"
        );

        limitValue =
          !isNaN(rightsJson.limit) &&
            rightsJson.limit !== ""
            ? Number(rightsJson.limit)
            : rightsJson.limit || "Unlimited";

      } catch (e) {

        limitValue = "Unlimited";
      }

      limitsMap[item.page_id] = limitValue;
    });

    return resSuccess({
      data: {
        item: {
          teamMembers: findCountTeamMember,
          contacts: findCountContacts,
          inquiries: findCountInquiry,
          totalEmails: findCountTotalEMail,
          totalSalesOrders: findCountTotalSalesOrder,
          totalProducts: findCountTotalProduct,
          totalQuotations: findCountTotalQuotation,
          totalPurchaseInvoices:
            findCountTotalPurchaseInvoice,
          totalSalesInvoices:
            findCountTotalSalesInvoice,
          totalSalesB2bPortalInquiries:
            findCountTotalSalesB2bPortalInquiry,

          // ── LIMITS ─────────────────────
          planContactDataLimit:
            limitsMap[PAGE_ID.CONTACT] ||
            "Unlimited",

          planTeamMembersDataLimit:
            limitsMap[
            PAGE_ID.TEAM_MEMBER_ACESSES
            ] || "Unlimited",

          PlanInquiriesDataLimit:
            limitsMap[PAGE_ID.INQUIRY] ||
            "Unlimited",

          PlanEmailDataLimit:
            limitsMap[PAGE_ID.EMAIL] ||
            "Unlimited",

          PlanSalesOrdersDataLimit:
            limitsMap[PAGE_ID.ORDER] ||
            "Unlimited",

          PlanProductsDataLimit:
            limitsMap[PAGE_ID.PRODUCT] ||
            "Unlimited",

          PlanQuotationsDataLimit:
            limitsMap[PAGE_ID.QUOTATION] ||
            "Unlimited",

          PlanPurchaseInvoicesDataLimit:
            limitsMap[PAGE_ID.PURCHASE] ||
            "Unlimited",

          PlanSalesInvoicesDataLimit:
            limitsMap[PAGE_ID.INVOICE] ||
            "Unlimited",

          PlanSalesB2bPortalInquiriesDataLimit:
            "Unlimited",
        },
      },
    });
  } catch (error) {
    // await t.rollback();
    console.log("Error fetching data", error);

    return resBadRequest({
      ack_msg: "Error fetching data",
      developer_msg: error,
    });
  }
};

export const deactivateTearmPerson = async (req) => {
  try {
    const { id, company_masters_id, f } = req.body;
    if (!isValid(f)) {
      return resError({
        ack_msg: "Something went wrong",
        developer_msg: "f is not difined",
      });
    }
    let updateValue;
    let updateMsg;
    if (f == 1) {
      updateValue = 0;
      updateMsg = "deactivated";
    } else if (f == 2) {
      updateValue = 1;
      updateMsg = "activated";
    }
    const updateResult = await companyVsApplicationLoginModel.update(
      { isActive: updateValue },
      {
        where: {
          company_masters_id,
          a_application_login_id: id,
        },
      }
    );
    if (!updateResult || updateResult[0] === 0) {
      return resError({
        ack_msg: "Record not found",
        developer_msg: "No matching entry in company_vs_application_logins",
      });
    }
    const updateTeam = await loginModel.update({ isActive: updateValue }, { where: { id } });
    if (updateTeam) {
      return resSuccess({
        ack_msg: `Team Member ${updateMsg} successfully.`,
      });
    }
    return resError({
      ack_msg: "Record not found",
      developer_msg: "No matching entry in company_vs_application_logins",
    });
  } catch (error) {
    console.log("deactivateTearmPerson Error", error)
    return resBadRequest({
      ack_msg: "Error fetching data",
      developer_msg: error,
    });
  }
}