import moment from "moment";
import cron from "node-cron";
import { Op } from "sequelize";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import whatappDispatchJobs from "../../models/activities/whatappDispatchJobsModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import cronJobsModel from "../../models/configuration/cronJobsModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { EXTERNAL_CRONE_RUNNING_FLAG_VAR } from "../../utils/appConstants.js";
import logger from "../../utils/logger.js";
import { isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { clearDataWhatsappJobsTypeWise, generateDueTaskPdfandSendMail, taskTimeGapWiseSenderOnEmail, taskTimeGapWiseSenderOnWhatsapp, taskTypeWiseTaskCreation } from "../activities/taskManagementServices.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";
import { addContactByGoogleSheetForFacebook } from "../excelImportsIntegration/googleSheetIntegrationService.js";
import { addContactByIndiaMart } from "../thirdPartyIntegration/indiaMartIntegrationService.js";
import { addContactFromTradeIndia, addContactFromTradeIndiaBuyLeads } from "../thirdPartyIntegration/tradeIndiaIntegrationService.js";
let task = null;

export const createCron = async (req) => {
  const { cron_title, cron_time } = req.body;

  const newCron = {
    cron_title: cron_title,
    cron_time: cron_time,
    created_date_time: new Date(),
  };

  try {
    const response = await cronJobsModel.create(newCron);

    return resSuccess({
      data: { item: response },
      msg: "Cron Added Successfully",
    });
  } catch (error) {
    logger.error("Error", error);

    return resError({
      ack_msg: "something went wrong",
    });
  }
};

export const cronDataView = async (req, res) => {
  try {
    const cron_data = await cronJobsModel.findAll();

    return resSuccess({
      data: { item: cron_data },
      msg: "Cron got Successfully",
    });
  } catch (error) {
    return resError({
      ack_msg: "something went wrong",
    });
  }
};

export const cronStart = async (req, res) => {
  const { id, cron_time, cron_title } = req.body;

  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  if (cron_title === "contactReminder") {
    // task = cron.schedule(cron_time, async () => {
    //   try {
    //   } catch (error) {
    //     logger.error("Cron run failed:", error);
    //   }
    // });
    // const contactList = await contactModel.findAll({
    //     limit: 10,
    //     order: [
    //         [sequelize.fn('RAND')] // Randomize the order
    //       ]
    // })
    // logger.info("contactList", contactList);

    // const updatedCronJob = await cronJobsModel.update(
    //   { cron_start_time: currentDateTime, cron_stop_time: "" }, // Fields to update
    //   { where: { id: id } }
    // );

    sendMultipleNotification;
  }

  if (cron_title === "")
    if (task) {
      return resSuccess({
        msg: `Cron run successfully, ${Date.now()}`,
      });
    } else {
      return resError({
        ack_msg: "something went wrong",
      });
    }
};

export const cronStop = async (req, res) => {

  const { id } = req.body;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

  try {
    if (task) {
      task.stop();
    } else {
      logger.error("Error");
    }
    const updatedCronJob = await cronJobsModel.update(
      { cron_start_time: "", cron_stop_time: currentDateTime }, // Fields to update
      { where: { id: id } }
    );

    return resSuccess({
      msg: "Cron job stopped successfully",
    });
  } catch (error) {
    logger.error("Cron stop failed:", error);
    return resError({
      msg: "Failed to stop the cron job",
      err: error,
    });
  }
};

let cronJobs = [];

export const cronAllStart = async (req, res) => {
  try {
    const allCron = await cronJobsModel.findAll();

    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");

    // Start all cron jobs
    for (let e of allCron) {
      const task = cron.schedule(e.cron_time, async () => {
        try {
          const logMessage = `Cron job ${e.id} executed at ${moment().format(
            "YYYY-MM-DD HH:mm:ss"
          )}`;
        } catch (err) {
          logger.error(
            "Task execution failed for cron job id: ",
            e.id,
            err
          );
        }
      });

      cronJobs.push(task); // Store the task in the array

      await cronJobsModel.update(
        { cron_start_time: currentDateTime, cron_stop_time: "" }, // Update the cron job start time
        { where: { id: e.id } } // Update for the specific cron job
      );
    }

    return resSuccess({
      message: "All cron jobs have been started.",
    });
  } catch (error) {
    logger.error("Error", error);
    return resError({ message: "Error starting cron jobs" });
  }
};

export const cronAllStop = async (req, res) => {
  try {
    cronJobs.forEach((task) => {
      task.stop(); // Stop the cron job
    });

    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    await cronJobsModel.update(
      { cron_start_time: "", cron_stop_time: currentDateTime }, // Set stop time for all cron jobs
      { where: {} } // Apply to all cron jobs
    );

    // Clear the stored cron jobs array
    cronJobs = [];

    return resSuccess({
      message: "All cron jobs have been stopped.",
    });
  } catch (error) {
    logger.error("Error", error);
    return resError({ message: "Error stopping cron jobs" });
  }
};

export const indiaMartCroneTabRunner = async (req, res) => {
  try {
    const { date, company_id } = req.body || {};
    console.log("date, company_id", date, company_id)
    const privacyKey = req.headers['crone_tab_privacy'];

    if (privacyKey !== 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicious",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_india_mart_fetch_data',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");
    const whereClouse = {
      isDelete: 0,
      isActive: 1,
      india_mart_api_key: { [Op.ne]: '' },
      plan_expiry_date: { [Op.gte]: expireDateCheck }
    }

    if (isValid(company_id)) {
      whereClouse.id = company_id;
    }

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: whereClouse,
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};   // <-- Important

      req.body.a_application_login_id = tenantId;
      req.body.date = date;

      // Create fake req object for middleware
      const fakeReq = {
        headers: { "x-tenant-id": tenantId }
      };

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await addContactByIndiaMart(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "india mart crone run successfully",
      data: responseData
    });
  } catch (error) {
    console.log("indiaMartCroneTabRunner Error", error);
    return resError({ message: "Error starting cron jobs", developer_msg: error.msg });
  }

}

