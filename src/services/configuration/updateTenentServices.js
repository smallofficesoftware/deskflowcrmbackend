import express from "express";
import fs from "fs-extra";
import moment from "moment";
import path from "path";
import { Op, Sequelize } from "sequelize";
import { dbConfig } from "../../config/sequelize.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import applicationPagesModel from "../../models/application_login/applicationPagesModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import planVsPageModel from "../../models/configuration/planVsPageModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import {
  TENANT_DB_HOST_NAME,
  TENANT_DB_PASSWORD,
  TENANT_DB_USER_NAME
} from "../../utils/appConstants.js";
import {
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";

const router = express.Router();

const readFileIfExists = async (filePath) => {
  try {
    return (await fs.pathExists(filePath)) ? filePath : null;
  } catch (err) {
    console.error("❌ File check error:", err);
    return null;
  }
};

export const updateTenent = async (req, res) => {
  try {
    const tenantList = await tenantMasterModel.findAll({
      where: { isDelete: 0 },
      attributes: [
        "db_host",
        "db_user",
        "db_password",
        "db_name",
        "application_login_name",
        "a_application_login_id",
        "company_masters_id",
      ],
    });

    if (!tenantList.length) {
      return resBadRequest({ developer_msg: "No tenants found" });
    }

    const successResults = [];
    const errorResults = [];
    const errorMessages = [];

    await executeSQLFile(
      'smalloffice_sample_tenant',
      "update-tenant.sql",
      -1,
      -1,
      "System"
    );

    for (const tenant of tenantList) {
      const dbName = `small_office_a${tenant.a_application_login_id}_c${tenant.company_masters_id}`;

      const result = await executeSQLFile(
        dbName,
        "update-tenant.sql",
        tenant.a_application_login_id,
        tenant.company_masters_id,
        tenant.application_login_name
      );

      if (result.status === "success") {
        const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");

        await updateTenantVersionDateTime(
          tenant.a_application_login_id,
          tenant.company_masters_id,
          currentTime
        );

        successResults.push({
          dbName,
          message: "SQL executed successfully",
        });
      } else {
        const errMsg = result.error;
        errorResults.push({
          dbName,
          Errormessage: errMsg,
        });
        errorMessages.push(errMsg);
      }
    }

    const responseData = {};
    responseData.databaseRecords = tenantList.length;
    responseData.executedDatabaseRecords = successResults.length;
    responseData.failedDatabaseRecords = errorResults.length;

    if (
      errorResults.length &&
      errorResults.length === tenantList.length &&
      new Set(errorMessages).size === 1
    ) {
      responseData.CommonErrors = [errorMessages[0]];
    } else if (errorResults.length) {
      responseData.Errors = errorResults;
    }

    responseData.Success = successResults;

    return resSuccess({
      message: "✅ All tenant databases processed.",
      data: responseData,
    });
  } catch (error) {
    return resError(res, "Failed to update tenants", error);
  }
};

const updateTenantVersionDateTime = async (
  applicationId,
  companyId,
  currentTime
) => {
  try {
    console.log(
      `🔍 Attempting to update version_update_date_time for Tenant: ${applicationId}-${companyId}`
    );

    const [updatedCount] = await tenantMasterModel.update(
      {
        version_update_date_time: currentTime,
      },
      {
        where: {
          a_application_login_id: applicationId,
          company_masters_id: companyId,
        },
      }
    );

    if (updatedCount === 0) {
      console.error(
        `❌ Tenant ${applicationId}-${companyId} not found or already up-to-date.`
      );
    } else {
      console.log(
        `✅ Tenant ${applicationId}-${companyId} version_update_date_time updated to ${currentTime}.`
      );
    }
  } catch (error) {
    console.error("❌ Error updating tenant version update date:", error);
  }
};

const executeSQLFile = async (
  dbName,
  sqlFileName,
  applicationId,
  companyId,
  application_login_name
) => {
  try {
    const filePath = path.join(
      process.cwd(),
      "tenant-version",
      sqlFileName
    );
    console.log("🔍 Checking SQL file path:", filePath);

    if (!(await fs.pathExists(filePath))) {
      throw new Error(`SQL file not found: ${filePath}`);
    }

    const mysqlSequelize = new Sequelize(
      dbName,
      dbConfig.USER,
      dbConfig.PASSWORD,
      {
        host: dbConfig.HOST,
        dialect: dbConfig.dialect,
        timezone: "+05:30",
        define: { timestamps: false },
        dialectOptions: { multipleStatements: true },
        logging: false,
      }
    );

    const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");

    let sql = await fs.readFile(filePath, "utf8");
    sql = sql
      .replace(/\$\{dbName\}/g, dbName)
      .replace(/\$\{applicationId\}/g, applicationId)
      .replace(/\$\{companyId\}/g, companyId)
      .replace(/\$\{applicationName\}/g, application_login_name)
      .replace(/\$\{dbHost\}/g, TENANT_DB_HOST_NAME)
      .replace(/\$\{dbUser\}/g, TENANT_DB_USER_NAME)
      .replace(/\$\{dbPassword\}/g, TENANT_DB_PASSWORD)
      .replace(/\$\{createDateTime\}/g, currentTime);

    console.log(`🚀 Executing SQL for ${dbName}`);

    const [results, metadata] = await mysqlSequelize.query(sql);

    await mysqlSequelize.close();

    if (results && results.length > 0) {
      console.log(`✅ Data retrieved from '${dbName}' database.`);
    } else {
      console.log(
        `⚠️ No data found in '${dbName}'. SQL executed successfully, but no rows returned.`
      );
    }

    return { status: "success", data: results };
  } catch (error) {
    console.error("❌ SQL Execution Error:", error);
    return {
      status: "error",
      error: error.message,
      sqlMessage: error?.sqlMessage || null,
    };
  }
};

// Adjust path to your response handlers

export const pageVsplan = async (req, res) => {
  const transaction = await companyModel.sequelize.transaction();
  try {
    const compnayIds = req.params.companyIds;

    let whereCondition = { isDelete: 0 };

    if (compnayIds) {
      const companyIdsArray = compnayIds.split(",");
      whereCondition.id = companyIdsArray;
    }

    const companyMasters = await companyModel.findAll({
      where: whereCondition,
      attributes: ['id', 'a_application_login_id', 'plan_id'],
      transaction,
    });

    if (!companyMasters || companyMasters.length === 0) {
      await transaction.rollback();
      return resError({
        ack_msg: 'No companies found with isDelete: 0',
      });
    }

    const companyIds = companyMasters.map((company) => company.id);

    const companyAll = await companyVsApplicationLoginModel.findAll({
      where: { isDelete: 0, company_masters_id: { [Op.in]: companyIds } },
      attributes: ['a_application_login_id', 'company_masters_id', 'company_flag'],
      transaction,
    });

    if (!companyAll || companyAll.length === 0) {
      await transaction.rollback();
      return resError({
        ack_msg: 'No application login IDs found for any companies',
      });
    }

    const allPages = await applicationPagesModel.findAll({
      attributes: ['id', 'page_name'],
      transaction,
    });

    const planIds = [...new Set(companyMasters.map((company) => company.plan_id))];

    const planPages = await planVsPageModel.findAll({
      where: { isDelete: 0, plan_id: { [Op.in]: planIds } },
      attributes: ['plan_id', 'page_id', 'data_limit'],
      transaction,
    });

    const planPagesMap = new Map();
    for (const planPage of planPages) {
      if (!planPagesMap.has(planPage.plan_id)) {
        planPagesMap.set(planPage.plan_id, new Map());
      }
      planPagesMap.get(planPage.plan_id).set(planPage.page_id, planPage.data_limit);
    }

    const upsertPages = [];

    //GROUP BY company_masters_id
    const uniqueCompanyIds = [...new Set(companyAll.map(c => c.company_masters_id))];

    for (const companyId of uniqueCompanyIds) {

      // Get all users of this company
      const usersOfCompany = companyAll.filter(
        c => c.company_masters_id === companyId
      );

      if (usersOfCompany.length === 0) continue;

      const anyLoginId = usersOfCompany[0].a_application_login_id;


      req.headers["x-tenant-id"] = anyLoginId;

      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }


      if (!req.tenantDB) {
        await transaction.rollback();
        return resError(res, { ack_msg: "Tenant DB not initialized" });
      }

      const applicationLoginRightsModelsInstance =
        applicationLoginTypeRightModel(req.tenantDB);

      const existingPageRights = await applicationLoginRightsModelsInstance.findAll({
        where: { company_masters_id: companyId },
        attributes: ['company_masters_id', 'a_application_login_id', 'page_id']
      });

      const existingPageRightsMap = new Map();
      for (const right of existingPageRights) {
        const key = `${right.company_masters_id}-${right.a_application_login_id}`;
        if (!existingPageRightsMap.has(key)) {
          existingPageRightsMap.set(key, new Set());
        }
        existingPageRightsMap.get(key).add(right.page_id);
      }

      const companyData = companyMasters.find(c => c.id === companyId);
      const planId = companyData?.plan_id;

      if (!planId) continue;

      const validPageIds = planPagesMap.get(planId) || new Map();

      // Loop all users of this company
      for (const company of usersOfCompany) {
        const { company_masters_id, a_application_login_id, company_flag } = company;

        const key = `${company_masters_id}-${a_application_login_id}`;
        const existingPageIds = existingPageRightsMap.get(key) || new Set();

        for (const page of allPages) {
          if (validPageIds.has(page.id) && !existingPageIds.has(page.id)) {

            const dataLimit = validPageIds.get(page.id) || 0;

            const pageRights = company_flag === 1
              ? {
                view: 1,
                add: 1,
                edit: 1,
                delete: 1,
                approve: 1,
                import: 1,
                print: 1,
                share: 1,
                all_data: 1,
                personal: 0,
                limit: dataLimit,
              }
              : {
                view: 1,
                add: 1,
                edit: 1,
                delete: 0,
                approve: 0,
                import: 1,
                print: 1,
                share: 1,
                all_data: 0,
                personal: 1,
                limit: dataLimit,
              };

            upsertPages.push({
              a_application_login_id,
              company_masters_id,
              page_id: page.id,
              page_name: page.page_name,
              a_page_id_rights_jason: pageRights,
              created_date_time: new Date(),
            });
          }
        }
      }

      if (upsertPages.length > 0) {
        await applicationLoginRightsModelsInstance.bulkCreate(upsertPages, {
          updateOnDuplicate: ['page_name', 'a_page_id_rights_jason', 'created_date_time']
        });
      }
    }

    await transaction.commit();

    return resSuccess({
      ack_msg:
        upsertPages.length > 0
          ? 'New page rights upserted successfully.'
          : 'No new pages to upsert.',
      data: upsertPages,
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error in pageVsplan:', error);

    if (error.message.includes('Too many connections')) {
      return resError({
        ack_msg: 'Database connection limit reached',
        developer_msg:
          'Too many database connections. Please try again later or contact the administrator.',
      });
    }

    return resError({
      ack_msg: 'Unexpected error',
      developer_msg: error.message,
    });
  }
};




export default router;


