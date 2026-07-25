import { requestContext } from "../config/context.js";
import { getTenantDB } from "../config/dbManager.js";
import sequelize from "../config/sequelize.js";
import companyVsApplicationLoginModel from "../models/company_setup/companyVsApplicationLoginModel.js";
import logger from "../utils/logger.js";
import { resError } from "../utils/sharedFunctions.js";

export const tenantMiddleware = async (req, res, next) => {
  try {
    const tenantId = req.headers["x-tenant-id"];
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant ID is required" });
    }

    let companyId = req.user?.companyId || req.headers["x-company-id"];
    let mapping = null;

    if (companyId) {
      // Check if user is mapped directly to the workspace/company
      mapping = await companyVsApplicationLoginModel.findOne({
        where: { a_application_login_id: tenantId, company_masters_id: companyId, isDelete: 0 },
        attributes: ["company_flag"],
      });

      // If not directly mapped, check if they belong to the parent company
      if (!mapping) {
        const [companyInfo] = await sequelize.query(
          "SELECT parent_company_id FROM company_masters WHERE id = ? AND isDelete = 0",
          { replacements: [companyId], type: sequelize.QueryTypes.SELECT }
        );
        if (companyInfo && companyInfo.parent_company_id) {
          mapping = await companyVsApplicationLoginModel.findOne({
            where: {
              a_application_login_id: tenantId,
              company_masters_id: companyInfo.parent_company_id,
              isDelete: 0
            },
            attributes: ["company_flag"],
          });
        }
      }
    } else {
      // Fallback: use the latest mapped company
      const companyByLoginIdResult = await companyVsApplicationLoginModel.findOne({
        where: { a_application_login_id: tenantId, isDelete: 0 },
        attributes: ["company_masters_id"],
        order: [["id", "DESC"]],
      });
      if (companyByLoginIdResult) {
        companyId = companyByLoginIdResult.dataValues.company_masters_id;
        mapping = companyByLoginIdResult;
      }
    }

    if (!companyId || !mapping) {
      return res.status(400).json({ error: "Company is not found or access denied" });
    }

    const tenantDBInfo = await getTenantDB(tenantId, companyId);
    req.tenantDB = tenantDBInfo.sequelize;
    req.models = tenantDBInfo.models;

    // if (res && typeof res.on === "function") {
    //   let closed = false;
    //   const cleanup = async (reasonLabel) => {
    //     if (closed) return;
    //     closed = true;
    //     const sequelize = req.tenantDB;
    //     if (!sequelize || typeof sequelize.close !== "function") {
    //       logger.warn(
    //         `[tenantMiddleware] No valid sequelize instance to close for tenantId=${tenantId}, companyId=${companyId}`
    //       );
    //       return;
    //     }
    //     try {
    //       await sequelize.close();
    //     } catch (closeErr) {
    //       logger.error(
    //         `[tenantMiddleware] Error closing Tenant DB connection for tenantId=${tenantId}, companyId=${companyId}: ${closeErr?.stack || closeErr}`
    //       );
    //     }
    //   };
    //   res.on("finish", () => cleanup("finish"));
    //   res.on("close", () => cleanup("close"));
    //   res.on("error", () => cleanup("error"));
    // }


    requestContext.run({ tenantDB: tenantDBInfo.sequelize, models: tenantDBInfo.models, companyId: Number(companyId) }, () => {
      next();
    });
  } catch (error) {
    console.error(error);
    logger.error(error);
    return res.status(500).json(resError({
      ack_msg: "Tenant Error",
      developer_msg: error.message || error,
    }));
  }
};