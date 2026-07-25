import moment from "moment";
import { getTenantDB } from "../../config/dbManager.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import applicationPagesModel from "../../models/application_login/applicationPagesModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import planVsPageModel from "../../models/configuration/planVsPageModel.js";
import logger from "../../utils/logger.js";
import {
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";
import {
  getCompanyByLoginId
} from "../commonServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

export const AddTeamRights = async (req, res) => {
  const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

  try {
    const { permissionsData, a_application_login_id } = req.body;
    // Validate input
    if (!a_application_login_id || !permissionsData || !Array.isArray(permissionsData)) {
      return resBadRequest({ developer_msg: "Invalid input: a_application_login_id and permissionsData array are required" });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ developer_msg: "Company not found for the provided login ID" });
    }

    const permissionNames = [];
    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);

    const upsertPromises = permissionsData.map(async (permission) => {

      if (!permission.page_id || !permission.a_page_id_rights_jason) {
        throw new Error("Invalid permission data: page_id and a_page_id_rights_jason are required");
      }

      // Case 1: Agar modual_name hai
      if (permission.modual_name) {
        permissionNames.push(permission.modual_name);

        let parsedRights = permission.a_page_id_rights_jason;
        if (typeof parsedRights === "string") {
          try {
            parsedRights = JSON.parse(parsedRights);
          } catch (e) { }
        }

        return applicationLoginTypeRightModelIntance.upsert({
          page_id: permission.page_id,
          modual_name: permission.modual_name,
          a_page_id_rights_jason: parsedRights,
          a_application_login_id: Number(a_application_login_id),
          company_masters_id: findCompanyId.company_masters_id,
          created_date_time: formattedDateTime,
        });
      }
      // Case 2: Agar page_name hai
      // else if (permission.page_name) {
      //   permissionNames.push(permission.page_name);

      //   return applicationLoginTypeRightModelIntance.upsert({
      //     page_id: permission.page_id,
      //     page_name: permission.page_name,
      //     a_page_id_rights_jason: JSON.stringify(permission.a_page_id_rights_jason),
      //     a_application_login_id: Number(a_application_login_id),
      //     company_masters_id: findCompanyId.company_masters_id,
      //     created_date_time: formattedDateTime,
      //   });
      // }
      // else {
      //   console.log("rights not Apply");
      // }
    });
    // Execute all upserts concurrently
    const results = await Promise.all(upsertPromises);
    if (results.length === 0) {
      return resError({ developer_msg: "No permissions were processed" });
    }
    // Fetch user token data for notifications
    const userTokenData = await loginModel.findOne({
      where: { id: a_application_login_id, isDelete: 0 },
      attributes: ['web_refresh_token', 'android_refresh_token', 'ios_refresh_token', 'username'],
    });
    if (userTokenData) {
      const uniqueTokens = [
        userTokenData.web_refresh_token,
        userTokenData.android_refresh_token,
        userTokenData.ios_refresh_token,
      ].filter((token) => token && token.trim() !== '');

      if (uniqueTokens.length > 0) {
        try {
          const notificationBody =
            permissionNames.length > 0
              ? `New rights added: ${permissionNames.join(', ')}`
              : 'New team rights have been assigned to you.';
          await sendMultipleNotification({
            deviceTokens: uniqueTokens,
            title: `There are some changes in your rights, Please Check`,
            body: "",
          });
        } catch (notificationError) {
          logger.error('Notification failed (non-critical):', notificationError.message);
          // Non-critical error, proceed with success response
        }
      } else {
        logger.info('No valid device tokens found for the user.');
      }
    } else {
      logger.info(`No active user found for a_application_login_id: ${a_application_login_id}`);
    }

    return resSuccess({
      ack_msg: "Team rights updated successfully",
      developer_msg: "Team rights updated successfully",
    });
  } catch (error) {
    console.error("Error updating team rights:", error);
    return resBadRequest({ developer_msg: error.message });
  }
};

// export const AddTeamRights = async (req, res) => {
//   const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

//   try {
//     const { permissionsData, a_application_login_id } = req.body;


//     if (!a_application_login_id || !permissionsData || !Array.isArray(permissionsData)) {
//       return resBadRequest({
//         developer_msg: "Invalid input: a_application_login_id and permissionsData array are required",
//       });
//     }