export const tradeIndiaCroneTabRunner = async (req, res) => {
  try {
    const { date, company_id } = req.body || {};
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_trade_india',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    const whereClouse = {
      isDelete: 0,
      isActive: 1,
      trade_india_user_id: { [Op.ne]: '' },
      trade_india_profile_id: { [Op.ne]: '' },
      trade_india_key: { [Op.ne]: '' },
      plan_expiry_date: { [Op.gte]: expireDateCheck }
    }

    if (isValid(company_id)) {
      whereClouse.id = company_id;
    }

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: whereClouse,
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;
      req.body.date = date;

      // Create fake req object for middleware
      const fakeReq = {
        headers: { "x-tenant-id": tenantId }
      };

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await addContactFromTradeIndia(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "trade india crone run successfully",
      data: responseData
    });
  } catch (error) {
    console.log("tradeIndiaCroneTabRunner Error", error);
    return resError({ message: "Error starting cron jobs", developer_msg: error.msg });
  }
}

export const tradeIndiaBuyLeadsCroneTabRunner = async (req, res) => {
  try {
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_trade_india_buy_leads',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        trade_india_user_id: { [Op.ne]: '' },
        trade_india_profile_id: { [Op.ne]: '' },
        trade_india_key: { [Op.ne]: '' },
        plan_expiry_date: { [Op.gte]: expireDateCheck }
      },
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;

      // Create fake req object for middleware
      const fakeReq = {
        headers: { "x-tenant-id": tenantId }
      };

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }
      const response = await addContactFromTradeIndiaBuyLeads(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "trade india buy crone run successfully",
      data: responseData
    });
  } catch (error) {
    console.log("tradeIndiaCroneTabRunner Error", error);
    return resError({ message: "Error starting cron jobs", developer_msg: error.msg });
  }
}

export const googleSheetsCroneTabRunner = async (req, res) => {
  try {
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_google_sheets',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        plan_expiry_date: { [Op.gte]: expireDateCheck },

        [Op.and]: [
          {
            [Op.or]: [
              { google_lead_sheet_for_faceBook_1: { [Op.ne]: '' } },
              { google_sheet_key_3: { [Op.ne]: '' } },
              { google_lead_sheet_for_faceBook_2: { [Op.ne]: '' } },
              { google_sheet_key_4: { [Op.ne]: '' } },
            ]
          }
        ]
      },
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });


    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;

      // Create fake req object for middleware
      const fakeReq = {
        headers: { "x-tenant-id": tenantId }
      };

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await addContactByGoogleSheetForFacebook(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "google sheets crone run successfully",
      data: responseData
    });
  } catch (error) {
    console.log("tradeIndiaCroneTabRunner Error", error);
    return resError({ message: "Error starting cron jobs", developer_msg: error.msg });
  }
}

export const taskCreationCroneTabRunner = async (req, res) => {
  try {
    const { company_id } = req.body || {}
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_task_creation',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const offset = Number(req.params.offset);
    const limit = Number(req.params.limit);

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    // 1. Get all companies
    const where = {
      isDelete: 0,
      isActive: 1,
      plan_expiry_date: { [Op.gte]: expireDateCheck }
    };
    if (isValid(company_id)) {
      where.id = company_id;
    }

    const getAllCompany = await companyModel.findAll({
      where: where,
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"],
      order: [['id', 'ASC']],
      limit,
      offset
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;
      req.body.company_masters_id = company.id;

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        console.log("taskCreationCroneTabRunner error", error);
        continue;
      }

      const response = await taskTypeWiseTaskCreation(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "auto task creation crone run successfully",
      data: responseData
    });

  } catch (error) {
    console.log("taskCreationCroneTabRunner Error", error);
    return resError({ message: "Error starting cron jobs", developer_msg: error.msg });
  }
};

