import { requestContext } from "../config/context.js";
import { getTenantDB } from "../config/dbManager.js";
import { globalSequelize } from "../config/globalSequelize.js";
import sequelize from "../config/sequelize.js";
import companyModel from "../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../models/company_setup/companyVsApplicationLoginModel.js";
import logger from "../utils/logger.js";
import { parseSession, resError } from "../utils/sharedFunctions.js";

export const tenantMiddleware = async (req, res, next) => {
  try {
    // Extract from sessionName (e.g. a3055_c606 used in WhatsApp webhooks)
    const sessionInfo = req.body?.sessionName ? parseSession(req.body.sessionName) : null;

    let tenantId =
      req.headers["x-tenant-id"] ||
      req.user?.id ||
      req.user?.a_application_login_id ||
      req.headers["x-application-login-id"] ||
      sessionInfo?.a_application_login_id ||
      req.body?.a_application_login_id ||
      req.query?.a_application_login_id;

    let companyId =
      req.user?.companyId ||
      req.headers["x-company-id"] ||
      sessionInfo?.company_masters_id ||
      req.body?.company_masters_id ||
      req.body?.company_id ||
      req.query?.company_masters_id ||
      req.query?.company_id;

    // If companyCode is in params or body, resolve company & tenant
    const companyCode = req.params?.companyCode || req.body?.companyCode;
    if (companyCode && (!companyId || !tenantId)) {
      const companyGet = await companyModel.findOne({
        where: { qr_code: companyCode, isDelete: "0" },
        attributes: ["id", "a_application_login_id"],
      });
      if (companyGet) {
        companyId = companyId || companyGet.dataValues.id;
        tenantId = tenantId || companyGet.dataValues.a_application_login_id;
      }
    }

    if (!tenantId) {
      // Fallback: if companyId is available, find tenantId from company_masters
      if (companyId) {
        const compOwner = await companyModel.findOne({
          where: { id: companyId, isDelete: "0" },
          attributes: ["a_application_login_id"],
        });
        if (compOwner?.dataValues?.a_application_login_id) {
          tenantId = compOwner.dataValues.a_application_login_id;
        }
      }
    }

    if (!tenantId) {
      if (res && typeof res.status === "function") {
        return res.status(400).json({ error: "Tenant ID is required" });
      }
      if (typeof next === "function") {
        return next(new Error("Tenant ID is required"));
      }
      throw new Error("Tenant ID is required");
    }

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

      // If still no mapping, check if user is the direct owner or exists in tenant_masters
      if (!mapping) {
        const isDirectOwner = await companyModel.findOne({
          where: { id: companyId, a_application_login_id: tenantId, isDelete: "0" },
          attributes: ["id"],
        });
        if (isDirectOwner) {
          mapping = isDirectOwner;
        } else {
          const tenantMasterExists = await globalSequelize.query(
            "SELECT id FROM tenant_masters WHERE company_masters_id = ? AND isDelete = 0 LIMIT 1",
            { replacements: [companyId], type: sequelize.QueryTypes.SELECT }
          );
          if (tenantMasterExists && tenantMasterExists.length > 0) {
            mapping = tenantMasterExists[0];
          }
        }
      }
    } else {
      // Fallback 1: use the latest mapped company from company_vs_application_logins
      const companyByLoginIdResult = await companyVsApplicationLoginModel.findOne({
        where: { a_application_login_id: tenantId, isDelete: 0 },
        attributes: ["company_masters_id"],
        order: [["id", "DESC"]],
      });
      if (companyByLoginIdResult) {
        companyId = companyByLoginIdResult.dataValues.company_masters_id;
        mapping = companyByLoginIdResult;
      } else {
        // Fallback 2: Check company_masters if tenant owns a company directly
        const ownedCompany = await companyModel.findOne({
          where: { a_application_login_id: tenantId, isDelete: "0" },
          attributes: ["id"],
          order: [["id", "DESC"]],
        });
        if (ownedCompany) {
          companyId = ownedCompany.dataValues.id;
          mapping = ownedCompany;
        } else {
          // Fallback 3: Check tenant_masters directly
          const [tenantRecord] = await globalSequelize.query(
            "SELECT company_masters_id FROM tenant_masters WHERE a_application_login_id = ? AND isDelete = 0 ORDER BY id DESC LIMIT 1",
            { replacements: [tenantId], type: sequelize.QueryTypes.SELECT }
          );
          if (tenantRecord?.company_masters_id) {
            companyId = tenantRecord.company_masters_id;
            mapping = tenantRecord;
          }
        }
      }
    }

    if (!companyId || !mapping) {
      if (res && typeof res.status === "function") {
        return res.status(400).json({ error: "Company is not found or access denied" });
      }
      if (typeof next === "function") {
        return next(new Error("Company is not found or access denied"));
      }
      throw new Error("Company is not found or access denied");
    }

    const tenantDBInfo = await getTenantDB(tenantId, companyId);
    req.tenantDB = tenantDBInfo.sequelize;
    req.models = tenantDBInfo.models;

    requestContext.run({ tenantDB: tenantDBInfo.sequelize, models: tenantDBInfo.models, companyId: Number(companyId), tenantId: tenantId, a_application_login_id: tenantId }, () => {
      next();
    });
  } catch (error) {
    console.error(error);
    logger.error(error);
    if (res && typeof res.status === "function") {
      return res.status(500).json(resError({
        ack_msg: "Tenant Error",
        developer_msg: error.message || error,
      }));
    }
    if (typeof next === "function") {
      return next(error);
    }
    throw error;
  }
};