//     const findCompanyId = await getCompanyByLoginId(a_application_login_id);
//     if (!findCompanyId?.company_masters_id) {
//       return resBadRequest({
//         developer_msg: "Company not found for the provided login ID",
//       });
//     }

//     const permissionNames = [];


//     const processPromises = permissionsData.map(async (permission) => {
//       if (!permission.page_id || !permission.page_name || !permission.a_page_id_rights_jason) {
//         throw new Error("Invalid permission data: page_id, page_name, and a_page_id_rights_jason are required");
//       }

//       permissionNames.push(permission.page_name);

//       const existingRecord = await applicationLoginTypeRightModel.findOne({
//         where: {
//           page_id: permission.page_id,
//           a_application_login_id: Number(a_application_login_id),
//           company_masters_id: findCompanyId.company_masters_id,
//           isDelete: 0,
//         },
//       });

//       if (existingRecord) {
//         return await applicationLoginTypeRightModel.update(
//           {
//             a_page_id_rights_jason: permission.a_page_id_rights_jason,
//           },
//           {
//             where: {
//               id: existingRecord.id,
//             },
//           }
//         );
//       } else {

//         return await applicationLoginTypeRightModel.create({
//           page_id: permission.page_id,
//           page_name: permission.page_name,
//           a_page_id_rights_jason: permission.a_page_id_rights_jason,
//           a_application_login_id: Number(a_application_login_id),
//           company_masters_id: findCompanyId.company_masters_id,

//         });
//       }
//     });


//     const results = await Promise.all(processPromises);
//     if (results.length === 0) {
//       return resError({ developer_msg: "No permissions were processed" });
//     }


//     const userTokenData = await loginModel.findOne({
//       where: { id: a_application_login_id, isDelete: 0 },
//       attributes: ["web_refresh_token", "android_refresh_token", "ios_refresh_token", "username"],
//     });

//     if (userTokenData) {
//       const uniqueTokens = [
//         userTokenData.web_refresh_token,
//         userTokenData.android_refresh_token,
//         userTokenData.ios_refresh_token,
//       ].filter((token) => token && token.trim() !== "");

//       if (uniqueTokens.length > 0) {
//         try {
//           const notificationBody =
//             permissionNames.length > 0
//               ? `New rights added/updated: ${permissionNames.join(", ")}`
//               : "Your team rights have been modified.";

//           await sendMultipleNotification({
//             deviceTokens: uniqueTokens,
//             title: "There are some changes in your rights, Please check",
//             body: notificationBody,
//           });
//         } catch (notificationError) {
//           logger.error("Notification failed (non-critical):", notificationError.message);
//         }
//       } else {
//         logger.info("No valid device tokens found for the user.");
//       }
//     } else {
//       logger.info(`No active user found for a_application_login_id: ${a_application_login_id}`);
//     }

//     return resSuccess({
//       ack_msg: "Team rights updated successfully",
//       developer_msg: "Team rights updated successfully",
//     });
//   } catch (error) {
//     logger.error("Error updating team rights:", error.message);
//     return resBadRequest({ developer_msg: error.message });
//   }
// };