export const sendTaskTimeGapWiseInWhatsapp = async (req, res) => {
  try {
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_task_time_gap_wise_send_whatsapp',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const getAllWhatasppDispatchJobs = await whatappDispatchJobs.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        type: 1
      },
      raw: true,
      order: [['id', 'ASC']],
    });

    if (!getAllWhatasppDispatchJobs) {
      return resBadRequest({
        ack_msg: "no task jobs found to be run",
        developer_msg: "",
      });
    }

    const company_ids = isValid(getAllWhatasppDispatchJobs) ? getAllWhatasppDispatchJobs.map(item => Number(item.company_id)) : null;

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        id: company_ids,
        plan_expiry_date: { [Op.gte]: expireDateCheck }
      },
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;
      req.body.company_masters_id = company.id;

      req.headers["x-tenant-id"] = tenantId;

      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await taskTimeGapWiseSenderOnWhatsapp(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "auto task creation crone run successfully",
      data: responseData
    });

  } catch (error) {
    console.log("sendTaskTimeGapWiseInWhatsapp Error", error);
    return resError({ message: "Error sent whatsapp task starting cron jobs", developer_msg: error.msg });
  }
};

export const sendDueTaskListMail = async (req, res) => {
  try {
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_send_due_task_list_mail',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const offset = Number(req.params.offset);
    const limit = Number(req.params.limit);
    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        plan_expiry_date: { [Op.gte]: expireDateCheck },
        company_email: { [Op.ne]: '' },
        is_email_verified: '1',
      },
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"],
      order: [['id', 'ASC']],
      limit,
      offset
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;
      req.body.company_masters_id = company.id;

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await generateDueTaskPdfandSendMail(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "due task send crone run successfully",
      data: responseData
    });

  } catch (error) {
    console.log("sendDueTaskListMail Error", error);
    return resError({ message: "Error sent mail task starting cron jobs", developer_msg: error.msg });
  }
};

export const sendTaskTimeGapWiseInEmail = async (req, res) => {
  try {
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_task_time_gap_wise_send_whatsapp',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");

    const getAllEmailDispatchJobs = await whatappDispatchJobs.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        type: 2
      },
      raw: true,
      order: [['id', 'ASC']],
    });

    if (!getAllEmailDispatchJobs) {
      return resBadRequest({
        ack_msg: "no task jobs found to be run",
        developer_msg: "",
      });
    }

    const company_ids = isValid(getAllEmailDispatchJobs) ? getAllEmailDispatchJobs.map(item => Number(item.company_id)) : null;

    // 1. Get all companies
    const getAllCompany = await companyModel.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        id: { [Op.in]: company_ids },
        plan_expiry_date: { [Op.gte]: expireDateCheck },
      },
      raw: true,
      attributes: ["id", "a_application_login_id", "company_name"]
    });

    if (!isValid(getAllCompany)) {
      return resError({ developer_msg: 'No Company found.' });
    }

    // 2. Loop companies one by one
    const responseData = [];
    for (const company of getAllCompany) {
      const tenantId = company.a_application_login_id;
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;
      req.body.company_masters_id = company.id;

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await taskTimeGapWiseSenderOnEmail(req);
      responseData.push({ company_name: company.company_name, response })
    }
    return resSuccess({
      ack_msg: "auto task creation crone run successfully",
      data: responseData
    });

  } catch (error) {
    console.log("sendTaskTimeGapWiseInEmail Error", error);
    return resError({ message: "Error sent Email task starting cron jobs", developer_msg: error.msg });
  }
};

export const clearWhatsappDispatchJobs = async (req, res) => {
  try {
    if (req.headers.crone_tab_privacy != 'khHKgIG786IG87ig878G8g8') {
      // return resBadRequest({
      //   ack_msg: "Unauthorized cli request",
      //   developer_msg: "suspicias",
      //   status: 404,
      // });
    }

    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_clear_whatsapp_dispatch_job',
      }
    });
    if (!isValid(checkCroneStatus)) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const offset = Number(req.params.offset) || 0;
    const limit = Number(req.params.limit) || 5000;

    // 1. Get all Jobs
    const getAllWhatasppDispatchJobs = await whatappDispatchJobs.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
      },
      raw: true,
      order: [['id', 'ASC']],
      limit,
      offset
    });

    if (!isValid(getAllWhatasppDispatchJobs)) {
      return resError({ developer_msg: 'No Jobs found.' });
    }

    // 2. Loop Jobs one by one
    const clearData = [];
    for (const company of getAllWhatasppDispatchJobs) {
      const company_id = company.company_id;
      const fetch_application_id = await companyVsApplicationLoginModel.findOne({ where: { isDelete: 0, company_flag: 1, company_masters_id: company_id }, raw: true });
      const tenantId = fetch_application_id?.a_application_login_id
      if (!req.body) req.body = {};

      req.body.a_application_login_id = tenantId;
      req.body.company_masters_id = company_id;
      req.body.whatsapp_dispatch_type = company.type;

      req.headers["x-tenant-id"] = tenantId;
      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
      } catch (error) {
        continue;
      }

      const response = await clearDataWhatsappJobsTypeWise(req);
      if (response.ack == 1) {
        clearData.push(response.data)
      }
    }
    const fetchCleared = clearData.filter(v => v.isClear == true)
    await Promise.all(
      fetchCleared.map(async (v) => {
        await whatappDispatchJobs.destroy({ where: { isDelete: 0, type: v.whatsapp_dispatch_type, company_id: v.company_masters_id } })
      })
    );
    return resSuccess({
      ack_msg: "clear whatasapp jobs send crone run successfully",
    });

  } catch (error) {
    console.log("clearWhatsappDispatchJobs Error", error);
    return resError({ message: "Error clear jobs starting cron jobs", developer_msg: error.msg });
  }
};

export const createEmployeePayrollFromLogin = async (req, res) => {
  try {

    const { ul, ll } = req.body;
    const limit = Number(ll);
    const offset = Number(ul);
    const tenantMasterData = await tenantMasterModel.findAll({
      where: {
        isDelete: 0,
      },
      limit,
      offset,
      raw: true,
      attributes: [
        "a_application_login_id",
        "company_masters_id",
      ],
    });

    const responseData = [];

    for (const tenant of tenantMasterData) {

      const tenantId = tenant.a_application_login_id;
      const companyId = tenant.company_masters_id;

      // Connect Tenant Database
      req.headers["x-tenant-id"] = tenantId;

      try {
        await new Promise((resolve, reject) => {
          tenantMiddleware(req, res, (err) =>
            err ? reject(err) : resolve()
          );
        });
      } catch (error) {
        console.log("Tenant Connection Error:", tenantId);
        continue;
      }

      // Get Team Members of Company
      const companyUsers =
        await companyVsApplicationLoginModel.findAll({
          where: {
            company_masters_id: companyId,
            isDelete: 0,
          },
          raw: true,
          attributes: ["a_application_login_id", "company_masters_id"],
        });

      if (!companyUsers.length) {
        continue;
      }

      const EmployeePayrollModel = employeePayrollModel(req.tenantDB);

      for (const user of companyUsers) {

        const loginData = await loginModel.findOne({
          where: {
            id:
              user.a_application_login_id,
          },
          raw: true,
          attributes: [
            "employee_id",
            "daily_in_time",
            "daily_out_time",
            "daily_working_hours",
            "daily_break_hours",
            "min_present_hours",
            "compulsary_attendance",
            "compulsary_attendance_image",
            "week_off_days",
            "salary_type",
            "salary_amount_type_wise",
            "id",
          ],
        });
        if (!loginData) {
          continue;
        }



        await EmployeePayrollModel.create({
          employee_id: loginData.employee_id,
          daily_in_time: loginData.daily_in_time,
          daily_out_time: loginData.daily_out_time,
          daily_working_hours:
            loginData.daily_working_hours,
          daily_break_hours:
            loginData.daily_break_hours,
          min_present_hours:
            loginData.min_present_hours,
          compulsary_attendance:
            loginData.compulsary_attendance,
          compulsary_attendance_image:
            loginData.compulsary_attendance_image,
          week_off_days:
            loginData.week_off_days,
          salary_type:
            loginData.salary_type,
          salary_amount_type_wise:
            loginData.salary_amount_type_wise,
          company_masters_id:
            companyId,
          a_application_login_id:
            loginData.id,
          created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
          modified_date: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
        });

        responseData.push({
          tenant_id: tenantId,
          status: "Created",
        });
      }
    }

    return resSuccess({
      ack_msg: "Employee Payroll Data Created Successfully",
      data: responseData,
    });

  } catch (error) {
    console.log(
      "createEmployeePayrollFromLogin Error",
      error
    );

    return resError({
      developer_msg: error.message,
    });
  }
};