export const getTeamRights = async (req, res) => {
  const { a_application_login_id } = req.body;

  try {
    // Use the active workspace companyId from JWT (req.user.companyId) if present
    // so rights are fetched from the correct child workspace, not the parent.
    // Fall back to getCompanyByLoginId for backward compatibility.
    let activeCompanyId = req.user?.companyId || null;
    let planCompanyId = activeCompanyId;

    if (!planCompanyId) {
      const findCompanyId = await getCompanyByLoginId(a_application_login_id);
      planCompanyId = findCompanyId.company_masters_id;
    }

    // Resolve plan from the active company. If it is a child workspace,
    // its plan_id may be 0 (inherited), so fall back to the parent company.
    let companyRecord = await companyModel.findOne({
      where: { id: planCompanyId, isDelete: 0 },
      attributes: ["id", "plan_id", "parent_company_id", "a_application_login_id", "plan_date", "plan_expiry_date"],
    });

    // If the workspace has no plan (plan_id = 0), inherit from the parent company
    if (companyRecord && (companyRecord.dataValues.plan_id === 0 || !companyRecord.dataValues.plan_id) && companyRecord.dataValues.parent_company_id) {
      const parentRecord = await companyModel.findOne({
        where: { id: companyRecord.dataValues.parent_company_id, isDelete: 0 },
        attributes: ["id", "plan_id", "a_application_login_id", "plan_date", "plan_expiry_date"],
      });
      if (parentRecord) companyRecord = parentRecord;
    }

    const findPageIdFromPlanVsPages = await planVsPageModel.findAll({
      where: {
        plan_id: companyRecord.dataValues.plan_id,
        isDelete: 0,
      },
    });

    const result = findPageIdFromPlanVsPages.map(
      (item) => item.dataValues.page_id
    );

    const resultApplicationPage = await applicationPagesModel.findAll({
      where: { isDelete: 0, id: result, isRights: 1 },
    });

    if (!resultApplicationPage) {
      return resError({
        developer_msg: "error",
      });
    }

    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    let resultAppLoginRights = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        isDelete: 0,
        a_application_login_id: a_application_login_id,
        company_masters_id: planCompanyId,
      },
    });

    // Auto-repair: if this is a workspace (has a parent) and the user has no rights
    // in the child tenant DB, copy rights from the parent tenant DB automatically.
    // This fixes existing workspaces created before the rights-copy logic was added.
    if (resultAppLoginRights.length === 0 && req.user?.companyId) {
      try {
        const childCompanyInfo = await companyModel.findOne({
          where: { id: planCompanyId, isDelete: 0 },
          attributes: ["parent_company_id"]
        });
        const parentCompanyId = childCompanyInfo?.dataValues?.parent_company_id;

        if (parentCompanyId) {
          // Verify the user has access to the parent (owner or member)
          const parentMapping = await companyVsApplicationLoginModel.findOne({
            where: { a_application_login_id, company_masters_id: parentCompanyId, isDelete: 0 }
          });

          if (parentMapping) {
            const formattedDateTime = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
            const parentTenantInfo = await getTenantDB(a_application_login_id, parentCompanyId);
            const parentRightsModel = applicationLoginTypeRightModel(parentTenantInfo.sequelize);

            const parentRights = await parentRightsModel.findAll({
              where: { a_application_login_id, company_masters_id: parentCompanyId, isDelete: 0 }
            });

            if (parentRights && parentRights.length > 0) {
              const rightsToInsert = parentRights.map(right => {
                const { id, ...data } = right.dataValues;
                let parsedRights = data.a_page_id_rights_jason;
                if (typeof parsedRights === "string") {
                  try {
                    parsedRights = JSON.parse(parsedRights);
                    if (typeof parsedRights === "string") {
                      parsedRights = JSON.parse(parsedRights);
                    }
                  } catch (e) { }
                }
                return { ...data, a_page_id_rights_jason: parsedRights, company_masters_id: planCompanyId, created_date_time: formattedDateTime };
              });
              await applicationLoginTypeRightModelIntance.bulkCreate(rightsToInsert, { ignoreDuplicates: true });
              // Re-fetch after copy
              resultAppLoginRights = await applicationLoginTypeRightModelIntance.findAll({
                where: { isDelete: 0, a_application_login_id, company_masters_id: planCompanyId },
              });
              console.log(`[getTeamRights] Auto-repaired ${rightsToInsert.length} rights for user ${a_application_login_id} in workspace ${planCompanyId}`);
            }
          }
        }
      } catch (repairErr) {
        console.error("[getTeamRights] Auto-repair of workspace rights failed:", repairErr.message);
      }
    }

    const mergedResult =
      resultApplicationPage &&
      resultApplicationPage.map((page) => {
        const matchingRights = resultAppLoginRights.find(
          (right) => right.dataValues.page_id === page.dataValues.id
        );

        return {
          ...page.toJSON(),
          ...(matchingRights
            ? matchingRights.dataValues
            : { page_id: page.dataValues.id }),
        };
      });

    if (resultAppLoginRights) {
      return resSuccess({
        data: { item: mergedResult },
      });
    } else {
      return resError({
        developer_msg: "error",
      });
    }
  } catch (error) {
    resBadRequest({ developer_msg: `e ${error}` });
  }
};
