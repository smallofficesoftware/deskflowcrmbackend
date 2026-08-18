import ejs from "ejs";
import fs from "fs-extra";
import mime from "mime-types";
import nodemailer from "nodemailer";
import path from "path";
import pdf from "pdf-creator-node";
import Sequelize, { col, fn, Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import {
  formatDateAndTimeCreateDateTime,
  generateFileName,
  isValid,
  normalizeToTenDigit,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId, insertStagesAndStatusLogs } from "../commonServices.js";

import { randomUUID } from "crypto";
import moment from "moment";
import { getTenantDB } from "../../config/dbManager.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { buildSearchQueryTask } from "../../helpers/searchAlgoV1.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import { taskManagementModel } from "../../models/activities/taskManagementModel.js";
import { taskMessageHistroyModel } from "../../models/activities/taskMessageHistroyModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { taskCategoryModel } from "../../models/masters/taskCategoryModel.js";
import { taskTemplateDatasource } from "../../models/masters/taslTemplateDatasources.js";
import { customFieldFormModel } from "../../models/other_settings/customFieldFormModel.js";
import { sendMultipleNotification } from "../../services/company_setup/thirdPartyIntegrationService.js";
import { __dirnameConstant, CHAT_MESSAGE_IMG_LINK_EXTENDED, CUSTOMER_SUPPORT_TICKET_ASSING_ID, CUSTOMER_SUPPORT_TICKET_DATE_VIEW, CUSTOMER_SUPPORT_TICKET_MAX_COUNT, CUSTOMER_SUPPORT_TICKET_TIME_RANGE, EXPORTS_LINK_EXTENDED, MAIL_SETTING_HOST_NAME, MAIL_SETTING_HOST_PORT, MAIL_SETTING_HOST_USER_NAME, MAIL_SETTING_HOST_USER_PASSWORD, PDF_LINK_EXTENDED_TASK_CRONE, TASK_ATTEECHMENT_VIEW, TASK_AUTO_REFRESH_INACTIVITY_DELAY, TASK_AUTO_REFRESH_ON, TASK_AUTO_REFRESH_TIMEOUT, TASK_CHAT_MESSAGE_IMG_LINK_EXTENDED, WBSITE_LEAD_ASSIGN_ID, WEBSITE_LEAD_HANDLE_DB_NAME } from "../../utils/appConstants.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import { exportData } from "../../utils/exporter.js";
import { addWhatsappDispatchJobs, taskSendWhatsappMessages } from "../whatsapp/whatsappService.js";

// import logger from "../utils/logger.js";


export const buildAllTaskWhere = ({
  companyId,
  loginId,
  searchTerm,
  taskFilter,
  statusFilter,
  statusFilterComan,
  priorityFilter,
  startDate,
  endDate,
  dueFilter,
  taskCategoryFilter,
  checkedOptionsTaskassignOrNot,
  assignedByMultiTeamMember,
  createdByMultiTeamMember,
  is_archived,
  task_types,
  is_show_template_task,
  supportTicketFlag,
  showAllData,
  showPersonalData,
  selectedLabelId,
  contact_masters_id,
  labelwiseContactShowAndOrNot,
  labelFilter,
}) => {

  const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");
  const hasAccessFinal = showAllData || showPersonalData;

  /* ================= BASE WHERE ================= */

  let whereClause = {
    company_masters_id: companyId,
    isDelete: "0",
    task_template: "0",
    is_not_visible: "0"
  };
  let whereClauseForAllTask = {
    company_masters_id: companyId,
    isDelete: "0",
    task_template: "0",
    is_not_visible: "0"
  };
  let whereClauseForMyTask = {
    company_masters_id: companyId,
    isDelete: "0",
    task_template: "0",
    is_not_visible: "0"
  };
  let whereClauseForDueTask = {
    company_masters_id: companyId,
    isDelete: "0",
    task_template: "0",
    is_not_visible: "0"
  };
  if (!hasAccessFinal) {
    whereClause.id = -1;
    whereClauseForAllTask.id = -1;
    whereClauseForMyTask.id = -1;
    whereClauseForDueTask.id = -1;
    return { whereClauseForDueTask, whereClauseForMyTask, whereClauseForAllTask, whereClause, dueTaskWhere: null, order: [] };
  }
  // ─── Contact filter (affects ALL where clauses when provided) ──────────────────
  if (contact_masters_id && !isNaN(Number(contact_masters_id))) {
    const contactId = Number(contact_masters_id);

    whereClause = {
      ...whereClause,
      contact_masters_id: contactId,
    };

    whereClauseForAllTask = {
      ...whereClauseForAllTask,
      contact_masters_id: contactId,
    };

    whereClauseForMyTask = {
      ...whereClauseForMyTask,
      contact_masters_id: contactId,
    };

    whereClauseForDueTask = {
      ...whereClauseForDueTask,
      contact_masters_id: contactId,
    };
  }

  /* ================= STATUS BASE LOGIC ================= */

  const isSearching = !!searchTerm;

  const isStatusFilterIncludesMinus6 =
    (Array.isArray(statusFilterComan) && statusFilterComan.includes(-6)) ||
    statusFilter == -6;

  if (!isSearching && !isStatusFilterIncludesMinus6 && !contact_masters_id) {
    whereClause.status = { [Op.ne]: -6 };
    whereClauseForAllTask.status = { [Op.ne]: -6 };
    whereClauseForMyTask.status = { [Op.ne]: -6 };
    whereClauseForDueTask.status = { [Op.ne]: -6 };
  }

  /* ================= SUPPORT FLAG ================= */

  if (supportTicketFlag == 0) {
    whereClause.is_support_ticket = "0";
    whereClauseForAllTask.is_support_ticket = "0";
    whereClauseForMyTask.is_support_ticket = "0";
    whereClauseForDueTask.is_support_ticket = "0";
  } else if (supportTicketFlag == 1) {
    whereClause.is_support_ticket = "1";
    whereClauseForAllTask.is_support_ticket = "1";
    whereClauseForMyTask.is_support_ticket = "1";
    whereClauseForDueTask.is_support_ticket = "1";
  } else { // default task 
    whereClause.is_support_ticket = "0";
    whereClauseForAllTask.is_support_ticket = "0";
    whereClauseForMyTask.is_support_ticket = "0";
    whereClauseForDueTask.is_support_ticket = "0";
  }

  if (is_archived != "-1") {
    whereClause.is_archive = is_archived || "0";
    whereClauseForAllTask.is_archive = is_archived || "0";
    whereClauseForMyTask.is_archive = is_archived || "0";
    whereClauseForDueTask.is_archive = is_archived || "0";
  }

  /* ================= TASK FILTER ================= */

  let taskWhere = null;

  if (taskFilter == 2) {
    taskWhere = Sequelize.literal(
      `FIND_IN_SET(${loginId}, assigned_team_member)`
    );
  } else if (!showAllData && showPersonalData) {
    taskWhere = {
      [Op.or]: [
        { a_application_login_id: loginId },
        Sequelize.literal(
          `FIND_IN_SET(${loginId}, assigned_team_member)`
        )
      ]
    };
  }
  if (!showAllData && showPersonalData) {
    whereClauseForAllTask = {
      ...whereClauseForAllTask,
      [Op.or]: [
        { a_application_login_id: loginId },
        Sequelize.literal(
          `FIND_IN_SET(${loginId}, assigned_team_member)`
        )
      ]
    };
  }


  whereClauseForMyTask = {
    [Op.and]: [
      whereClauseForMyTask,
      Sequelize.literal(
        `FIND_IN_SET(${loginId}, assigned_team_member)`
      )
    ]
  };

  if (taskWhere) {
    whereClause = { [Op.and]: [whereClause, taskWhere] };
    whereClauseForDueTask = { [Op.and]: [whereClauseForDueTask, taskWhere] };
  }

  /* ================= DUE FILTER ================= */

  let dueTaskWhere = null;

  if (dueFilter == 3) {
    dueTaskWhere = {
      task_enddate: { [Op.lt]: currentDate },
      status: { [Op.ne]: -6 }
    };
  }

  whereClauseForDueTask = {
    ...whereClauseForDueTask,
    task_enddate: { [Op.lt]: currentDate },
    status: { [Op.ne]: -6 }
  };

  /* ================= UNASSIGNED TASK FILTER ================= */
  if (Array.isArray(checkedOptionsTaskassignOrNot) && checkedOptionsTaskassignOrNot.includes(1)) {
    const createdByMeAndAssignedOnlyToMe = Sequelize.literal(
      `a_application_login_id = ${loginId}
     AND FIND_IN_SET(${loginId}, assigned_team_member)
     AND LOCATE(',', assigned_team_member) = 0`
    );

    whereClause = { [Op.and]: [whereClause, createdByMeAndAssignedOnlyToMe] };
    whereClauseForAllTask = { [Op.and]: [whereClauseForAllTask, createdByMeAndAssignedOnlyToMe] };
    whereClauseForMyTask = { [Op.and]: [whereClauseForMyTask, createdByMeAndAssignedOnlyToMe] };
    whereClauseForDueTask = { [Op.and]: [whereClauseForDueTask, createdByMeAndAssignedOnlyToMe] };
  }

  /* ================= TEMPLATE ================= */

  if (isValid(is_show_template_task) && is_show_template_task.includes(1)) {
    whereClause.task_template = { [Op.ne]: "" };
    whereClauseForAllTask.task_template = { [Op.ne]: "" };
    whereClauseForMyTask.task_template = { [Op.ne]: "" };
    whereClauseForDueTask.task_template = { [Op.ne]: "" };
  }

  /* ================= STATUS FILTER ================= */

  // if (Array.isArray(statusFilterComan) && statusFilterComan.length > 0) {
  //   whereClause.status = { [Op.in]: statusFilterComan };
  //   whereClauseForAllTask.status = { [Op.in]: statusFilterComan };
  //   whereClauseForMyTask.status = { [Op.in]: statusFilterComan };
  //   whereClauseForDueTask.status = { [Op.in]: statusFilterComan };
  // } else if (statusFilter) {
  //   whereClause.status = statusFilter;
  //   whereClauseForAllTask.status = statusFilter;
  //   whereClauseForMyTask.status = statusFilter;
  //   whereClauseForDueTask.status = statusFilter;
  // }

  if (Array.isArray(statusFilterComan) && statusFilterComan.length > 0) {
    whereClause[Op.or] = [
      { status: { [Op.in]: statusFilterComan } },
      { external_status: { [Op.in]: statusFilterComan } },
    ];

    whereClauseForAllTask[Op.or] = [
      { status: { [Op.in]: statusFilterComan } },
      { external_status: { [Op.in]: statusFilterComan } },
    ];

    whereClauseForMyTask[Op.or] = [
      { status: { [Op.in]: statusFilterComan } },
      { external_status: { [Op.in]: statusFilterComan } },
    ];

    whereClauseForDueTask[Op.or] = [
      { status: { [Op.in]: statusFilterComan } },
      { external_status: { [Op.in]: statusFilterComan } },
    ];
  } else if (statusFilter) {
    whereClause[Op.or] = [
      { status: statusFilter },
      { external_status: statusFilter },
    ];

    whereClauseForAllTask[Op.or] = [
      { status: statusFilter },
      { external_status: statusFilter },
    ];

    whereClauseForMyTask[Op.or] = [
      { status: statusFilter },
      { external_status: statusFilter },
    ];

    whereClauseForDueTask[Op.or] = [
      { status: statusFilter },
      { external_status: statusFilter },
    ];
  }

  /* ================= LABEL FILTER ================= */
  // if (selectedLabelId) {
  //   const label_id = Sequelize.literal(
  //     `FIND_IN_SET(${selectedLabelId}, label_id)`
  //   );

  const applyLabelFilter = (targetWhere, literalCondition) => {
    if (!targetWhere[Op.and]) {
      targetWhere[Op.and] = [];
    }

    targetWhere[Op.and].push(
      Sequelize.literal(literalCondition)
    );
  };

  if (isValid(labelFilter) && Array.isArray(labelFilter)) {

    const hasBlankLabel = labelFilter.includes(-9999);

    const normalLabelIds = labelFilter.filter(
      (id) => id !== -9999
    );

    const labelConditions = [];

    // Normal labels
    if (normalLabelIds.length > 0) {

      const labelCondition = normalLabelIds
        .map((id) => `FIND_IN_SET(${id}, label_id) > 0`)
        .join(
          labelwiseContactShowAndOrNot == 2
            ? " AND "
            : " OR "
        );

      labelConditions.push(`(${labelCondition})`);
    }

    // Blank labels
    if (hasBlankLabel) {
      labelConditions.push(
        `(label_id IS NULL OR label_id = '')`
      );
    }

    if (labelConditions.length > 0) {

      const finalCondition = `(${labelConditions.join(" OR ")})`;

      applyLabelFilter(whereClause, finalCondition);

      applyLabelFilter(
        whereClauseForAllTask,
        finalCondition
      );

      applyLabelFilter(
        whereClauseForMyTask,
        finalCondition
      );

      applyLabelFilter(
        whereClauseForDueTask,
        finalCondition
      );
    }

  } else if (isValid(selectedLabelId)) {

    const singleLabelCondition =
      `FIND_IN_SET(${selectedLabelId}, label_id)`;

    applyLabelFilter(
      whereClause,
      singleLabelCondition
    );

    applyLabelFilter(
      whereClauseForAllTask,
      singleLabelCondition
    );

    applyLabelFilter(
      whereClauseForMyTask,
      singleLabelCondition
    );

    applyLabelFilter(
      whereClauseForDueTask,
      singleLabelCondition
    );
  }
  /* ================= TASK TYPE ================= */

  if (isValid(task_types)) {
    whereClause.task_type = { [Op.in]: task_types };
    whereClauseForAllTask.task_type = { [Op.in]: task_types };
    whereClauseForMyTask.task_type = { [Op.in]: task_types };
    whereClauseForDueTask.task_type = { [Op.in]: task_types };
  } else {
    if (!isValid(is_show_template_task)) {
      whereClause.task_type = "5";
      whereClauseForAllTask.task_type = "5";
      whereClauseForMyTask.task_type = "5";
      whereClauseForDueTask.task_type = "5";
    }
  }

  /* ================= PRIORITY ================= */

  if (priorityFilter) {
    whereClause.task_priority = priorityFilter;
    whereClauseForAllTask.task_priority = priorityFilter;
    whereClauseForMyTask.task_priority = priorityFilter;
    whereClauseForDueTask.task_priority = priorityFilter;
  }

  if (taskCategoryFilter) {
    whereClause.task_category_id = taskCategoryFilter;
    whereClauseForAllTask.task_category_id = taskCategoryFilter;
    whereClauseForMyTask.task_category_id = taskCategoryFilter;
    whereClauseForDueTask.task_category_id = taskCategoryFilter;
  }

  /* ================= CREATED / ASSIGNED FILTER ================= */

  const filterConditions = [];

  if (Array.isArray(createdByMultiTeamMember) && createdByMultiTeamMember.length > 0) {
    filterConditions.push({
      a_application_login_id: {
        [Op.in]: createdByMultiTeamMember.map(Number)
      }
    });
  }

  if (Array.isArray(assignedByMultiTeamMember) && assignedByMultiTeamMember.length > 0) {
    const assignedConditions = assignedByMultiTeamMember.map(id =>
      Sequelize.literal(`FIND_IN_SET(${id}, assigned_team_member)`)
    );
    filterConditions.push({ [Op.or]: assignedConditions });
  }

  if (filterConditions.length > 0) {
    whereClause = { [Op.and]: [whereClause, ...filterConditions] };
    whereClauseForAllTask = { [Op.and]: [whereClauseForAllTask, ...filterConditions] };
    whereClauseForMyTask = { [Op.and]: [whereClauseForMyTask, ...filterConditions] };
    whereClauseForDueTask = { [Op.and]: [whereClauseForDueTask, ...filterConditions] };
  }

  /* ================= DATE RANGE ================= */

  if (startDate && endDate) {
    whereClause.task_fromdate = {
      [Op.gte]: moment(startDate + " 00:00:00").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClauseForAllTask.task_fromdate = {
      [Op.gte]: moment(startDate + " 00:00:00").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClauseForMyTask.task_fromdate = {
      [Op.gte]: moment(startDate + " 00:00:00").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClauseForDueTask.task_fromdate = {
      [Op.gte]: moment(startDate + " 00:00:00").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClause.task_enddate = {
      [Op.lte]: moment(endDate + " 23:59:59").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClauseForAllTask.task_enddate = {
      [Op.lte]: moment(endDate + " 23:59:59").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClauseForMyTask.task_enddate = {
      [Op.lte]: moment(endDate + " 23:59:59").format("YYYY-MM-DD HH:mm:ss")
    };
    whereClauseForDueTask.task_enddate = {
      [Op.lte]: moment(endDate + " 23:59:59").format("YYYY-MM-DD HH:mm:ss")
    };
  } else {
    whereClause.task_fromdate = {
      [Op.lte]: moment().format("YYYY-MM-DD") + " 23:59:59"
    };
    whereClauseForAllTask.task_fromdate = {
      [Op.lte]: moment().format("YYYY-MM-DD") + " 23:59:59"
    };
    whereClauseForMyTask.task_fromdate = {
      [Op.lte]: moment().format("YYYY-MM-DD") + " 23:59:59"
    };
    whereClauseForDueTask.task_fromdate = {
      [Op.lte]: moment().format("YYYY-MM-DD") + " 23:59:59"
    };
  }

  /* ================= SEARCH (KEEPING YOUR LOGIC) ================= */

  let relevanceOrder;

  if (isValid(searchTerm) && searchTerm !== "undefined") {

    const searchableColumns = ["id", "task_title", "task_remark"];

    const { searchClause, relevanceSearchOrder } =
      buildSearchQueryTask(searchTerm, searchableColumns);

    relevanceOrder = relevanceSearchOrder;

    whereClause = {
      ...whereClause,
      [Op.and]: [
        ...(whereClause[Op.and] || []),
        { searchClause }
      ]
    };
    whereClauseForAllTask = {
      ...whereClauseForAllTask,
      [Op.and]: [
        ...(whereClauseForAllTask[Op.and] || []),
        { searchClause }
      ]
    };
    whereClauseForMyTask = {
      ...whereClauseForMyTask,
      [Op.and]: [
        ...(whereClauseForMyTask[Op.and] || []),
        { searchClause }
      ]
    };
    whereClauseForDueTask = {
      ...whereClauseForDueTask,
      [Op.and]: [
        ...(whereClauseForDueTask[Op.and] || []),
        { searchClause }
      ]
    };
  }

  /* ================= ORDER ================= */

  const order = [
    ["task_priority", "DESC"],
    ["id", "DESC"]
  ];

  if (relevanceOrder && relevanceOrder.length > 0) {
    order.push(...relevanceOrder);
  }

  return {
    whereClauseForDueTask,
    whereClauseForMyTask,
    whereClauseForAllTask,
    whereClause,
    dueTaskWhere,
    order
  };
};

export const AllTaskGet = async (req, res) => {
  try {

    const {
      ul,
      ll,
      a_application_login_id,
      searchTerm,
      taskFilter,
      statusFilter,
      priorityFilter,
      startDate,
      endDate,
      statusFilterComan,
      dueFilter,
      taskCategoryFilter,
      checkedOptionsTaskassignOrNot,
      assignedByMultiTeamMember,
      createdByMultiTeamMember,
      is_archived,
      task_types,
      is_show_template_task,
      supportTicketFlag,
      selectedLabelId,
      contact_masters_id,
      labelwiseContactShowAndOrNot,
      labelFilter,
      isUnread,
    } = req.body;

    const limit = Number(ll) || 10;
    const offset = Number(ul) || 0;

    /* ================= COMPANY CHECK ================= */

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (!findCompanyId?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found for a_application_login_id: ${a_application_login_id}`
      });
    }

    const companyId = findCompanyId.company_masters_id;

    const TaskModel = taskManagementModel(req.tenantDB);
    const TaskCategoryModel = taskCategoryModel(req.tenantDB);

    /* ================= USER RIGHTS ================= */

    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: companyId,
      a_application_login_id,
      page_id: PAGE_ID.TASK_MANAGEMENT,
      tenentId: req.tenantDB
    });

    /* ================= BUILD WHERE ================= */

    const {
      whereClauseForDueTask,
      whereClauseForMyTask,
      whereClauseForAllTask,
      whereClause,
      dueTaskWhere,
      order
    } = buildAllTaskWhere({
      companyId,
      loginId: a_application_login_id,
      searchTerm,
      taskFilter,
      statusFilter,
      statusFilterComan,
      priorityFilter,
      startDate,
      endDate,
      dueFilter,
      taskCategoryFilter,
      checkedOptionsTaskassignOrNot,
      assignedByMultiTeamMember,
      createdByMultiTeamMember,
      is_archived,
      task_types,
      is_show_template_task,
      supportTicketFlag,
      showAllData,
      showPersonalData,
      selectedLabelId,
      contact_masters_id,
      labelwiseContactShowAndOrNot,
      labelFilter,
    });

    /* ================= FINAL WHERE (WITH DUE) ================= */

    let finalWhere = dueTaskWhere
      ? { [Op.and]: [whereClause, dueTaskWhere] }
      : whereClause;

    if (Number(isUnread) === 1) {
      finalWhere = {
        [Op.and]: [
          finalWhere,
          Sequelize.literal(`
        (
          task_managements.is_read_by_a_application_login_id IS NULL
          OR task_managements.is_read_by_a_application_login_id = ''
          OR NOT FIND_IN_SET(
            '${a_application_login_id}',
            task_managements.is_read_by_a_application_login_id
          )
        )
      `)
        ]
      };
    }

    /* ================= FETCH TASKS ================= */
    console.log("----------Task Query----------");
    const resultTasks = await TaskModel.findAll({
      where: finalWhere,
      limit,
      offset,
      order,
      attributes: {
        include: [
          [Sequelize.literal(`(
            SELECT stage_status_masters.name 
            FROM stage_status_masters 
            WHERE stage_status_masters.id = task_managements.status 
              AND stage_status_masters.isDelete = 0 
            LIMIT 1
          )`), "stage_status_name"],
          [Sequelize.literal(`(
            SELECT stage_status_masters.color 
            FROM stage_status_masters 
            WHERE stage_status_masters.id = task_managements.status 
              AND stage_status_masters.isDelete = 0 
            LIMIT 1
          )`), "stage_status_color"],
          [Sequelize.literal(`(
            SELECT contact_masters.person_name
            FROM contact_masters
            WHERE contact_masters.id = task_managements.contact_masters_id
              AND contact_masters.isDelete = 0
          )`), "contact_person_name"],
          [Sequelize.literal(`(
            SELECT contact_masters.mobile_number
            FROM contact_masters
            WHERE contact_masters.id = task_managements.contact_masters_id
              AND contact_masters.isDelete = 0
          )`), "contact_person_number"],
          [Sequelize.literal(`(
            SELECT contact_masters.company_name
            FROM contact_masters
            WHERE contact_masters.id = task_managements.contact_masters_id
              AND contact_masters.isDelete = 0
          )`), "contact_company_name"],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_masters.color) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, task_managements.label_id))`
            ),
            "label_color",
          ],
          [
            Sequelize.literal(
              `(SELECT GROUP_CONCAT(lable_masters.lable_name) FROM lable_masters WHERE lable_masters.isDelete = 0 AND FIND_IN_SET(lable_masters.id, task_managements.label_id))`
            ),
            "label_name",
          ],
          [
            Sequelize.literal(`(
            SELECT stage_status_masters.name
            FROM stage_status_masters
            WHERE stage_status_masters.id = task_managements.external_status
              AND stage_status_masters.isDelete = 0
              AND stage_status_masters.visibility = 1
            LIMIT 1
          )`),
            "external_status_name"
          ],
          [
            Sequelize.literal(`(
            SELECT stage_status_masters.color
            FROM stage_status_masters
            WHERE stage_status_masters.id = task_managements.external_status
              AND stage_status_masters.isDelete = 0
              AND stage_status_masters.visibility = 1
            LIMIT 1
          )`),
            "external_status_color"
          ]
        ],

      },
      raw: true,
    });

    /* ================= LOAD ACTIVE USERS ================= */

    const activeTeamList = await loginModel.findAll({
      where: {
        id: {
          [Op.in]: Sequelize.literal(`(
            SELECT a_application_login_id
            FROM company_vs_application_logins
            WHERE isDelete=0 
            AND company_masters_id = '${companyId}'
          )`)
        },
        isDelete: 0
      },
      attributes: ["username", "id"],
      raw: true
    });

    const activeTeamMap = new Map(
      activeTeamList.map(user => [user.id, user.username])
    );

    /* ================= CATEGORY MAP (NO N+1) ================= */

    const categoryIds = [
      ...new Set(resultTasks.map(t => t.task_category_id).filter(Boolean))
    ];

    let categoryMap = new Map();

    if (categoryIds.length > 0) {
      const categories = await TaskCategoryModel.findAll({
        where: {
          id: { [Op.in]: categoryIds },
          isDelete: "0"
        },
        attributes: ["id", "task_category_name", "task_color"],
        raw: true
      });

      categoryMap = new Map(
        categories.map(c => [c.id, c])
      );
    }

    /* ================= FORMAT TASKS ================= */

    const tasksWithEnhancement = resultTasks.map(task => {

      let assignedUsernames = "";

      if (task.assigned_team_member) {
        const ids = task.assigned_team_member
          .split(",")
          .map(id => id.trim())
          .filter(Boolean);

        assignedUsernames = ids
          .map(id => activeTeamMap.get(Number(id)))
          .filter(Boolean)
          .join(", ");
      }

      const category = categoryMap.get(task.task_category_id);

      const createdByName = activeTeamMap.get(
        Number(task.a_application_login_id)
      );

      // ====================== is_unread Calculation ======================
      const readList = task.is_read_by_a_application_login_id
        ? task.is_read_by_a_application_login_id.split(",").map(id => id.trim()).filter(Boolean)
        : [];

      const platform_x = req.body?.platform_x || "";
      let mobile_number = task.contact_person_number;
      if (platform_x == '1') {
        mobile_number =
          task.contact_person_number &&
            !String(task.contact_person_number).startsWith("+")
            ? `+${task.contact_person_number}`
            : task.contact_person_number;
      }

      const isUnread = !readList.includes(String(a_application_login_id)) ? 1 : 0;

      return {
        ...task,
        contact_person_number: mobile_number,
        task_fromdate:
          task.task_fromdate && task.task_fromdate !== "0000-00-00"
            ? moment(task.task_fromdate).format("DD-MM-YYYY hh:mm A")
            : null,
        task_enddate:
          task.task_enddate && task.task_enddate !== "0000-00-00"
            ? moment(task.task_enddate).format("DD-MM-YYYY hh:mm A")
            : null,
        assigned_team_member_names: assignedUsernames,
        created_by_name: createdByName || "",
        category_name: category?.task_category_name || "",
        category_color_code: category?.task_color || "",
        is_unread: isUnread,
      };
    });

    /* ================= COUNTS ================= */

    const totalTask = await TaskModel.count({
      where: whereClauseForAllTask
    });

    const dueTask = await TaskModel.count({
      where: whereClauseForDueTask
    });

    const myTask = await TaskModel.count({
      where: whereClauseForMyTask
    });

    const unreadTask = await TaskModel.count({
      where: {
        [Op.and]: [
          whereClauseForAllTask,
          Sequelize.literal(`
        (
          task_managements.is_read_by_a_application_login_id IS NULL
          OR task_managements.is_read_by_a_application_login_id = ''
          OR NOT FIND_IN_SET(
            '${a_application_login_id}',
            task_managements.is_read_by_a_application_login_id
          )
        )
      `)
        ]
      }
    });

    /* ================= RESPONSE ================= */

    return resSuccess({
      data: {
        item: tasksWithEnhancement,
        due_count: dueTask,
        all_count: totalTask,
        my_count: myTask,
        unread_count: unreadTask,
        TASK_AUTO_REFRESH_ON,
        TASK_AUTO_REFRESH_TIMEOUT,
        TASK_AUTO_REFRESH_INACTIVITY_DELAY
      }
    });

  } catch (e) {
    console.error("Error in AllTaskGet:", e);
    return resBadRequest({
      developer_msg: `Error: ${e.message}`
    });
  }
};


export const taskTypesList = [
  { id: "1", type_name: "Daily" },
  { id: "2", type_name: "Weekly" },
  { id: "3", type_name: "Monthly" },
  { id: "4", type_name: "Yearly" },
  { id: "5", type_name: "Once" },
  { id: "6", type_name: "Repeat After Two Month" },
  { id: "7", type_name: "Repeat After Three Month" },
  { id: "9", type_name: "Repeat After Four Month" },
  { id: "8", type_name: "Repeat After Six Month" },
  { id: "10", type_name: "Repeat After Eight Month" },
];

export const taskPriorityList = [
  { id: "1", mode_name: "Low" },
  { id: "2", mode_name: "Medium" },
  { id: "3", mode_name: "High" },
  { id: "4", mode_name: "Critical" }

];

export const selectWeeklyDays = [
  { id: "1", days_name: "Monday" },
  { id: "2", days_name: "Tuesday" },
  { id: "3", days_name: "Wednesday" },
  { id: "4", days_name: "Thursday" },
  { id: "5", days_name: "Friday" },
  { id: "6", days_name: "Saturday" },
  { id: "7", days_name: "Sunday" },
];

export const taskStatusList = [
  { id: "-3", status_name: "initiate" },
  // Add more status mappings as needed
];

const processTaskFile = async (file, companyId) => {
  if (!file || !file.path) return "";

  const fileName = path.basename(file.path);

  const directoryPath = path.join(
    process.cwd(),
    "media-folder",
    "task_attechment",
    companyId.toString()
  );

  await fs.mkdir(directoryPath, { recursive: true });

  const destinationPath = path.join(directoryPath, fileName);

  await fs.move(file.path, destinationPath, {
    overwrite: true,
  });

  return `${companyId}/${fileName}`;
};

export const createAllTask = async (req) => {
  try {
    const {
      assigned_team_member,
      task_enddate,
      task_fromdate,
      task_title,
      task_remark,
      task_template,
      task_selected_date,
      selected_task_days,
      task_category_id,
      task_priority,
      task_type,
      a_application_login_id,
      reference_id,
      reference_table,
      task_id,
      contact_masters_id,
      team_task_assignement_type,
      is_notification_sand_email,
      is_notification_sand_wp,
      is_support_ticket,
      reference_contact,
    } = req.body;

    const taskType = taskTypesList.find((t) => t.id === String(task_type));

    const taskPriority = taskPriorityList.find((p) => p.id === String(task_priority));

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    // const companyId = findCompanyId.company_masters_id;
    const files = req.files || {};
    const companyId = findCompanyId.company_masters_id;

    // let convertPathVisitImage = null;

    // if (isValid(task_attechment) && task_attechment.path) {
    //   const fileName = path.basename(task_attechment.path);


    //   const directoryPath = path.join(
    //     process.cwd(),
    //     "media-folder",
    //     "task_attechment",
    //     companyId.toString()
    //   );

    //   await fs.mkdir(directoryPath, { recursive: true });

    //   const destinationPath = path.join(directoryPath, fileName);
    //   await fs.move(task_attechment.path, destinationPath, { overwrite: true });

    //   convertPathVisitImage = `${companyId}/${fileName}`;
    // }
    const task_attechment =
      await processTaskFile(files?.task_attechment?.[0], companyId);

    const task_column_attechments_1 =
      await processTaskFile(files?.task_column_attechments_1?.[0], companyId);

    const task_column_attechments_2 =
      await processTaskFile(files?.task_column_attechments_2?.[0], companyId);

    const task_column_attechments_3 =
      await processTaskFile(files?.task_column_attechments_3?.[0], companyId);

    const task_column_attechments_4 =
      await processTaskFile(files?.task_column_attechments_4?.[0], companyId);

    const task_column_attechments_5 =
      await processTaskFile(files?.task_column_attechments_5?.[0], companyId);

    const TaskModel = taskManagementModel(req.tenantDB);
    const TaskModelChatMessageHistory = taskMessageHistroyModel(req.tenantDB);
    const TaskCategoryModel = taskCategoryModel(req.tenantDB);
    const TaskTemplateDatasourceModel = taskTemplateDatasource(req.tenantDB);
    const ContactDataAdd = contactModel(req.tenantDB);
    const ContactMessageHistoryModel = contactMessageHistory(req.tenantDB);
    // --------------------- Contact Create / Find Logic -------------------------
    let finalContactId = contact_masters_id;

    // Check contact by mobile number

    if (reference_contact) {
      finalContactId = reference_contact;
    }
    // --------------------------------------------------------------------------


    let categoryName = task_category_id;
    if (task_category_id) {
      const category = await TaskCategoryModel.findOne({
        where: { id: task_category_id },
        attributes: ["task_category_name"],
      });
      categoryName = category?.task_category_name || task_category_id;
    }

    const assignedMembersString = assigned_team_member
      ? String(assigned_team_member)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id)
        .join(",")
      : "";

    const team_member_list = assigned_team_member
      ? String(assigned_team_member)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id) : []

    const selectedDaysString = selected_task_days
      ? String(selected_task_days)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id)
        .join(",")
      : "";
    /* this Code find customer_company_id and  customer_application_login_id using contact_masters_id into the request  */
    let customer_company_id = null;
    let customer_application_login_id = null;
    let getUserCreatorDetails = "";

    if (is_support_ticket == 1 && finalContactId) {
      const contactData = await ContactDataAdd.findOne({
        where: { id: finalContactId },
        attributes: ["mobile_number"],
      });

      const mobile_number = contactData?.mobile_number;

      if (mobile_number) {
        const loginData = await loginModel.findOne({
          where: { recovery_mobile: mobile_number, isDelete: 0 },
          attributes: ["id", "username", "recovery_mobile"],
        });

        const customerLoginId = loginData?.id;

        if (customerLoginId) {
          const companyData = await getCompanyByLoginId(customerLoginId);

          const customerCompanyId = companyData?.company_masters_id;

          if (customerCompanyId) {
            const companyVsLogin = await companyVsApplicationLoginModel.findOne({
              where: {
                company_masters_id: customerCompanyId,
                company_flag: 1,
                isDelete: 0,
              },
              attributes: ["company_masters_id", "a_application_login_id"],
            });

            if (companyVsLogin) {
              customer_company_id = companyVsLogin.company_masters_id;
              customer_application_login_id = companyVsLogin.a_application_login_id;
            }
          }
        }

        if (loginData?.username) {
          getUserCreatorDetails += `<br/><b>Name:</b> ${loginData?.username}`;
        }

        if (loginData?.recovery_mobile) {
          getUserCreatorDetails += `<br/><b>Phone Number:</b> ${loginData?.recovery_mobile}`;
        }
      }

    }

    let insertTaskArrayObject = [];
    if (team_task_assignement_type === "2") {
      insertTaskArrayObject = await Promise.all(
        team_member_list.map((v) => {
          return {
            assigned_team_member: v,
            task_enddate: task_enddate ? moment(task_enddate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
            task_fromdate: task_fromdate ? moment(task_fromdate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
            task_title,
            task_remark: task_remark + getUserCreatorDetails,
            task_template,
            task_selected_date,
            selected_task_days: selectedDaysString,
            task_category_id,
            task_priority,
            task_type,
            company_masters_id: findCompanyId.company_masters_id,
            a_application_login_id,
            status: "-3",
            reference_id,
            reference_table,
            contact_masters_id: finalContactId,
            team_task_assignement_type,
            task_attechment: task_attechment || "",

            task_column_attechments_1:
              task_column_attechments_1 || "",

            task_column_attechments_2:
              task_column_attechments_2 || "",

            task_column_attechments_3:
              task_column_attechments_3 || "",

            task_column_attechments_4:
              task_column_attechments_4 || "",

            task_column_attechments_5:
              task_column_attechments_5 || "",
            is_notification_sand_wp,
            is_notification_sand_email,
            is_support_ticket,
            customer_company_id: customer_company_id || "",
            customer_application_login_id: customer_application_login_id || "",
            task_column_number_1: req.body.task_column_number_1 || "",
            task_column_number_2: req.body.task_column_number_2 || "",
            task_column_number_3: req.body.task_column_number_3 || "",
            task_column_number_4: req.body.task_column_number_4 || "",
            task_column_number_5: req.body.task_column_number_5 || "",
            task_column_text_1: req.body.task_column_text_1 || "",
            task_column_text_2: req.body.task_column_text_2 || "",
            task_column_text_3: req.body.task_column_text_3 || "",
            task_column_text_4: req.body.task_column_text_4 || "",
            task_column_text_5: req.body.task_column_text_5 || "",
            task_column_text_area_1: req.body.task_column_text_area_1 || "",
            task_column_text_area_2: req.body.task_column_text_area_2 || "",
            task_column_text_area_3: req.body.task_column_text_area_3 || "",
            task_column_text_area_4: req.body.task_column_text_area_4 || "",
            task_column_text_area_5: req.body.task_column_text_area_5 || "",
            task_column_date_1: req.body.task_column_date_1 || "",
            task_column_date_2: req.body.task_column_date_2 || "",
            task_column_date_3: req.body.task_column_date_3 || "",
            task_column_date_4: req.body.task_column_date_4 || "",
            task_column_date_5: req.body.task_column_date_5 || "",
            task_column_date_and_time_1: req.body.task_column_date_and_time_1 || "",
            task_column_date_and_time_2: req.body.task_column_date_and_time_2 || "",
            task_column_date_and_time_3: req.body.task_column_date_and_time_3 || "",
            task_column_date_and_time_4: req.body.task_column_date_and_time_4 || "",
            task_column_date_and_time_5: req.body.task_column_date_and_time_5 || "",
            task_column_time_1: req.body.task_column_time_1 || "",
            task_column_time_2: req.body.task_column_time_2 || "",
            task_column_time_3: req.body.task_column_time_3 || "",
            task_column_time_4: req.body.task_column_time_4 || "",
            task_column_time_5: req.body.task_column_time_5 || "",
            task_column_switch_1: req.body.task_column_switch_1 || false,
            task_column_switch_2: req.body.task_column_switch_2 || false,
            task_column_switch_3: req.body.task_column_switch_3 || false,
            task_column_switch_4: req.body.task_column_switch_4 || false,
            task_column_switch_5: req.body.task_column_switch_5 || false,
            task_column_decimal_1: req.body.task_column_decimal_1 || "",
            task_column_decimal_2: req.body.task_column_decimal_2 || "",
            task_column_decimal_3: req.body.task_column_decimal_3 || "",
            task_column_decimal_4: req.body.task_column_decimal_4 || "",
            task_column_decimal_5: req.body.task_column_decimal_5 || "",
            task_column_dropdown_1: req.body.task_column_dropdown_1 || "",
            task_column_dropdown_2: req.body.task_column_dropdown_2 || "",
            task_column_dropdown_3: req.body.task_column_dropdown_3 || "",
            task_column_dropdown_4: req.body.task_column_dropdown_4 || "",
            task_column_dropdown_5: req.body.task_column_dropdown_5 || "",
            task_column_radio_1: req.body.task_column_radio_1 || "",
            task_column_radio_2: req.body.task_column_radio_2 || "",
            task_column_radio_3: req.body.task_column_radio_3 || "",
            task_column_radio_4: req.body.task_column_radio_4 || "",
            task_column_radio_5: req.body.task_column_radio_5 || "",
          }
        })
      )
    } else if (team_task_assignement_type === "1") {
      insertTaskArrayObject = [
        {
          assigned_team_member: assignedMembersString,
          task_enddate: task_enddate ? moment(task_enddate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
          task_fromdate: task_fromdate ? moment(task_fromdate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
          task_title,
          task_remark: task_remark + getUserCreatorDetails,
          task_template,
          task_selected_date,
          selected_task_days: selectedDaysString,
          task_category_id,
          task_priority,
          task_type,
          company_masters_id: findCompanyId.company_masters_id,
          a_application_login_id,
          status: "-3",
          reference_id,
          reference_table,
          contact_masters_id: finalContactId,
          team_task_assignement_type,
          task_attechment: task_attechment || "",

          task_column_attechments_1:
            task_column_attechments_1 || "",

          task_column_attechments_2:
            task_column_attechments_2 || "",

          task_column_attechments_3:
            task_column_attechments_3 || "",

          task_column_attechments_4:
            task_column_attechments_4 || "",

          task_column_attechments_5:
            task_column_attechments_5 || "",
          is_notification_sand_wp,
          is_notification_sand_email,
          is_support_ticket,
          customer_company_id: customer_company_id || "",
          customer_application_login_id: customer_application_login_id || "",
          task_column_number_1: req.body.task_column_number_1 || "",
          task_column_number_2: req.body.task_column_number_2 || "",
          task_column_number_3: req.body.task_column_number_3 || "",
          task_column_number_4: req.body.task_column_number_4 || "",
          task_column_number_5: req.body.task_column_number_5 || "",
          task_column_text_1: req.body.task_column_text_1 || "",
          task_column_text_2: req.body.task_column_text_2 || "",
          task_column_text_3: req.body.task_column_text_3 || "",
          task_column_text_4: req.body.task_column_text_4 || "",
          task_column_text_5: req.body.task_column_text_5 || "",
          task_column_text_area_1: req.body.task_column_text_area_1 || "",
          task_column_text_area_2: req.body.task_column_text_area_2 || "",
          task_column_text_area_3: req.body.task_column_text_area_3 || "",
          task_column_text_area_4: req.body.task_column_text_area_4 || "",
          task_column_text_area_5: req.body.task_column_text_area_5 || "",
          task_column_date_1: req.body.task_column_date_1 || "",
          task_column_date_2: req.body.task_column_date_2 || "",
          task_column_date_3: req.body.task_column_date_3 || "",
          task_column_date_4: req.body.task_column_date_4 || "",
          task_column_date_5: req.body.task_column_date_5 || "",
          task_column_date_and_time_1: req.body.task_column_date_and_time_1 || "",
          task_column_date_and_time_2: req.body.task_column_date_and_time_2 || "",
          task_column_date_and_time_3: req.body.task_column_date_and_time_3 || "",
          task_column_date_and_time_4: req.body.task_column_date_and_time_4 || "",
          task_column_date_and_time_5: req.body.task_column_date_and_time_5 || "",
          task_column_time_1: req.body.task_column_time_1 || "",
          task_column_time_2: req.body.task_column_time_2 || "",
          task_column_time_3: req.body.task_column_time_3 || "",
          task_column_time_4: req.body.task_column_time_4 || "",
          task_column_time_5: req.body.task_column_time_5 || "",
          task_column_switch_1: req.body.task_column_switch_1 || false,
          task_column_switch_2: req.body.task_column_switch_2 || false,
          task_column_switch_3: req.body.task_column_switch_3 || false,
          task_column_switch_4: req.body.task_column_switch_4 || false,
          task_column_switch_5: req.body.task_column_switch_5 || false,
          task_column_decimal_1: req.body.task_column_decimal_1 || "",
          task_column_decimal_2: req.body.task_column_decimal_2 || "",
          task_column_decimal_3: req.body.task_column_decimal_3 || "",
          task_column_decimal_4: req.body.task_column_decimal_4 || "",
          task_column_decimal_5: req.body.task_column_decimal_5 || "",
          task_column_dropdown_1: req.body.task_column_dropdown_1 || "",
          task_column_dropdown_2: req.body.task_column_dropdown_2 || "",
          task_column_dropdown_3: req.body.task_column_dropdown_3 || "",
          task_column_dropdown_4: req.body.task_column_dropdown_4 || "",
          task_column_dropdown_5: req.body.task_column_dropdown_5 || "",
          task_column_radio_1: req.body.task_column_radio_1 || "",
          task_column_radio_2: req.body.task_column_radio_2 || "",
          task_column_radio_3: req.body.task_column_radio_3 || "",
          task_column_radio_4: req.body.task_column_radio_4 || "",
          task_column_radio_5: req.body.task_column_radio_5 || "",
        }
      ]
    } else {
      return resBadRequest({
        ack_msg: "Invalid Request",
        developer_msg: `some parameter not found.`,
      });
    }
    // console.log("insertTaskArrayObjectinsertTaskArrayObject", insertTaskArrayObject);
    // return

    const newTask = await TaskModel.bulkCreate(insertTaskArrayObject);

    const finalTaskId = newTask.id || task_id;

    await Promise.all(
      newTask.map(async (v) => {
        const promises = [];

        // Status log
        /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
        promises.push(
          insertStagesAndStatusLogs(req, {
            reference_table: "task_managements",
            reference_id: v.id,
            status_id: "-3",
            a_application_login_id: a_application_login_id,
          })
        );
        /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

        // WhatsApp job
        /* Whatsapp dispatch jobs entry - Added by dinesh 27-04-2026 */
        if (v.is_notification_sand_email == 1 || v.is_notification_sand_wp == 1) {
          req.body.whatspp_dispatch_jobs_type = v.is_notification_sand_wp == 1 ? 1 : 2;
          req.body.whatspp_dispatch_jobs_company_id = findCompanyId.company_masters_id;
          promises.push(addWhatsappDispatchJobs(req));
        }
        /* Whatsapp dispatch jobs entry - Added by dinesh 27-04-2026 */

        return Promise.all(promises);
      })
    );

    if (task_template > 0) {

      let taskTemplateInsertedList = [];
      taskTemplateInsertedList = await Promise.all(
        newTask.map((v) => {
          const taskDataForTaskTemplateDataValues = {
            task_id: v.id,
            assigned_team_member: v.assigned_team_member,
            task_enddate: task_enddate ? moment(task_enddate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
            task_fromdate: task_fromdate ? moment(task_fromdate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
            task_title,
            task_remark,
            task_template,
            task_selected_date,
            selected_task_days: selectedDaysString,
            task_category_id,
            task_priority,
            task_type,
            is_notification_sand_wp,
            is_notification_sand_email,
            is_support_ticket: is_support_ticket || ""
          }
          const taskDataForTaskTemplateDataValuesJson = JSON.stringify(taskDataForTaskTemplateDataValues);
          return {
            a_application_login_id,
            company_masters_id: findCompanyId.company_masters_id,
            task_id: v.id,
            task_template_master_id: task_template,
            data_sorce: taskDataForTaskTemplateDataValuesJson,
            created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
          }
        }
        )
      );
      await TaskTemplateDatasourceModel.bulkCreate(taskTemplateInsertedList);

    }
    const createdStatus = newTask[0]?.status ?? "-3";
    let taskMessageInsertList = [];
    taskMessageInsertList = await Promise.all(
      newTask.map(async (v) => {
        const taskCustomColumnKeys = [
          'column_number_1',
          'column_number_2',
          'column_number_3',
          'column_number_4',
          'column_number_5',
          'column_text_1',
          'column_text_2',
          'column_text_3',
          'column_text_4',
          'column_text_5',
          'column_text_area_1',
          'column_text_area_2',
          'column_text_area_3',
          'column_text_area_4',
          'column_text_area_5',
          'column_date_1',
          'column_date_2',
          'column_date_3',
          'column_date_4',
          'column_date_5',
          'column_date_and_time_1',
          'column_date_and_time_2',
          'column_date_and_time_3',
          'column_date_and_time_4',
          'column_date_and_time_5',
          'column_time_1',
          'column_time_2',
          'column_time_3',
          'column_time_4',
          'column_time_5',
          'column_switch_1',
          'column_switch_2',
          'column_switch_3',
          'column_switch_4',
          'column_switch_5',
          'column_decimal_1',
          'column_decimal_2',
          'column_decimal_3',
          'column_decimal_4',
          'column_decimal_5',
          'column_dropdown_1',
          'column_dropdown_2',
          'column_dropdown_3',
          'column_dropdown_4',
          'column_dropdown_5',
          'column_radio_1',
          'column_radio_2',
          'column_radio_3',
          'column_radio_4',
          'column_radio_5',
          'task_column_number_1',
          'task_column_number_2',
          'task_column_number_3',
          'task_column_number_4',
          'task_column_number_5',
          'task_column_text_1',
          'task_column_text_2',
          'task_column_text_3',
          'task_column_text_4',
          'task_column_text_5',
          'task_column_text_area_1',
          'task_column_text_area_2',
          'task_column_text_area_3',
          'task_column_text_area_4',
          'task_column_text_area_5',
          'task_column_date_1',
          'task_column_date_2',
          'task_column_date_3',
          'task_column_date_4',
          'task_column_date_5',
          'task_column_date_and_time_1',
          'task_column_date_and_time_2',
          'task_column_date_and_time_3',
          'task_column_date_and_time_4',
          'task_column_date_and_time_5',
          'task_column_time_1',
          'task_column_time_2',
          'task_column_time_3',
          'task_column_time_4',
          'task_column_time_5',
          'task_column_switch_1',
          'task_column_switch_2',
          'task_column_switch_3',
          'task_column_switch_4',
          'task_column_switch_5',
          'task_column_decimal_1',
          'task_column_decimal_2',
          'task_column_decimal_3',
          'task_column_decimal_4',
          'task_column_decimal_5',
          'task_column_dropdown_1',
          'task_column_dropdown_2',
          'task_column_dropdown_3',
          'task_column_dropdown_4',
          'task_column_dropdown_5',
          'task_column_radio_1',
          'task_column_radio_2',
          'task_column_radio_3',
          'task_column_radio_4',
          'task_column_radio_5',
          'task_column_attechments_1',
          'task_column_attechments_2',
          'task_column_attechments_3',
          'task_column_attechments_4',
          'task_column_attechments_5',
        ];

        const filledTaskCustomColumns = taskCustomColumnKeys.filter((key) => {
          let value = v[key];
          if (value === undefined || value === null) return false;
          if (key.includes('switch')) {
            if (typeof value === 'boolean') return value === true;
            if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
            return false;
          }
          if (key.includes('date') && typeof value === 'string') {
            if (value === '0000-00-00' || value.trim() === '') return false;
          }
          if (key.includes('time') && typeof value === 'string') {
            if (value === '00:00:00' || value === '00:00' || value.trim() === '') return false;
          }
          if (typeof value === 'string') return value.trim() !== '';
          if (typeof value === 'number') return true;
          return !!value;
        });

        let taskCustomFieldTitles = [];
        if (filledTaskCustomColumns.length > 0) {
          const customFormFiledModel = customFieldFormModel(req.tenantDB); // wahi model jo visit wale me use hota
          const customFields = await customFormFiledModel.findAll({
            where: { reference_column_name: filledTaskCustomColumns },
            attributes: ['reference_column_name', 'title'],
            raw: true,
          });

          const titleMap = {};
          customFields.forEach((field) => {
            titleMap[field.reference_column_name] = field.title;
          });

          taskCustomFieldTitles = filledTaskCustomColumns.map((key) => {
            let value = v[key];

            if (key.includes('attechment')) {
              const fileUrl = v[key];
              if (fileUrl) {
                value = `<a href="${TASK_ATTEECHMENT_VIEW}${fileUrl}" target="_blank">View Attachment</a>`;
              }
            }

            return {
              key,
              title: titleMap[key] || key.replace(/_/g, ' ').toUpperCase(),
              value,
            };
          });
        }

        let taskCustomFieldsHTML = "";
        if (taskCustomFieldTitles.length > 0) {
          taskCustomFieldsHTML =
            "<br><b>Custom Fields:</b><br>" +
            taskCustomFieldTitles.map((field) => `<b>${field.title}:</b> ${field.value}`).join("<br>");
        }
        const taskTypeName = taskType.type_name || "";
        const taskPriorityName = taskPriority.mode_name || "";
        const taskStatusName = taskStatusList.find((s) => String(s.id) === String(createdStatus))?.status_name
          || createdStatus
          || "";


        const selectedDaysNames = selectedDaysString
          ? selectedDaysString
            .split(",")
            .map((id) => selectWeeklyDays.find((d) => d.id == id)?.days_name || id)
            .join(", ")
          : "";
        const formattedFromDate = task_fromdate ? task_fromdate : "Not specified";
        const formattedEndDate = task_enddate ? task_enddate : "Not specified";
        let assignedMemberNames = v.assigned_team_member;
        if (assignedMemberNames) {
          const assignedMemberIds = assignedMemberNames.split(",").map((id) => id.trim());
          const assignedMembers = await loginModel.findAll({
            where: {
              id: assignedMemberIds,
              isDelete: 0,
            },
            attributes: ["id", "username"],
          });
          assignedMemberNames = assignedMembers.map((m) => m.username).join(", ") || assignedMemberNames;
        }
        return {
          task_id: v.id,
          a_application_login_id,
          company_masters_id: findCompanyId.company_masters_id,
          description: `
            <strong>Task Title:</strong> ${task_title}<br>
            <strong>Task Description:</strong> ${task_remark || "No Description Added"}<br>
            <strong>Start Date:</strong> ${formattedFromDate}<br>
            <strong>End Date:</strong> ${formattedEndDate}<br>
            <strong>Category:</strong> ${categoryName}<br>
            <strong>Priority:</strong> ${taskPriorityName}<br>
            <strong>Status:</strong> ${taskStatusName}<br>
            <strong>Type:</strong> ${taskTypeName}<br>
            <strong>Days:</strong> ${selectedDaysNames || " "}<br>
            <strong>Assign To:</strong> ${assignedMemberNames}<br>
            ${taskCustomFieldsHTML}
          `,
          created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
          message_side: "1",
          message_type_id: "0",
        };
      })
    );

    await TaskModelChatMessageHistory.bulkCreate(taskMessageInsertList);

    if (finalContactId) {

      const contactHistoryInsertList = taskMessageInsertList.map((msg) => ({
        contact_masters_id: finalContactId,
        company_masters_id: findCompanyId.company_masters_id,
        a_application_login_id,
        description: msg.description,
        created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
        message_side: "1",
        message_type_id: "0",
      }));

      await ContactMessageHistoryModel.bulkCreate(contactHistoryInsertList);
    }
    // Handle notifications 
    if (assignedMembersString) {
      const assignedMemberIds = assignedMembersString.split(",").map((id) => id.trim());

      // Fetch usernames and tokens for all assigned members
      const assignedMembers = await loginModel.findAll({
        where: {
          id: assignedMemberIds,
          isDelete: 0,
        },
        attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
      });

      // Collect all device tokens
      const allTokens = assignedMembers
        .flatMap((member) => [
          member.web_refresh_token,
          member.android_refresh_token,
          member.ios_refresh_token,
        ])
        .filter((token) => token && token.trim() !== "");

      const uniqueTokens = [...new Set(allTokens)];

      if (uniqueTokens.length > 0) {
        try {
          // Get the assigner's username
          const assigner = await loginModel.findOne({
            where: {
              id: a_application_login_id,
              isDelete: 0,
            },
            attributes: ["username"],
          });

          const assignerName = assigner?.username || "Someone";

          // Send notifications to all assigned members
          await sendMultipleNotification({
            deviceTokens: uniqueTokens,
            title: `${assignerName} has assigned you a new task`,
            body: `Task: ${task_title}`,
          });
        } catch (notificationError) {
          req.logger.error("Notification failed (non-critical):", notificationError.message);
        }
      } else {
        req.logger.info("No device tokens found for assigned team members.");
      }
    }

    return resSuccess({
      data: { item: newTask },
      ack_msg: "Task created successfully",
    });
  } catch (error) {
    console.log("createAllTask error", error)
    return resBadRequest({
      ack_msg: "Error",
      developer_msg: `Failed to create task: ${error.message}`,
    });
  }
};

export const AllTaskUpdate = async (req) => {
  try {
    const {
      editId,
      assigned_team_member,
      task_enddate,
      task_fromdate,
      task_title,
      task_remark,
      task_template,
      task_selected_date,
      selected_task_days,
      task_category_id,
      task_priority,
      task_type,
      a_application_login_id,
      is_notification_sand_wp,
      is_notification_sand_email,
      is_support_ticket,
      reference_contact
    } = req.body;

    if (!editId) {
      return resError({
        ack_msg: "Task ID is required for update",
        developer_msg: "Missing editId in payload",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const TaskModel = taskManagementModel(req.tenantDB);

    const taskExists = await TaskModel.findOne({
      where: {
        id: editId,
        isDelete: "0",
        company_masters_id: findCompanyId.company_masters_id,
      },
    });

    if (!taskExists) {
      return resError({
        ack_msg: "Task not found",
        developer_msg: `Task with ID ${editId} not found`,
      });
    }
    const companyId = findCompanyId.company_masters_id;
    const files = req.files || {};
    const taskAttachment =
      await processTaskFile(files?.task_attechment?.[0], companyId);

    const task_column_attechments_1 =
      await processTaskFile(files?.task_column_attechments_1?.[0], companyId);

    const task_column_attechments_2 =
      await processTaskFile(files?.task_column_attechments_2?.[0], companyId);

    const task_column_attechments_3 =
      await processTaskFile(files?.task_column_attechments_3?.[0], companyId);

    const task_column_attechments_4 =
      await processTaskFile(files?.task_column_attechments_4?.[0], companyId);

    const task_column_attechments_5 =
      await processTaskFile(files?.task_column_attechments_5?.[0], companyId);
    // let convertPathVisitImage = taskExists.task_attechment || "";
    // const task_attechment = req.file;

    // if (task_attechment && task_attechment.path) {
    //   const fileName = path.basename(task_attechment.path);
    //   const companyId = findCompanyId.company_masters_id;

    //   // Destination Folder
    //   const directoryPath = path.join(
    //     process.cwd(),
    //     "media-folder",
    //     "task_attechment",
    //     companyId.toString()
    //   );

    //   await fs.mkdir(directoryPath, { recursive: true });

    //   // Move file
    //   const destinationPath = path.join(directoryPath, fileName);
    //   await fs.move(task_attechment.path, destinationPath, { overwrite: true });

    //   // ONLY STORE "123/image.jpg" IN DATABASE
    //   convertPathVisitImage = `${companyId}/${fileName}`;
    // }
    // END IMAGE UPDATE LOGIC


    // Ensure values are saved as comma-separated strings
    const assignedTeamStr = Array.isArray(assigned_team_member)
      ? assigned_team_member.join(",")
      : assigned_team_member || "";

    const selectedDaysStr = Array.isArray(selected_task_days)
      ? selected_task_days.join(",")
      : selected_task_days || "";

    const ContactModel = contactModel(req.tenantDB);
    let finalContactId = taskExists.contact_masters_id || "";

    if (reference_contact) {
      finalContactId = reference_contact;
    }

    const updatedTask = await TaskModel.update(
      {
        assigned_team_member: assignedTeamStr,
        task_enddate: task_enddate ? moment(task_enddate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
        task_fromdate: task_fromdate ? moment(task_fromdate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
        task_title,
        task_remark,
        task_template,
        task_selected_date,
        selected_task_days: selectedDaysStr,
        task_category_id,
        task_priority,
        task_type,
        a_application_login_id,
        task_attechment:
          taskAttachment || taskExists.task_attechment,

        task_column_attechments_1:
          task_column_attechments_1 ||
          taskExists.task_column_attechments_1,

        task_column_attechments_2:
          task_column_attechments_2 ||
          taskExists.task_column_attechments_2,

        task_column_attechments_3:
          task_column_attechments_3 ||
          taskExists.task_column_attechments_3,

        task_column_attechments_4:
          task_column_attechments_4 ||
          taskExists.task_column_attechments_4,

        task_column_attechments_5:
          task_column_attechments_5 ||
          taskExists.task_column_attechments_5,
        is_notification_sand_wp,
        is_notification_sand_email,
        is_support_ticket,
        contact_masters_id: finalContactId,
        task_column_number_1: req.body.task_column_number_1 || "",
        task_column_number_2: req.body.task_column_number_2 || "",
        task_column_number_3: req.body.task_column_number_3 || "",
        task_column_number_4: req.body.task_column_number_4 || "",
        task_column_number_5: req.body.task_column_number_5 || "",
        task_column_text_1: req.body.task_column_text_1 || "",
        task_column_text_2: req.body.task_column_text_2 || "",
        task_column_text_3: req.body.task_column_text_3 || "",
        task_column_text_4: req.body.task_column_text_4 || "",
        task_column_text_5: req.body.task_column_text_5 || "",
        task_column_text_area_1: req.body.task_column_text_area_1 || "",
        task_column_text_area_2: req.body.task_column_text_area_2 || "",
        task_column_text_area_3: req.body.task_column_text_area_3 || "",
        task_column_text_area_4: req.body.task_column_text_area_4 || "",
        task_column_text_area_5: req.body.task_column_text_area_5 || "",
        task_column_date_1: req.body.task_column_date_1 || "",
        task_column_date_2: req.body.task_column_date_2 || "",
        task_column_date_3: req.body.task_column_date_3 || "",
        task_column_date_4: req.body.task_column_date_4 || "",
        task_column_date_5: req.body.task_column_date_5 || "",
        task_column_date_and_time_1: req.body.task_column_date_and_time_1 || "",
        task_column_date_and_time_2: req.body.task_column_date_and_time_2 || "",
        task_column_date_and_time_3: req.body.task_column_date_and_time_3 || "",
        task_column_date_and_time_4: req.body.task_column_date_and_time_4 || "",
        task_column_date_and_time_5: req.body.task_column_date_and_time_5 || "",
        task_column_time_1: req.body.task_column_time_1 || "",
        task_column_time_2: req.body.task_column_time_2 || "",
        task_column_time_3: req.body.task_column_time_3 || "",
        task_column_time_4: req.body.task_column_time_4 || "",
        task_column_time_5: req.body.task_column_time_5 || "",
        task_column_switch_1: req.body.task_column_switch_1 || false,
        task_column_switch_2: req.body.task_column_switch_2 || false,
        task_column_switch_3: req.body.task_column_switch_3 || false,
        task_column_switch_4: req.body.task_column_switch_4 || false,
        task_column_switch_5: req.body.task_column_switch_5 || false,
        task_column_decimal_1: req.body.task_column_decimal_1 || "",
        task_column_decimal_2: req.body.task_column_decimal_2 || "",
        task_column_decimal_3: req.body.task_column_decimal_3 || "",
        task_column_decimal_4: req.body.task_column_decimal_4 || "",
        task_column_decimal_5: req.body.task_column_decimal_5 || "",
        task_column_dropdown_1: req.body.task_column_dropdown_1 || "",
        task_column_dropdown_2: req.body.task_column_dropdown_2 || "",
        task_column_dropdown_3: req.body.task_column_dropdown_3 || "",
        task_column_dropdown_4: req.body.task_column_dropdown_4 || "",
        task_column_dropdown_5: req.body.task_column_dropdown_5 || "",
        task_column_radio_1: req.body.task_column_radio_1 || "",
        task_column_radio_2: req.body.task_column_radio_2 || "",
        task_column_radio_3: req.body.task_column_radio_3 || "",
        task_column_radio_4: req.body.task_column_radio_4 || "",
        task_column_radio_5: req.body.task_column_radio_5 || "",
      },
      { where: { id: editId } }
    );

    const taskDataForTaskTemplateDataValues = {
      task_id: editId,
      assigned_team_member: assignedTeamStr,
      task_enddate: task_enddate ? moment(task_enddate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
      task_fromdate: task_fromdate ? moment(task_fromdate, "DD-MM-YYYY hh:mm A").format("YYYY-MM-DD HH:mm:ss") : "",
      task_title,
      task_remark,
      task_template,
      task_selected_date,
      selected_task_days: selectedDaysStr,
      task_category_id,
      task_priority,
      task_type,
      is_notification_sand_wp,
      is_notification_sand_email
    };

    const taskDataForTaskTemplateDataValuesJson = JSON.stringify(taskDataForTaskTemplateDataValues);

    const TaskTemplateDatasourceModel = taskTemplateDatasource(req.tenantDB);

    const checkTemplateDatasourceHaveData = await TaskTemplateDatasourceModel.findOne({
      where: {
        task_id: editId,
        isDelete: 0,
      },
      attributes: ["id"],
    });

    if (task_template > 0 && checkTemplateDatasourceHaveData == null) {
      await TaskTemplateDatasourceModel.create({
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        task_id: editId,
        task_template_master_id: task_template,
        data_sorce: taskDataForTaskTemplateDataValuesJson,
        created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
      });
    }
    else if (task_template > 0) {
      await TaskTemplateDatasourceModel.update(
        {
          task_template_master_id: task_template,
          data_sorce: taskDataForTaskTemplateDataValuesJson,
        },
        { where: { task_id: editId } }
      );
    }
    else if (task_template == 0) {
      await TaskTemplateDatasourceModel.update(
        { isDelete: 1 },
        { where: { task_id: editId, isDelete: 0 } }
      );
    }

    if (updatedTask) {
      return resSuccess({
        ack_msg: "Task updated successfully",
        data: { id: editId },
      });
    } else {
      return resError({
        ack_msg: "Failed to update Task",
        developer_msg: "Update query did not modify any rows",
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error while updating task",
      developer_msg: `${error.message}`,
    });
  }
};

export const AllTaskDelete = async (req) => {
  const TaskInput = req.body.TaskId;
  const taskIds = Array.isArray(TaskInput) ? TaskInput : [TaskInput];

  try {
    const TaskModel = taskManagementModel(req.tenantDB);
    const TaskDataSourceModel = taskTemplateDatasource(req.tenantDB);

    const taskHaveTaskTemplateCheck = await TaskModel.findOne({
      where: {
        id: taskIds,
        isDelete: 0
      },
      attributes: ["id", "task_template"],
      raw: true
    });

    // if (taskHaveTaskTemplateCheck && taskHaveTaskTemplateCheck.task_template > 0) {
    //   return resError({
    //     ack_msg: "This task is linked to a task template. Please remove the template first",
    //     developer_msg: "This task added in task template so first remove it."
    //   });
    // }

    // Soft delete tasks (TaskModel)
    const [affectedCount] = await TaskModel.update(
      { isDelete: 1 },
      {
        where: {
          id: { [Sequelize.Op.in]: taskIds },
          isDelete: 0,
        },
      }
    );

    //Soft delete related records in TaskDataSourceModel
    await TaskDataSourceModel.update(
      { isDelete: 1 },
      {
        where: {
          task_id: { [Sequelize.Op.in]: taskIds },
          isDelete: 0,
        },
      }
    );

    return resSuccess({
      ack_msg:
        affectedCount > 1
          ? `${affectedCount} Task(s) deleted successfully.`
          : affectedCount === 1
            ? "Task deleted successfully."
            : "No Task deleted.",
      developer_msg: "Batch Task soft deletion completed.",
    });
  } catch (error) {
    return resError({
      ack_msg: "Unexpected error occurred during deletion.",
      developer_msg: error.message,
    });
  }
};

export const AllTaskMessageGet = async (req, res) => {
  try {
    let taskBody = {
      task_id: req.body.task_id,
      a_application_login_id: req.body.a_application_login_id,
      startDateForUl: req.body.startDateForUl,
      searchTerm: req.body.searchTerm,
      isChecked: req.body.isChecked,
      isCheckedAttachment: req.body.isCheckedAttachment,
      filterAndSearch: req.body.filterAndSearch || {}, // Default to empty object
    };

    const findCompanyId = await getCompanyByLoginId(taskBody.a_application_login_id);
    if (!findCompanyId) {
      return resError({ ack_msg: "Invalid login ID", developer_msg: "Company not found" });
    }

    const CTMModel = await taskMessageHistroyModel(req.tenantDB);
    let whereConditions = []; // Build array of conditions for [Op.and]

    // Base condition: task_id is required
    if (!taskBody.task_id) {
      return resError({ ack_msg: "Task ID required", developer_msg: "Missing task_id" });
    }
    whereConditions.push({ task_id: taskBody.task_id });

    // Search term
    if (taskBody.filterAndSearch.searchTerm) {
      whereConditions.push({
        description: { [Op.like]: `%${taskBody.filterAndSearch.searchTerm}%` },
      });
    }

    // Reminder filter
    if (taskBody.filterAndSearch.isChecked !== undefined) {
      whereConditions.push({
        is_reminder: Number(taskBody.filterAndSearch.isChecked),
      });
    }

    // Attachment filter
    if (taskBody.filterAndSearch.isCheckedAttachment !== undefined) {
      whereConditions.push({
        message_type_id: taskBody.filterAndSearch.isCheckedAttachment,
      });
    }

    // Date range from selectedDates
    if (taskBody.filterAndSearch.selectedDates && taskBody.filterAndSearch.selectedDates.length === 2) {
      const start = moment(taskBody.filterAndSearch.selectedDates[0]).format('YYYY-MM-DD');
      const end = moment(taskBody.filterAndSearch.selectedDates[1]).format('YYYY-MM-DD');
      whereConditions.push(
        Sequelize.where(
          Sequelize.fn('DATE', Sequelize.col('created_date_time')),
          { [Op.between]: [start, end] }
        )
      );
    }

    // Pagination-like date filtering (startDateForUl)
    let dateCondition = null;
    if (taskBody.startDateForUl && taskBody.startDateForUl !== '-1') {
      const start = moment(taskBody.startDateForUl).format('YYYY-MM-DD');
      let end = null;

      const findLastNextToDate = await CTMModel.findOne({
        where: {
          task_id: taskBody.task_id,
          [Op.and]: [
            Sequelize.where(Sequelize.fn('DATE', Sequelize.col('created_date_time')), {
              [Op.lt]: start,
            }),
          ],
        },
        order: [['created_date_time', 'DESC']],
        attributes: [[fn('DATE', col('created_date_time')), 'created_date']],
      });

      if (findLastNextToDate && findLastNextToDate.created_date) {
        end = moment(findLastNextToDate.created_date).subtract(3, 'days').format('YYYY-MM-DD');
      }

      if (end) {
        dateCondition = Sequelize.where(
          Sequelize.fn('DATE', Sequelize.col('created_date_time')),
          { [Op.between]: [end, start] }
        );
      }
    } else if (taskBody.startDateForUl === '-1') {
      const findLastDate = await CTMModel.findOne({
        where: { task_id: taskBody.task_id },
        order: [['created_date_time', 'DESC']],
        attributes: ['created_date_time'],
      });

      if (findLastDate && findLastDate.created_date_time) {
        const lastDate = moment(findLastDate.created_date_time).format('YYYY-MM-DD');
        const findLastNextToDate = await CTMModel.findOne({
          where: {
            task_id: taskBody.task_id,
            [Op.and]: [
              Sequelize.where(Sequelize.fn('DATE', Sequelize.col('created_date_time')), {
                [Op.lte]: lastDate,
              }),
            ],
          },
          order: [['created_date_time', 'DESC']],
          attributes: [[fn('DATE', col('created_date_time')), 'created_date']],
        });

        let startDate = null;
        if (findLastNextToDate && findLastNextToDate.created_date) {
          startDate = moment(findLastNextToDate.created_date).subtract(3, 'days').format('YYYY-MM-DD');
        }

        if (startDate) {
          dateCondition = Sequelize.where(
            Sequelize.fn('DATE', Sequelize.col('created_date_time')),
            { [Op.gte]: startDate, [Op.lte]: lastDate }
          );
        }
      }
    }

    if (dateCondition) {
      whereConditions.push(dateCondition);
    }

    // Final whereClause
    const whereClause = whereConditions.length > 0 ? { [Op.and]: whereConditions } : {};

    const resultMessageHistory = await CTMModel.findAll({
      where: whereClause,
      order: [['created_date_time', 'DESC'], ['id', 'DESC']],
      attributes: {
        include: [
          [fn('DATE', col('created_date_time')), 'messageDate'],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.remark FROM reminder_messages WHERE reminder_messages.reference_id = task_message_histories.id AND reminder_messages.reference_table="task_message_histories" AND reminder_messages.isDelete=0 AND reminder_messages.status=0 ORDER BY reminder_messages.id DESC LIMIT 1)`
            ),
            'reminder_remark',
          ],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.reminder_data_time FROM reminder_messages WHERE reminder_messages.reference_id = task_message_histories.id AND reminder_messages.reference_table="task_message_histories" AND reminder_messages.isDelete=0 AND reminder_messages.status=0 ORDER BY reminder_messages.id DESC LIMIT 1)`
            ),
            'reminder_data_time',
          ],
        ],
      },
    });


    // Async username resolution
    const getUsername = async (a_application_login_id) => {
      if (!a_application_login_id) return null;
      const user = await loginModel.findOne({
        where: { id: a_application_login_id, isDelete: 0 },
        attributes: ['username'],
      });
      return user?.username || null;
    };


    const sanitizedMessageHistory = await Promise.all(
      resultMessageHistory.map(async (messageItem) => {
        const sanitized = sanitizeObjectOfNull(messageItem.toJSON());
        const username = await getUsername(sanitized.deleted_by); // Fixed: renamed and ensured async

        return {
          ...sanitized,
          media_url: messageItem.dataValues.media_url
            ? `${TASK_CHAT_MESSAGE_IMG_LINK_EXTENDED}${messageItem.dataValues.media_url}`
            : '',
          created_date_time: formatDateAndTimeCreateDateTime(messageItem.created_date_time),
          reminder_data_time: messageItem.dataValues.reminder_data_time
            ? formatDateAndTimeCreateDateTime(messageItem.dataValues.reminder_data_time)
            : '',
          deleted_by: username,
        };
      })
    );

    const formatMessageHistoryWithLoop = (messages) => {
      const result = [];
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        const messageDate = message.messageDate;
        let dateGroup = result.find((group) => group.date === messageDate);
        if (!dateGroup) {
          dateGroup = { date: messageDate, messages: [] };
          result.push(dateGroup);
        }
        dateGroup.messages.push({
          id: message.id,
          messageDate: message.messageDate,
          description: message.description,
          current_status: message.current_status,
          message_type_id: message.message_type_id,
          created_date_time: message.created_date_time,
          s_timestemp: message.s_timestemp,
          company_masters_id: message.company_masters_id,
          a_application_login_id: message.a_application_login_id,
          task_id: message.task_id,
          message_side: message.message_side,
          media_url: message.media_url,
          media_name: message.media_name,
          is_reminder: message.is_reminder,
          entry_flag: message.entry_flag,
          isDelete: message.isDelete,
          isActive: message.isActive,
          application_login_name: message.application_login_name,
          reminder_remark: message.reminder_remark,
          reminder_data_time: message.reminder_data_time,
          contact_name: message.contact_name,
          deleted_by: message.deleted_by,
        });
      }
      return result;
    };

    const formatMessageShow = formatMessageHistoryWithLoop(sanitizedMessageHistory);

    return resSuccess({
      data: {
        item1: formatMessageShow,
        companyId: findCompanyId.company_masters_id,
      },
    });
  } catch (e) {
    //  req.logger.error("Error fetching message history:", e);
    console.error("Full error stack:", e.stack); // Add for better debugging
    return resBadRequest(); // Or res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createAttachment = async (req) => {
  const applicationLoginId = req.body.a_application_login_id || req.body.a_application_id;
  const task_id = req.body.task_id;
  const messageTypeId = req.body.message_type_id;
  const description = req.body.description;
  const messageSide = req.body.message_side;
  const msg = req.body.msg;


  if (!req.file) {
    return resBadRequest({
      developer_msg: "No file uploaded",
    });
  }


  const folder = req.file;
  const directoryPath = path.join(
    process.cwd(),
    "media-folder",
    "task_history_attachment",
    task_id.toString()
  );
  try {

    const findCompanyId = await getCompanyByLoginId(applicationLoginId);
    const CTMModel = taskMessageHistroyModel(req.tenantDB);
    await fs.mkdirp(directoryPath);
    const filePath = folder.path || folder;
    const fileName = path.basename(filePath);
    const destinationPath = path.join(directoryPath, fileName);
    await fs.move(filePath, destinationPath);
    let convertPath = task_id.toString() + "/" + fileName;
    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    const attachmentResult = await CTMModel.create({
      a_application_login_id: applicationLoginId,
      task_id: task_id,
      media_url: convertPath,
      media_name: folder.originalname || fileName,
      message_type_id: messageTypeId,
      message_side: messageSide,
      created_date_time: formattedDate,
      description: description || "",
      application_login_name: req.body.application_login_name,
      company_masters_id: findCompanyId.company_masters_id,
    });

    const updateUnread = await CTMModel.update({
      is_read_by_a_application_login_id: applicationLoginId
    }, {
      where: {
        id: task_id
      }
    })
    // if (msg === "0") {
    //   let task_id = task_id;
    //   const requestData = {
    //     table: "contact_masters",
    //     columns: "id,mobile_number",
    //     where: `{\"isDelete\":\"0\",\"id\":\"${contact_masters_id}\,"}`,
    //   };
    //   const getContactById = await rp_getValue(requestData);
    //   let contact_master_number =
    //     WHATSAPP_SEND_ADD_PRE_NUMBER + `${getContactById.data}`;
    //   let atteched_file = TASK_CHAT_MESSAGE_IMG_LINK_EXTENDED + convertPath;
    //   let whatsappReqestFlag = "msg";
    //   let contact_history_message = description;
    //   let a_application_login_id = applicationLoginId;
    //   let whatsAppKeyAll = await loginModel.findOne({
    //     where: { id: a_application_login_id, isDelete: 0 },
    //     attributes: ["whatsapp_appkey", "whatsapp_authkey"],
    //   });
    //   let superAdminWhatsAppKey = whatsAppKeyAll.whatsapp_appkey;
    //   let superAdminWhatsappAuthKey = whatsAppKeyAll.whatsapp_authkey;
    //   addContactByWhatsApps(
    //     req,
    //     whatsappReqestFlag,
    //     atteched_file,
    //     contact_master_number,
    //     contact_history_message,
    //     a_application_login_id,
    //     superAdminWhatsAppKey,
    //     superAdminWhatsappAuthKey,
    //     folder
    //   );
    // }
    return resSuccess({
      data: {
        item: attachmentResult,
      },
      developer_msg: "File moved successfully",
    });
  } catch (error) {
    req.logger.error("Error moving fileTask:", error.message);

    return resBadRequest({
      developer_msg: error,
    });
  }
};

export const ReminderCompleteTaskMsg = async (req) => {
  try {
    const { reference_id, reference_table, a_application_login_id, completed_date_time } = req.body;




    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found for a_application_login_id: ${a_application_login_id}`,
      });
    }

    const TaskMessageModel = taskMessageHistroyModel(req.tenantDB);
    const ReminderMessagesModel = reminderMessagesModel(req.tenantDB);


    const taskExists = await TaskMessageModel.findOne({
      where: {
        id: reference_id,
        isDelete: "0",
        company_masters_id: findCompanyId.company_masters_id,
      },
    });

    if (!taskExists) {
      return resError({
        ack_msg: "Task not found",
        developer_msg: `Task with ID ${reference_id} not found`,
      });
    }

    const reminderExists = await ReminderMessagesModel.findOne({
      where: {
        reference_id: reference_id,
        reference_table: reference_table,
        company_masters_id: findCompanyId.company_masters_id,
      },
    });


    if (!reminderExists) {
      return resError({
        ack_msg: "Reminder not found",
        developer_msg: `No reminder found for reference_id: ${reference_id} and reference_table: ${reference_table}`,
      });
    }

    const [taskUpdated] = await TaskMessageModel.update(
      {
        is_reminder: 0,
      },
      {
        where: {
          id: reference_id,
          company_masters_id: findCompanyId.company_masters_id,
        },
      }
    );

    const [reminderUpdated] = await ReminderMessagesModel.update(
      {
        status: 1,
        completed_date_time: completed_date_time || moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
      },
      {
        where: {
          reference_id: reference_id,
          reference_table: reference_table,
          company_masters_id: findCompanyId.company_masters_id,
        },
      }
    );

    if (taskUpdated > 0 && reminderUpdated > 0) {
      return resSuccess({
        ack_msg: "Reminder completed successfully",
        data: { id: reference_id },
      });
    } else {
      return resError({
        ack_msg: "Failed to complete reminder",
        developer_msg: `Task update affected ${taskUpdated} rows, Reminder update affected ${reminderUpdated} rows`,
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Error while completing reminder",
      developer_msg: error.message,
    });
  }
};

export const AllTaskCountGet = async (req, res) => {
  const { a_application_login_id } = req.body;

  try {
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resError({ ack_msg: "Company not found" });
    }

    const TaskModel = taskManagementModel(req.tenantDB);

    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.TASK_MANAGEMENT,
      tenentId: req.tenantDB,
    });

    if (!showAllData && !showPersonalData) {
      return resSuccess({
        ack_msg: "Count Get",
        data: {
          task_count: 0,
          support_count: 0,
        },
      });
    }

    const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");

    // =============================
    // 🔹 BASE CONDITIONS (SAME AS DUE TASK)
    // =============================
    const baseConditions = [
      { company_masters_id: findCompanyId.company_masters_id },
      { isDelete: "0" },
      { task_template: "0" },
      { is_archive: "0" },
      { task_type: "5" },
      { is_not_visible: "0" },
      { task_enddate: { [Op.lt]: currentDate } },
      { status: { [Op.ne]: -6 } },
    ];

    // =============================
    // 🔹 ONLY ASSIGNED TO ME
    // =============================
    const assignedCondition = Sequelize.literal(
      `FIND_IN_SET(${a_application_login_id}, assigned_team_member)`
    );

    const buildWhere = (supportFlag) => {
      return {
        [Op.and]: [
          ...baseConditions,
          { is_support_ticket: supportFlag },
          assignedCondition,
        ],
      };
    };

    // =============================
    // 🔹 PARALLEL COUNT
    // =============================
    const [normalCount, supportCount] = await Promise.all([
      TaskModel.count({ where: buildWhere("0") }),
      TaskModel.count({ where: buildWhere("1") }),
    ]);

    return resSuccess({
      ack_msg: "Count Get",
      data: {
        task_count: normalCount,
        support_count: supportCount,
      },
    });

  } catch (error) {
    console.error("Error in AllTaskCountGet:", error);
    return resError({
      ack_msg: "Server error",
      developer_msg: error.message,
    });
  }
};

export const archiveTasks = async (req) => {
  const TaskInput = req.body.TaskId;
  if (Array.isArray(TaskInput)) {
    return resError({
      ack_msg: "Under Development Comming Soon.", // Je Create Kari sake ej archive kari sake e bulk nathi karyu etle atyre under devlopement rakhyu che
    });
  }
  const taskIds = Array.isArray(TaskInput) ? TaskInput : [TaskInput];

  try {
    const TaskModel = taskManagementModel(req.tenantDB);

    const getTaskDetailDb = await TaskModel.findOne({ where: { id: TaskInput, isDelete: 0 }, attributes: ["a_application_login_id"], raw: true });
    if (getTaskDetailDb.a_application_login_id != req.body.a_application_login_id) {
      return resError({
        ack_msg: "You do not have permission to perform this action.",
      });
    }

    // update tasks
    const [affectedCount] = await TaskModel.update(
      { is_archive: 1 },
      {
        where: {
          id: { [Sequelize.Op.in]: taskIds },
          isDelete: 0,
        },
      }
    );

    return resSuccess({
      ack_msg:
        affectedCount > 1
          ? `${affectedCount} Task archived successfully.`
          : affectedCount === 1
            ? "Task archived successfully."
            : "No Task Archived.",
      developer_msg: "Batch Task Archived completed.",
    });
  } catch (error) {
    return resError({
      ack_msg: "Unexpected error occurred during Archived.",
      developer_msg: error.message,
    });
  }
};

export const unarchiveTasks = async (req) => {
  const TaskInput = req.body.TaskId;
  if (Array.isArray(TaskInput)) {
    return resError({
      ack_msg: "Under Development, Comming Soon.", // Je Create Kari sake ej archive kari sake e bulk nathi karyu etle atyre under devlopement rakhyu che
    });
  }
  const taskIds = Array.isArray(TaskInput) ? TaskInput : [TaskInput];

  try {
    const TaskModel = taskManagementModel(req.tenantDB);
    const getTaskDetailDb = await TaskModel.findOne({ where: { id: TaskInput, isDelete: 0 }, attributes: ["a_application_login_id"], raw: true });
    if (getTaskDetailDb.a_application_login_id != req.body.a_application_login_id) {
      return resError({
        ack_msg: "You do not have permission to perform this action.",
      });
    }
    const [affectedCount] = await TaskModel.update(
      { is_archive: 0 },
      {
        where: {
          id: { [Sequelize.Op.in]: taskIds },
          isDelete: 0,
        },
      }
    );

    return resSuccess({
      ack_msg:
        affectedCount > 1
          ? `${affectedCount} Task Unarchived successfully.`
          : affectedCount === 1
            ? "Task Unarchived successfully."
            : "No UnTask Archived.",
      developer_msg: "Batch Task UnArchived completed.",
    });
  } catch (error) {
    return resError({
      ack_msg: "Unexpected error occurred during Archived.",
      developer_msg: error.message,
    });
  }
};

export const convertSupportTicketToTasks = async (req) => {
  const TaskInput = req.body.TaskId;
  const taskIds = Array.isArray(TaskInput) ? TaskInput : [TaskInput];

  try {
    const TaskModel = taskManagementModel(req.tenantDB);

    // update tasks
    const [affectedCount] = await TaskModel.update(
      { is_support_ticket: 0 },
      {
        where: {
          id: { [Sequelize.Op.in]: taskIds },
          isDelete: 0,
        },
      }
    );

    return resSuccess({
      ack_msg:
        affectedCount > 1
          ? `${affectedCount} Convert successfully.`
          : affectedCount === 1
            ? "Support Ticket Convert successfully."
            : "No Support Ticket.",
      developer_msg: "Convert Support Ticket To Task.",
    });
  } catch (error) {
    return resError({
      ack_msg: "Unexpected error occurred during Archived.",
      developer_msg: error.message,
    });
  }
};

export const taskTypeWiseTaskCreation = async (req) => {
  try {
    const { a_application_login_id, company_masters_id } = req.body;

    const taskManagementModelIntance = taskManagementModel(req.tenantDB);

    const todayDate = moment().format("YYYY-MM-DD");
    const todayDay = moment().format("DD");
    const todayMonth = moment().format("MM");
    const currentDayName = moment().format("dddd");

    const weeks = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };

    const baseAttributes = [
      'task_title', 'task_category_id', 'task_priority', 'team_task_assignement_type',
      'assigned_team_member', 'task_remark', 'status', 'reference_table', 'reference_id',
      'contact_masters_id', 'a_application_login_id', 'company_masters_id', "is_notification_sand_wp", "is_notification_sand_email", "task_attechment"
    ];

    const fetchTasks = async (extraWhere) => {
      return await taskManagementModelIntance.findAll({
        where: {
          isDelete: 0,
          is_archive: 0,
          task_template: '',
          status: '-3',
          ...extraWhere,
        },
        raw: true,
        attributes: baseAttributes,
      });
    };

    const mapTask = (v) => ({
      task_title: v.task_title,
      task_category_id: v.task_category_id,
      task_priority: v.task_priority,
      team_task_assignement_type: v.team_task_assignement_type,
      task_type: "5",
      assigned_team_member: v.assigned_team_member,
      task_fromdate: todayDate,
      task_enddate: todayDate,
      task_remark: v.task_remark,
      status: "-3",
      reference_table: v.reference_table,
      reference_id: v.reference_id,
      contact_masters_id: v.contact_masters_id,
      task_attechment: v.task_attechment,
      a_application_login_id: v.a_application_login_id,
      company_masters_id: v.company_masters_id,
      is_notification_sand_wp: v.is_notification_sand_wp,
      is_notification_sand_email: v.is_notification_sand_email,
      is_auto_create: '1',
    });


    // Daily (1)
    const daily = await fetchTasks({ task_type: 1 });
    const dailyMapped = daily.map(mapTask);

    // Weekly (2)
    const weeklyDayNumber = weeks[currentDayName];
    const weekly = await fetchTasks({
      task_type: 2,
      [Op.and]: [
        Sequelize.literal(`FIND_IN_SET('${weeklyDayNumber}', selected_task_days)`)
      ]
    });
    const weeklyMapped = weekly.map(mapTask);

    // Monthly (3)
    const monthly = await fetchTasks({
      task_type: 3,
      [Op.and]: [
        Sequelize.literal(`DAY(task_selected_date) = '${todayDay}'`)
      ]
    });
    const monthlyMapped = monthly.map(mapTask);

    // Yearly (4)
    const yearly = await fetchTasks({
      task_type: 4,
      [Op.and]: [
        Sequelize.literal(`DAY(task_selected_date) = '${todayDay}'`),
        Sequelize.literal(`MONTH(task_selected_date) = '${todayMonth}'`)
      ]
    });
    const yearlyMapped = yearly.map(mapTask);

    // Repeat After two Month (6)
    const repafttwmon = await fetchTasks({
      task_type: 6,
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn("DAY", Sequelize.col("task_selected_date")),
          Sequelize.fn("DAY", `${todayDate}`)
        ),
        Sequelize.literal(
          `TIMESTAMPDIFF(MONTH, task_selected_date, '${todayDate}') % 2 = 0`
        )
      ]
    });
    const repafttwmonMapped = repafttwmon.map(mapTask);

    // Repeat After three Month (7)
    const repaftthrmon = await fetchTasks({
      task_type: 7,
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn("DAY", Sequelize.col("task_selected_date")),
          Sequelize.fn("DAY", `${todayDate}`)
        ),
        Sequelize.literal(
          `TIMESTAMPDIFF(MONTH, task_selected_date, '${todayDate}') % 3 = 0`
        )
      ]
    });
    const repaftthrmonMapped = repaftthrmon.map(mapTask);

    // Repeat After six Month (8)
    const repaftSixmon = await fetchTasks({
      task_type: 8,
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn("DAY", Sequelize.col("task_selected_date")),
          Sequelize.fn("DAY", `${todayDate}`)
        ),
        Sequelize.literal(
          `TIMESTAMPDIFF(MONTH, task_selected_date, '${todayDate}') % 6 = 0`
        )
      ]
    });
    const repaftSixmonMapped = repaftSixmon.map(mapTask);

    // Repeat After Four Month (4)
    const repaftFourmon = await fetchTasks({
      task_type: 9,
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn("DAY", Sequelize.col("task_selected_date")),
          Sequelize.fn("DAY", `${todayDate}`)
        ),
        Sequelize.literal(
          `TIMESTAMPDIFF(MONTH, task_selected_date, '${todayDate}') % 4 = 0`
        )
      ]
    });
    const repaftFourmonMapped = repaftFourmon.map(mapTask);

    // Repeat After Eight Month (8)
    const repaftEightmon = await fetchTasks({
      task_type: 10,
      [Op.and]: [
        Sequelize.where(
          Sequelize.fn("DAY", Sequelize.col("task_selected_date")),
          Sequelize.fn("DAY", `${todayDate}`)
        ),
        Sequelize.literal(
          `TIMESTAMPDIFF(MONTH, task_selected_date, '${todayDate}') % 8 = 0`
        )
      ]
    });
    const repaftEightmonMapped = repaftEightmon.map(mapTask);
    // -----------------------------------
    // STEP 1: Fetch already created tasks for TODAY → to prevent duplicates
    // -----------------------------------
    const alreadyCreated = await taskManagementModelIntance.findAll({
      where: {
        task_type: 5,
        is_auto_create: '1',
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn('DATE', Sequelize.col('task_fromdate')),
            todayDate
          )
        ]
      },
      raw: true,
      attributes: [
        'task_title',
        'reference_table',
        'reference_id',
        'contact_masters_id',
        'assigned_team_member'
      ]
    });

    const existingSet = new Set(
      alreadyCreated.map(v =>
        `${v.task_title}|${v.reference_table}|${v.reference_id}|${v.contact_masters_id}|${v.assigned_team_member}`
      )
    );

    const isDuplicate = (task) => {
      const key = `${task.task_title}|${task.reference_table}|${task.reference_id}|${task.contact_masters_id}|${task.assigned_team_member}`;
      return existingSet.has(key);
    };

    const finalInsertData = [
      ...dailyMapped,
      ...weeklyMapped,
      ...monthlyMapped,
      ...yearlyMapped,
      ...repafttwmonMapped,
      ...repaftthrmonMapped,
      ...repaftSixmonMapped,
      ...repaftFourmonMapped,
      ...repaftEightmonMapped
    ].filter(task => !isDuplicate(task));

    if (finalInsertData.length > 0) {
      const newTask = await taskManagementModelIntance.bulkCreate(finalInsertData);

      /* Task Message Entry */
      const TaskModelChatMessageHistoryIntance = taskMessageHistroyModel(req.tenantDB);
      const TaskCategoryModelIntance = taskCategoryModel(req.tenantDB);


      let taskMessageInsertList = [];
      taskMessageInsertList = await Promise.all(
        newTask.map(async (v) => {

          /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
          await insertStagesAndStatusLogs(req,
            {
              reference_table: "task_managements",
              reference_id: v.id,
              status_id: "-3",
              a_application_login_id: a_application_login_id
            }
          )
          /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

          // WhatsApp job
          /* Whatsapp dispatch jobs entry - Added by dinesh 27-04-2026 */
          if (v.is_notification_sand_email == 1 || v.is_notification_sand_wp == 1) {
            req.body.whatspp_dispatch_jobs_type = v.is_notification_sand_wp == 1 ? 1 : 2;
            req.body.whatspp_dispatch_jobs_company_id = findCompanyId.company_masters_id;
            await addWhatsappDispatchJobs(req);
          }
          /* Whatsapp dispatch jobs entry - Added by dinesh 27-04-2026 */

          const taskType = taskTypesList.find((t) => t.id === String(v.task_type));
          const taskPriority = taskPriorityList.find((p) => p.id === String(v.task_priority));

          const taskTypeName = taskType.type_name || "";
          const taskPriorityName = taskPriority.mode_name || "";
          const taskStatusName = taskStatusList.find((s) => s.id === newTask.status)?.status_name || newTask.status;

          const formattedFromDate = todayDate || "Not specified";
          const formattedEndDate = todayDate || "Not specified";

          let assignedMemberNames = v.assigned_team_member;
          if (assignedMemberNames) {
            const assignedMemberIds = assignedMemberNames.split(",").map((id) => id.trim());
            const assignedMembers = await loginModel.findAll({
              where: {
                id: assignedMemberIds,
                isDelete: 0,
              },
              attributes: ["id", "username"],
            });
            assignedMemberNames = assignedMembers.map((m) => m.username).join(", ") || assignedMemberNames;
          }

          let categoryName = v.task_category_id;
          if (v.task_category_id) {
            const category = await TaskCategoryModelIntance.findOne({
              where: { id: v.task_category_id },
              attributes: ["task_category_name"],
            });
            categoryName = category?.task_category_name || v.task_category_id;
          }

          return {
            task_id: v.id,
            a_application_login_id,
            company_masters_id: company_masters_id,
            description: `
            <strong>Task Title:</strong> ${v.task_title}<br>
            <strong>Task Description:</strong> ${v.task_remark || "No Description Added"}<br>
            <strong>Start Date:</strong> ${formattedFromDate}<br>
            <strong>End Date:</strong> ${formattedEndDate}<br>
            <strong>Category:</strong> ${categoryName}<br>
            <strong>Priority:</strong> ${taskPriorityName}<br>
            <strong>Status:</strong> ${taskStatusName}<br>
            <strong>Type:</strong> ${taskTypeName}<br>
            <strong>Assign To:</strong> ${assignedMemberNames}<br>
          `,
            created_date_time: moment(new Date()).format("YYYY-MM-DD HH:mm:ss"),
            message_side: "1",
            message_type_id: "0",
          }
        })
      );
      await TaskModelChatMessageHistoryIntance.bulkCreate(taskMessageInsertList);
      /* Task Message Entry */
    }
    return resSuccess({
      ack_msg: `Tasks generated & inserted:${finalInsertData.length}`,
    });

  } catch (error) {
    console.log("taskTypeWiseTaskCreation Error", error);
    return resError({
      ack_msg: "Unexpected error occurred during task creation.",
      developer_msg: error.message,
    });
  }
};

export const taskTimeGapWiseSenderOnWhatsapp = async (req) => {
  try {
    const { a_application_login_id, company_masters_id } = req.body;
    const todayDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const todayDateTimeAfter15Minutes = moment().add(15, "minutes").format("YYYY-MM-DD HH:mm:ss");
    const todayDateTimeBefore15Minutes = moment().subtract(1440, "minutes").format("YYYY-MM-DD HH:mm:ss");
    const taskManagementModelIntance = taskManagementModel(req.tenantDB);
    const contactModelInstance = contactModel(req.tenantDB);
    const getTaskDb = await taskManagementModelIntance.findAll(
      {
        where: {
          isDelete: '0',
          is_archive: '0',
          task_type: '5',
          status: '-3',
          is_notification_sand_wp: '1',
          is_not_visible: '0',
          contact_masters_id: { [Op.ne]: '0' },
          task_fromdate: {
            [Op.gt]: todayDateTimeBefore15Minutes,
            [Op.lt]: todayDateTimeAfter15Minutes
          }
        },
        raw: true,
        attributes: ["task_title", "contact_masters_id", "task_remark", "id", "task_attechment", "assigned_team_member", "grouped_task_unque_key", "template_seq_no"]
      }
    )
    function normalizeIndiaPrefixMinimal(rawNumber) {
      if (!rawNumber) return rawNumber;
      const digits = rawNumber.replace(/\D/g, '');
      return digits.length === 10 ? `91${digits}` : digits;
    }
    if (isValid(getTaskDb)) {
      let taskSendMessageTaskIdsList = [];
      let taskSendMessageTaskIdsListObj = [];
      const response = await Promise.all(
        getTaskDb.map(async (v) => {
          const getContactNumberDb = await contactModelInstance.findOne(
            {
              where: {
                isDelete: '0',
                id: v.contact_masters_id,
              },
              raw: true,
              attributes: ["mobile_number"]
            }
          )

          try {
            req.body.sessionName = `a${v.assigned_team_member}_c${company_masters_id}`;
            req.body.numbers = normalizeIndiaPrefixMinimal(getContactNumberDb.mobile_number);
            req.body.mediaUrls = `${TASK_ATTEECHMENT_VIEW}${v.task_attechment}`;
            req.body.caption = `${v.task_remark}`;
            req.body.text = `${v.task_remark}`;
            req.body.tskId = `${v.id}`;
            const response = await taskSendWhatsappMessages(req)
            taskSendMessageTaskIdsList.push(v.id);
            taskSendMessageTaskIdsListObj.push({ id: v.id, grouped_task_unque_key: v.grouped_task_unque_key, template_seq_no: v.template_seq_no });
            return resSuccess({
              ack: 1,
              data: { response: response.data },
              developer_msg: "Message sent to whatsapp successfully",
            });
          } catch (error) {
            console.log("Failed to send message using WPPConnect: ", error?.response?.data?.error || error?.response?.data?.message);
            return resError({
              data: { error: error?.response?.data?.error || error?.response?.data?.message },
              developer_msg: "WhatsApp is not connected",
            });
          }
        })
      );
      if (isValid(taskSendMessageTaskIdsList)) {
        await taskManagementModelIntance.update({ status: '-6', is_archive: '1' }, { where: { id: taskSendMessageTaskIdsList } })
        for (let i = 0; i < taskSendMessageTaskIdsListObj.length; i++) {
          const v = taskSendMessageTaskIdsListObj[i];
          const { id, grouped_task_unque_key, template_seq_no } = v;
          const record = await taskManagementModelIntance.findOne({
            where: {
              isDelete: 0,
              id: { [Op.ne]: id },
              grouped_task_unque_key: grouped_task_unque_key,
              template_seq_no: {
                [Op.gte]: template_seq_no
              }
            },
            order: [["template_seq_no", "ASC"]]
          });

          if (record) {
            await record.update({
              is_not_visible: 0
            });
          }
        }
      }
      return resSuccess({
        ack: 1,
        data: { response: response },
        developer_msg: "Message sent to whatsapp successfully",
      });
    } else {
      return resError({
        ack_msg: "No task found to be send whatsapp message.",
        developer_msg: "no task found in resource data based on condition",
      });
    }
  } catch (error) {
    console.log("taskTimeGapWiseSenderOnWhatsapp Error", error);
    return resError({
      ack_msg: "Unexpected error occurred during send task on whatsapp.",
      developer_msg: error.message,
    });
  }
}

export const generateDueTaskPdfandSendMail = async (req) => {
  try {
    const { a_application_login_id } = req.body;
    if (!a_application_login_id) {
      return resBadRequest({
        ack_msg: "Missing a_application_login_id or contact_master_id",
      });
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (!findCompanyId) {
      return resBadRequest({ ack_msg: "Company not found for this login ID" });
    }
    const companyData = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: "0",
      },
      attributes: ["id", "company_name", "address", "company_contact", "company_email", "gst_number", "footer_img", "currency_id", "company_logo", "a_application_login_id"],
    });

    const taskManagementModelInstance = taskManagementModel(req.tenantDB);
    const currentDate = moment().format("YYYY-MM-DD");
    const getDueTaskDb = await taskManagementModelInstance.findAll({
      where: {
        isDelete: '0',
        // task_enddate: { [Op.lte]: currentDate },
        status: { [Op.ne]: -6 },
        is_archive: 0,
        task_template: 0,
        is_not_visible: 0,
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn('DATE', Sequelize.col('task_enddate')),
            {
              [Op.lte]: currentDate
            }
          )
        ]
      },
      raw: true,
      attributes: ["id", "task_title", "task_remark", "status", "assigned_team_member", "task_fromdate", "task_enddate", [Sequelize.literal(`DATEDIFF('${currentDate}', task_fromdate)`), 'due_days']]
    });
    const stagestatusModelInstance = stagestatusModel(req.tenantDB);
    let activeTeamList;
    let activeTeamMap;
    if (getDueTaskDb) {
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
    const teamWiseTaskMap = {};

    for (const v of getDueTaskDb) {

      const status_name = await stagestatusModelInstance.findOne({
        where: { isDelete: '0', id: v.status, order_type: '8' },
        raw: true,
        attributes: ["name", "color"]
      });

      const teamIds = v.assigned_team_member.split(",").map(id => Number(id));

      const task_fromdate = moment(v.task_fromdate).format("DD-MM-YYYY");
      const task_enddate = moment(v.task_enddate).format("DD-MM-YYYY");

      for (const memberId of teamIds) {

        const memberName = activeTeamMap.get(memberId);
        if (!memberName) continue;

        if (!teamWiseTaskMap[memberId]) {
          teamWiseTaskMap[memberId] = {
            team_name: memberName,
            tasks: []
          };
        }

        teamWiseTaskMap[memberId].tasks.push({
          ...v,
          id: `#${v.id}`,
          status_name: status_name?.name || "",
          status_color: status_name?.color || "",
          assinged_to_names: memberName,
          task_fromdate,
          task_enddate,
        });
      }
    }

    const teamWiseTaskList = Object.values(teamWiseTaskMap);
    // const dueTaskList = await Promise.all(
    //   getDueTaskDb.map(async (v) => {
    //     const taskId = `#${v.id}`;
    //     const status_name = await stagestatusModelInstance.findOne({ where: { isDelete: '0', id: v.status, order_type: '8' }, raw: true, attributes: ["name", "color"] });
    //     const teamIds = v.assigned_team_member.split(",").map(v => v);
    //     const assignedNameList = teamIds.map(id => activeTeamMap.get(Number(id))).filter(Boolean).join(', ');
    //     const task_fromdate = moment(v.task_fromdate).format("DD-MM-YYYY");
    //     const task_enddate = moment(v.task_enddate).format("DD-MM-YYYY");
    //     return {
    //       ...v,
    //       id: taskId,
    //       status_name: status_name?.name || "",
    //       status_color: status_name?.color || "",
    //       assinged_to_names: assignedNameList || "",
    //       task_fromdate,
    //       task_enddate,
    //     }
    //   })
    // );
    let dynamicPrintView = 1;
    const htmlTemplate = fs.readFileSync(
      path.join(
        __dirnameConstant,
        `../views/task/dueTaskListViewV${dynamicPrintView}.ejs`
      ),
      "utf-8"
    );

    const renderedHtml = await ejs.render(htmlTemplate,
      {
        companyData,
        teamWiseTaskList,
        currentDate: moment(currentDate).format("DD-MM-YYYY")
      });

    const uploadDir = path.resolve(
      __dirnameConstant,
      `../../media-folder/task_cron/${companyData.id.toString()}`
    );

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const options = {
      format: "A4",
      orientation: "landscape",
      border: "15mm",
      footer: {
        height: "5mm",
        contents: {
          default: `<span style="color: #444;">{{page}}</span>/<span>{{pages}}</span>`,
        },
      },
    };

    const file_name = generateFileName("due_task_mail_data")
    const filePath = path.join(uploadDir, `${file_name}.pdf`);
    const pdfPath = `${companyData.id.toString()}/${file_name}.pdf`;

    const document = {
      html: renderedHtml,
      data: {},
      path: filePath,
      type: "",
    };

    const fileLinkPath = PDF_LINK_EXTENDED_TASK_CRONE + pdfPath;

    await pdf.create(document, options);

    if (!fs.existsSync(filePath)) {
      console.error("PDF file was not created at:", filePath);
      return resBadRequest({ ack_msg: "Failed to generate PDF file" });
    }

    const stats = await fs.promises.stat(filePath);
    const pdfBuffer = fs.readFileSync(filePath);

    const pdfBufferValue = {
      type: 'pdf',
      buffer: pdfBuffer,
      filename: `${file_name}.pdf`,
      contentType: 'application/pdf',
      contentLength: stats.size,
      filePath: filePath
    };

    const transporter = nodemailer.createTransport({
      host: MAIL_SETTING_HOST_NAME,
      port: MAIL_SETTING_HOST_PORT,
      secure: true,
      auth: {
        user: MAIL_SETTING_HOST_USER_NAME,
        pass: MAIL_SETTING_HOST_USER_PASSWORD,
      },
    });

    try {
      await transporter.verify();

      const mailOptionsAdmin = {
        from: MAIL_SETTING_HOST_USER_NAME,
        to: companyData.company_email,
        subject: "Daily Pending task",
        text: "Please find attached your daily pending tasks.",
        attachments: [
          {
            filename: pdfBufferValue.filename,
            content: pdfBufferValue.buffer,
            contentType: pdfBufferValue.contentType,
          },
        ],
      };

      const info = await transporter.sendMail(mailOptionsAdmin);

      if (info.accepted && info.accepted.length > 0) {
        return resSuccess({
          ack_msg: "Email sent successfully",
          data: {
            messageId: info.messageId,
            accepted: info.accepted,
            success: true,
          }
        });
      }

      return resBadRequest({
        ack_msg: "Email was rejected by server",
        data: {
          success: false,
          rejected: info.rejected
        }
      });

    } catch (err) {
      console.log("Error with email transport or sending:", err);
    } finally {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    }

    return resSuccess({
      ack_msg: "Pdf generated",
      data: fileLinkPath,
    });
  } catch (error) {
    console.error("generateDueTaskPdfandSendMail error", error);
    return resBadRequest({ developer_msg: `error ${error}` });
  }
}

export const taskTimeGapWiseSenderOnEmail = async (req) => {
  try {
    const { a_application_login_id, company_masters_id } = req.body;
    const todayDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const todayDateTimeAfter15Minutes = moment().add(15, "minutes").format("YYYY-MM-DD HH:mm:ss");
    const todayDateTimeBefore15Minutes = moment().subtract(15, "minutes").format("YYYY-MM-DD HH:mm:ss");
    const taskManagementModelIntance = taskManagementModel(req.tenantDB);
    const contactModelInstance = contactModel(req.tenantDB);
    const getTaskDb = await taskManagementModelIntance.findAll(
      {
        where: {
          isDelete: '0',
          is_archive: '0',
          task_type: '5',
          status: '-3',
          is_not_visible: '0',
          is_notification_sand_email: '1',
          contact_masters_id: { [Op.ne]: '0' },
          task_fromdate: {
            [Op.gt]: todayDateTimeBefore15Minutes,
            [Op.lt]: todayDateTimeAfter15Minutes
          }
        },
        raw: true,
        attributes: ["task_title", "contact_masters_id", "task_remark", "id", "task_attechment", "assigned_team_member", "grouped_task_unque_key", "template_seq_no"]
      }
    )
    let getContactWithValidEmailDb;
    let activeContactMap;
    let activeTeamList;
    let activeTeamMap;
    if (isValid(getTaskDb)) {

      /* -------- Contact Get ---------- */
      getContactWithValidEmailDb = await contactModelInstance.findAll(
        {
          where: {
            isDelete: 0,
            email_id: {
              [Op.ne]: ''
            }
          },
          attributes: ["email_id", "id"]
        });
      activeContactMap = new Map(
        getContactWithValidEmailDb.map(con => [con.id, con.email_id])
      );

      /* -------- Get Application Login --------- */
      activeTeamList = await loginModel.findAll(
        {
          where: {
            id: {
              [Op.in]: Sequelize.literal(`(
                      SELECT a_application_login_id
                      FROM company_vs_application_logins
                      WHERE isDelete=0 AND company_masters_id = '${company_masters_id}'
                    )`)
            },
            isDelete: 0,
            host_out_going_mail: { [Op.ne]: '' },
            port_mail_setup: { [Op.ne]: '' },
            mail_id_setup: { [Op.ne]: '' },
            password_mail_setup: { [Op.ne]: '' },
          },
          attributes: ["host_out_going_mail", "port_mail_setup", "mail_id_setup", "password_mail_setup", "id"],
          raw: true
        }
      );
      activeTeamMap = new Map(activeTeamList.map(user => [user.id, user]));

      let taskSendMessageTaskIdsList = [];
      let taskSendMessageTaskIdsListObj = [];
      const response = await Promise.all(
        getTaskDb.map(async (v) => {
          const contact_email_address = activeContactMap.get(Number(v.contact_masters_id)) || null;
          const salesMailConfigDetail = activeTeamMap.get(Number(v.assigned_team_member)) || null;
          /* ---- Email Setup For Sending Mail Added by Dinesh -- 13-02-2026 */
          const transporter = nodemailer.createTransport({
            host: salesMailConfigDetail.host_out_going_mail,
            port: salesMailConfigDetail.port_mail_setup,
            secure: true,
            auth: {
              user: salesMailConfigDetail.mail_id_setup,
              pass: salesMailConfigDetail.password_mail_setup,
            },
          });

          try {
            await transporter.verify();

            const mailOptionsAdmin = {
              from: salesMailConfigDetail.mail_id_setup,
              to: contact_email_address,
              subject: v.task_title,
              html: v.task_remark
            };

            if (isValid(v.task_attechment)) {
              let attachmentValue;
              const filePath = path.join(
                process.cwd(),
                "media-folder",
                "task_attechment",
                v.task_attechment
              );

              if (fs.existsSync(filePath)) {
                const stats = await fs.promises.stat(filePath);

                const fileExtension = path.extname(filePath); // .pdf / .jpg
                const baseName = path.basename(filePath);     // original name
                const mimeType = mime.lookup(filePath) || "application/octet-stream";

                attachmentValue = {
                  type: fileExtension.replace(".", ""),   // dynamic type
                  buffer: fs.readFileSync(filePath),
                  filename: baseName,                     // dynamic filename
                  contentType: mimeType,                  // dynamic content type
                  contentLength: stats.size,
                  filePath: filePath
                };
              }
              mailOptionsAdmin.attachments = [
                {
                  filename: attachmentValue.filename,
                  content: attachmentValue.buffer,
                  contentType: attachmentValue.contentType,
                },
              ]
            }
            const info = await transporter.sendMail(mailOptionsAdmin);

            if (info.accepted && info.accepted.length > 0) {
              taskSendMessageTaskIdsList.push(v.id);
              taskSendMessageTaskIdsListObj.push({ id: v.id, grouped_task_unque_key: v.grouped_task_unque_key, template_seq_no: v.template_seq_no });
              return resSuccess({
                ack_msg: "Email sent successfully",
                data: {
                  messageId: info.messageId,
                  accepted: info.accepted,
                  success: true,
                }
              });
            }

          } catch (err) {
            console.log("taskTimeGapWiseSenderOnEmail Error with email transport or sending:", err);
            return resError({
              data: err.message
            });
          }
          /* ---- Email Setup For Sending Mail Added by Dinesh -- 13-02-2026 */
        })
      );
      if (isValid(taskSendMessageTaskIdsList)) {
        await taskManagementModelIntance.update({ status: '-6', is_archive: '1' }, { where: { id: taskSendMessageTaskIdsList } })
        for (let i = 0; i < taskSendMessageTaskIdsListObj.length; i++) {
          const v = taskSendMessageTaskIdsListObj[i];
          const { id, grouped_task_unque_key, template_seq_no } = v;
          const record = await taskManagementModelIntance.findOne({
            where: {
              isDelete: 0,
              id: { [Op.ne]: id },
              grouped_task_unque_key: grouped_task_unque_key,
              template_seq_no: {
                [Op.gte]: template_seq_no
              }
            },
            order: [["template_seq_no", "ASC"]]
          });

          if (record) {
            await record.update({
              is_not_visible: 0
            });
          }
        }
      }
      return resSuccess({
        ack: 1,
        data: { response: response },
        developer_msg: "Message sent to mail successfully",
      });
    } else {
      return resError({
        ack_msg: "No task found to be send Mail message.",
        developer_msg: "no task found in resource data based on condition",
      });
    }
  } catch (error) {
    console.log("taskTimeGapWiseSenderOnEmail Error", error);
    return resError({
      ack_msg: "Unexpected error occurred during send task on email.",
      developer_msg: error.message,
    });
  }
}

export const generateTaskSampleSheet = async (req) => {
  try {
    const { a_application_login_id } = req.body;
    const companyDetail = await getCompanyByLoginId(a_application_login_id);

    const fileName = `sample_task_sheet_${randomUUID()}`;
    const format = 'xlsx'
    const cols = null;
    const headersObj = null;
    const outputDir = `media-folder/exports/task/${companyDetail.company_masters_id}`;
    const uploadDir = path.resolve(process.cwd(), outputDir);

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const customFormFieldModelIntance = customFieldFormModel(req.tenantDB);

    /** Fetch dynamic custom fields **/
    // const getCustomFormFieldR = await customFormFieldModelIntance.findAll({
    //   where: { form_type: 4, isDelete: 0 },
    //   attributes: ["title", "reference_column_name"],
    //   raw: true,
    // });

    // const getCustomFormFieldObj = Array.isArray(getCustomFormFieldR)
    //   ? getCustomFormFieldR.reduce((acc, { reference_column_name, title }) => {
    //     acc[title] = '';
    //     return acc;
    //   }, {})
    //   : {};

    /** Default fields **/


    const excelColumnDefineArray = {
      "task_title": "DEMO Task",
      "task_category_id": "DEMO Category",
      "task_priority": "High",
      "task_type": "once",
      "task_fromdate": "01-01-2026 09:03:03",
      "task_enddate": "02-01-2026 13:03:03",
      "task_remark": "Demo Remark",
      "assigned_team_member": "DEMO Team Mamber One,Team Mamber Two",
      "is_notification_sand_wp": "No",
      "is_notification_sand_email": "Yes",
      "is_task_groups_or_individual": "1",
      "selected_task_days": "Monday,Tuesday,Wednesday",
      "task_selected_date": "10-01-2026",
    };

    /** Merge dynamic fields **/
    const excelColumnDefineArrayDy = {
      ...excelColumnDefineArray,
      // ...getCustomFormFieldObj,
    };

    const data = [excelColumnDefineArrayDy]; // One row sample


    const colorColumns = {
      task_title: "FFFF0000",
      task_category_id: "FFFF0000",
      task_priority: "FFFF0000",
      task_type: "FFFF0000",
      task_fromdate: "FFFF0000",
      task_enddate: "FFFF0000",
      assigned_team_member: "FFFF0000",
      is_notification_sand_wp: "FFFF0000",
      is_notification_sand_email: "FFFF0000",
      is_task_groups_or_individual: "FFFF0000",
    };

    /** Export Excel File **/
    const savedPath = await exportData(data, { format, fileName, columns: cols, headers: headersObj, autoDownload: false, outputDir: uploadDir, colorColumns });


    const fileUrl = `${EXPORTS_LINK_EXTENDED}task/${companyDetail.company_masters_id}/${savedPath.file_name}`;

    return resSuccess({
      data: { fileUrl, fileName: savedPath.file_name },
    });
  } catch (error) {
    console.error("generateTaskSampleSheet Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
}

export const createCustomerSupportTicket = async (req, res) => {
  try {

    const { company_id, a_application_login_id, task_title, task_remark, task_category_id, user_name, phone_number } = req.body;
    /** ---------------------------------------------------------
     * 1. Validate Company vs Login
     ----------------------------------------------------------*/
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);

    const companyLoginCheck = await companyVsApplicationLoginModel.findOne({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        a_application_login_id: a_application_login_id,
        isDelete: 0
      }
    });

    if (!companyLoginCheck) {
      return resError({
        ack_msg: "Invalid Company or Login"
      });
    }

    /** ---------------------------------------------------------
     * 2. Get Company Owner Login (company_flag = 1)
     ----------------------------------------------------------*/
    const companyOwnerList = await companyVsApplicationLoginModel.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        company_flag: 1,
        isDelete: 0
      },
      attributes: ["a_application_login_id"]
    });

    if (!companyOwnerList.length) {
      return resError({
        ack_msg: "Company Owner Not Found"
      });
    }

    const ownerLoginId = companyOwnerList[0].a_application_login_id;

    const getCompanyName = await companyModel.findOne({
      where: {
        id: findCompanyId.company_masters_id,
        isDelete: 0
      },
      attributes: ["a_application_login_id", "company_name"]
    });

    if (!companyOwnerList.length) {
      return resError({
        ack_msg: "Company Owner Not Found"
      });
    }

    /** ---------------------------------------------------------
     * 3. Get Login Details
     ----------------------------------------------------------*/
    const loginData = await loginModel.findOne({
      where: {
        id: ownerLoginId,
        isDelete: 0
      },
      attributes: ["recovery_mobile", "username"]
    });

    if (!loginData) {
      return resError({
        ack_msg: "Login user not found"
      });
    }

    const recoveryMobile = loginData.recovery_mobile;
    const username = loginData.username;

    const supportTicketCreatorName = await loginModel.findOne({
      where: {
        id: a_application_login_id,
        isDelete: 0
      },
      attributes: ["recovery_mobile", "username"]
    });
    /** ---------------------------------------------------------
     * 4. Get Tenant DB
     ----------------------------------------------------------*/
    const tenantDBFind = await tenantMasterModel.findOne({
      where: {
        isDelete: 0,
        db_name: WEBSITE_LEAD_HANDLE_DB_NAME
      },
      attributes: ["a_application_login_id", "company_masters_id"]
    });

    if (!tenantDBFind) {
      return resError({ ack_msg: "Tenant Not Found" });
    }

    const tenantDB = (
      await getTenantDB(
        tenantDBFind.a_application_login_id,
        tenantDBFind.company_masters_id
      )
    ).sequelize;

    /** ---------------------------------------------------------
* TIME VALIDATION 
----------------------------------------------------------*/
    const timeRange = CUSTOMER_SUPPORT_TICKET_TIME_RANGE.split(",");

    const startTimeStr = timeRange[0];
    const endTimeStr = timeRange[1];

    const current = moment();

    const startTime = moment(startTimeStr, "HH:mm:ss");
    const endTime = moment(endTimeStr, "HH:mm:ss");

    const todayStart = moment().set({
      hour: startTime.hour(),
      minute: startTime.minute(),
      second: startTime.second()
    });

    const todayEnd = moment().set({
      hour: endTime.hour(),
      minute: endTime.minute(),
      second: endTime.second()
    });

    const formattedStart = moment(startTimeStr, "HH:mm:ss").format("h A");
    const formattedEnd = moment(endTimeStr, "HH:mm:ss").format("h A");

    if (!current.isBetween(todayStart, todayEnd, null, "[]")) {
      return resError({
        ack_msg: `Tickets allowed only between ${formattedStart} to ${formattedEnd}`
      });
    }

    /** ---------------------------------------------------------
  * DAILY LIMIT VALIDATION
  ----------------------------------------------------------*/

    // Step 1: Get limit from ENV
    const dailyLimit = CUSTOMER_SUPPORT_TICKET_MAX_COUNT;
    console.log("jjjjjjjjjjjjjjjjj", dailyLimit)
    const startOfDay = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const endOfDay = moment().endOf("day").format("YYYY-MM-DD HH:mm:ss");

    if (dailyLimit > 0) {
      const TaskModel = taskManagementModel(tenantDB);
      const todayCount = await TaskModel.count({
        where: {
          customer_company_id: findCompanyId.company_masters_id,
          is_support_ticket: 1,
          isDelete: 0,
          created_date_time: {
            [Op.between]: [startOfDay, endOfDay]
          }
        }
      });
      console.log("hhhhhhhhhhhhh", todayCount)
      if (todayCount >= dailyLimit) {
        return resError({
          ack_msg: `You can only create ${dailyLimit} tickets per day`
        });
      }
    }



    /** ---------------------------------------------------------
     * 5. Find or Create Contact
     ----------------------------------------------------------*/
    const ContactModel = contactModel(tenantDB);

    let contactId = null;
    const targetMobile = recoveryMobile || phone_number || "";
    const normalizedMobile = normalizeToTenDigit(targetMobile);
    const rawMobile = targetMobile ? String(targetMobile).trim() : "";

    const mobileConditions = [];
    if (normalizedMobile) {
      mobileConditions.push({ mobile_number: normalizedMobile });
      mobileConditions.push({ raw_mobile_number: normalizedMobile });
    }
    if (rawMobile) {
      mobileConditions.push({ mobile_number: rawMobile });
      mobileConditions.push({ raw_mobile_number: rawMobile });
    }
    if (normalizedMobile && normalizedMobile.startsWith("91") && normalizedMobile.length === 12) {
      const tenDigit = normalizedMobile.slice(2);
      mobileConditions.push({ mobile_number: tenDigit });
      mobileConditions.push({ raw_mobile_number: tenDigit });
    }

    let contactData = null;
    if (mobileConditions.length > 0) {
      contactData = await ContactModel.findOne({
        where: {
          [Op.or]: mobileConditions,
          company_masters_id: tenantDBFind.company_masters_id,
          isDelete: 0
        },
        attributes: ["id"]
      });
    }

    if (contactData) {

      contactId = contactData.id;

    } else {

      const newContact = await ContactModel.create({
        person_name: username || user_name || "unknown",
        company_name: getCompanyName?.company_name || "",
        mobile_number: normalizedMobile || rawMobile || "",
        raw_mobile_number: rawMobile || "",
        contact_status: -1,
        company_masters_id: tenantDBFind.company_masters_id,
        a_application_login_id: tenantDBFind.a_application_login_id,
        assinged_to_work_a_application_id: WBSITE_LEAD_ASSIGN_ID,
        created_date_time: moment().format("YYYY-MM-DD HH:mm:ss")
      });

      contactId = newContact.id;

    }

    /** ---------------------------------------------------------
     * 6. Handle Attachment
     ----------------------------------------------------------*/
    const task_attechment = req.files?.task_attechment?.[0];
    let attachmentPath = null;

    if (task_attechment) {
      const fileName = path.basename(task_attechment.path);

      const directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "task_attechment",
        tenantDBFind.company_masters_id.toString()
      );

      await fs.mkdir(directoryPath, { recursive: true });

      const destinationPath = path.join(directoryPath, fileName);

      await fs.move(task_attechment.path, destinationPath, {
        overwrite: true,
      });

      attachmentPath = `${tenantDBFind.company_masters_id}/${fileName}`;
    }


    /** ---------------------------------------------------------
     * 7. Create Task
     ----------------------------------------------------------*/
    const TaskModel = taskManagementModel(tenantDB);
    const now = moment();
    const taskFromdate = now.startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const taskEnddate = now.endOf("day").format("YYYY-MM-DD HH:mm:ss");
    let getUserCreatorDetails = "";

    if (user_name) {
      getUserCreatorDetails += `<br/><b>Name:</b> ${user_name}`;
    }

    if (phone_number) {
      getUserCreatorDetails += `<br/><b>Phone Number:</b> ${phone_number}`;
    }
    const taskPayload = {
      task_title: task_title,
      task_remark: task_remark + getUserCreatorDetails,
      is_support_ticket: 1,
      task_fromdate: taskFromdate,
      task_enddate: taskEnddate,
      contact_masters_id: contactId,
      assigned_team_member: CUSTOMER_SUPPORT_TICKET_ASSING_ID,
      a_application_login_id: tenantDBFind.a_application_login_id,
      company_masters_id: tenantDBFind.company_masters_id,
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      task_type: 5,
      task_priority: 4,
      task_category_id: task_category_id,
      status: -3,
      external_status: -14,
      team_task_assignement_type: 1,
      customer_application_login_id: a_application_login_id,
      customer_company_id: findCompanyId.company_masters_id,
      task_attechment: attachmentPath || ""
    };

    const newTask = await TaskModel.create(taskPayload);

    if (newTask) {
      const getassginId = CUSTOMER_SUPPORT_TICKET_ASSING_ID.split(",")
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */
      req.headers["x-tenant-id"] = getassginId[0];
      await new Promise((resolve, reject) => {
        tenantMiddleware(req, res, (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
      await insertStagesAndStatusLogs(req,
        {
          reference_table: "task_managements",
          reference_id: newTask.id,
          status_id: "-14",
          a_application_login_id: getassginId[0]
        }
      )
      /* Status Log Entry Added BY Dinesh -> 20-11-2025 */

      if (CUSTOMER_SUPPORT_TICKET_ASSING_ID) {
        const assignedMemberIds = CUSTOMER_SUPPORT_TICKET_ASSING_ID.split(",").map((id) => id.trim());

        // Fetch usernames and tokens for all assigned members
        const assignedMembers = await loginModel.findAll({
          where: {
            id: assignedMemberIds,
            isDelete: 0,
          },
          attributes: ["id", "username", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
        });

        // Collect all device tokens
        const allTokens = assignedMembers
          .flatMap((member) => [
            member.web_refresh_token,
            member.android_refresh_token,
            member.ios_refresh_token,
          ])
          .filter((token) => token && token.trim() !== "");

        const uniqueTokens = [...new Set(allTokens)];

        if (uniqueTokens.length > 0) {
          try {
            // Get the assigner's username
            const assigner = await loginModel.findOne({
              where: {
                id: a_application_login_id,
                isDelete: 0,
              },
              attributes: ["username"],
            });

            const assignerName = assigner?.username || "Someone";

            // Send notifications to all assigned members
            await sendMultipleNotification({
              deviceTokens: uniqueTokens,
              title: `Ticket number ${newTask.id}... From ${getCompanyName.company_name}... Please Check`,
              body: `Ticket: ${task_title}`,
              notification_modual: "customer_support_ticket_create"
            });
          } catch (notificationError) {
            req.logger.error("Notification failed (non-critical):", notificationError.message);
          }
        } else {
          req.logger.info("No device tokens found for assigned team members.");
        }
      }
    }

    /** ---------------------------------------------------------
     * 8. Insert Task Message History
     ----------------------------------------------------------*/
    const TaskMessageModel = taskMessageHistroyModel(tenantDB);
    const attachmentBlock = attachmentPath
      ? `
    <strong>Attachment:</strong> 
    <a href="${TASK_ATTEECHMENT_VIEW}${attachmentPath}" target="_blank">View Attachment</a><br>
  `
      : "";
    console.log("attachmentPathattachmentPath", attachmentPath);

    const currentDateTime = moment().format("DD-MM-YYYY HH:mm:ss")
    await TaskMessageModel.create({
      task_id: newTask.id,
      a_application_login_id: newTask.a_application_login_id,
      company_masters_id: newTask.company_masters_id,
      description: `
        <strong>Support Ticket Created</strong><br>
        <strong>Company Name:</strong> ${getCompanyName.company_name}<br>
        <strong>Company Owner Name:</strong> ${username}<br>
        <strong>Company Owner Mobile No.:</strong> ${recoveryMobile}<br>
        <strong>Support Ticket Created Name:</strong> ${supportTicketCreatorName.username}<br>
        <strong>Support Ticket Created Mobile No.:</strong> ${supportTicketCreatorName.recovery_mobile}<br>
        <strong>Issue Title:</strong> ${newTask.task_title}<br>
        <strong>Issue Remark:</strong> ${newTask.task_remark}<br>
        <strong>Created Date Time:</strong> ${currentDateTime}<br>
        ${attachmentBlock}
      `,
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
      message_side: "2",
      message_type_id: "0"
    });

    /** ---------------------------------------------------------
     * 9. Success Response
     ----------------------------------------------------------*/
    return resSuccess({
      data: { item: newTask.id },
      ack_msg: "Support Ticket Created Successfully"
    });

  } catch (error) {

    console.log("createCustomerSupportTicket error", error);

    return resBadRequest({
      ack_msg: "Error",
      developer_msg: error.message
    });

  }
};

export const AllSupportTicketGet = async (req, res) => {
  try {

    const {
      ul,
      ll,
      company_id,
      a_application_login_id,
      searchTerm,
      statusFilter,
      statusFilterComan,
      priorityFilter,
      startDate,
      endDate,
      taskCategoryFilter,
      selectedLabelId
    } = req.body;

    const limit = Number(ll) || 10;
    const offset = Number(ul) || 0;

    /** ---------------- TENANT DB ---------------- */
    const tenantDBFind = await tenantMasterModel.findOne({
      where: {
        isDelete: 0,
        db_name: WEBSITE_LEAD_HANDLE_DB_NAME
      },
      attributes: ["a_application_login_id", "company_masters_id"]
    });

    if (!tenantDBFind) {
      return resError({ ack_msg: "Tenant Not Found" });
    }

    const tenantDB = (
      await getTenantDB(
        tenantDBFind.a_application_login_id,
        tenantDBFind.company_masters_id
      )
    ).sequelize;

    /** ---------------- MODELS ---------------- */
    const TaskModel = taskManagementModel(tenantDB);
    const TaskCategoryModel = taskCategoryModel(tenantDB);
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    /** ---------------- WHERE ---------------- */
    let whereClause = {
      customer_company_id: findCompanyId.company_masters_id,
      is_support_ticket: "1",
      isDelete: "0",
      external_status: {
        [Op.and]: {
          [Op.ne]: null,
          [Op.ne]: ""
        }
      }
    };
    if (findCompanyId.company_flag !== 1) {
      whereClause.customer_application_login_id = a_application_login_id;
    }
    // STATUS
    if (Array.isArray(statusFilterComan) && statusFilterComan.length > 0) {
      whereClause.status = { [Op.in]: statusFilterComan };
    } else if (statusFilter) {
      whereClause.status = statusFilter;
    }

    // PRIORITY
    if (priorityFilter) {
      whereClause.task_priority = priorityFilter;
    }

    // CATEGORY
    if (taskCategoryFilter) {
      whereClause.task_category_id = taskCategoryFilter;
    }

    // LABEL
    if (selectedLabelId) {
      whereClause = {
        [Op.and]: [
          whereClause,
          Sequelize.literal(`FIND_IN_SET(${selectedLabelId}, label_id)`)
        ]
      };
    }

    // DATE
    // DATE (ENV + USER FILTER MERGE)
    const envDate = CUSTOMER_SUPPORT_TICKET_DATE_VIEW;
    const envStart = moment(envDate + " 00:00:00");

    let finalStart;
    let finalEnd;

    if (startDate && endDate) {
      const userStart = moment(startDate + " 00:00:00");

      finalStart = moment.max(userStart, envStart);

      finalEnd = moment(endDate + " 23:59:59");
    } else {

      finalStart = envStart;
      finalEnd = moment().endOf("day");
    }

    whereClause.created_date_time = {
      [Op.between]: [
        finalStart.format("YYYY-MM-DD HH:mm:ss"),
        finalEnd.format("YYYY-MM-DD HH:mm:ss")
      ]
    };
    console.log("envDateenvDateenvDate", envDate)
    console.log("envStartenvStartenvStart", envStart)

    // SEARCH
    if (searchTerm && searchTerm !== "undefined") {
      whereClause = {
        [Op.and]: [
          whereClause,
          {
            [Op.or]: [
              { task_title: { [Op.like]: `%${searchTerm}%` } },
              { task_remark: { [Op.like]: `%${searchTerm}%` } },
              { id: { [Op.like]: `%${searchTerm}%` } }
            ]
          }
        ]
      };
    }
    console.log("dddddddddddddddddddddddd", whereClause)
    /** ---------------- FETCH ---------------- */
    const tasks = await TaskModel.findAll({
      where: whereClause,
      limit,
      offset,
      order: [["created_date_time", "DESC"]],
      attributes: [
        "id",
        "task_title",
        "task_category_id",
        "task_attechment",
        "label_id",
        "task_fromdate",
        "task_enddate",
        "task_remark",
        "task_type",
        "status",
        "customer_company_id",
        "customer_application_login_id",
        "created_date_time",
        [Sequelize.literal(`(
          SELECT contact_masters.person_name
          FROM contact_masters
          WHERE contact_masters.id = task_managements.contact_masters_id
            AND contact_masters.isDelete = 0
        )`), "contact_person_name"],
        [Sequelize.literal(`(
          SELECT contact_masters.mobile_number
          FROM contact_masters
          WHERE contact_masters.id = task_managements.contact_masters_id
            AND contact_masters.isDelete = 0
        )`), "contact_person_number"],
        [
          Sequelize.literal(`(
            SELECT GROUP_CONCAT(lable_masters.lable_name)
            FROM lable_masters
            WHERE lable_masters.isDelete = 0
            AND FIND_IN_SET(lable_masters.id, task_managements.label_id)
          )`),
          "label_name"
        ],
        [
          Sequelize.literal(`(
            SELECT stage_status_masters.name
            FROM stage_status_masters
            WHERE stage_status_masters.id = task_managements.external_status
              AND stage_status_masters.isDelete = 0
              AND stage_status_masters.visibility = 1
            LIMIT 1
          )`),
          "status_name"
        ],
        [
          Sequelize.literal(`(
            SELECT stage_status_masters.color
            FROM stage_status_masters
            WHERE stage_status_masters.id = task_managements.external_status
              AND stage_status_masters.isDelete = 0
              AND stage_status_masters.visibility = 1
            LIMIT 1
          )`),
          "status_color"
        ]
      ],
      raw: true
    });
    console.log("taskstaskstaskstaskstasks", tasks);

    /** ---------------- CATEGORY MAP ---------------- */
    const categoryIds = [
      ...new Set(tasks.map(t => t.task_category_id).filter(Boolean))
    ];

    let categoryMap = new Map();

    if (categoryIds.length > 0) {
      const categories = await TaskCategoryModel.findAll({
        where: {
          id: { [Op.in]: categoryIds },
          isDelete: "0",
          visibility: "1"
        },
        attributes: ["id", "task_category_name", "task_color"],
        raw: true
      });

      categoryMap = new Map(categories.map(c => [c.id, c]));
    }

    /** ---------------- FINAL RESPONSE ---------------- */
    const finalData = tasks.map(task => {
      const category = categoryMap.get(task.task_category_id);
      let task_attechment_url = "";
      if (task.task_attechment) {
        task_attechment_url = `${TASK_ATTEECHMENT_VIEW}${task.task_attechment}`;
      }

      return {
        task_title: task.task_title,
        task_category_id: task.task_category_id,
        media_url: task_attechment_url,
        // label_name: task.label_name || "",
        status_name: task.status_name || "",
        status_color: task.status_color || "",
        category_name: category?.task_category_name || "",
        category_color: category?.task_color || "",
        customer_company_id: task.customer_company_id,
        customer_application_login_id: task.customer_application_login_id,
        contact_person_name: task.contact_person_name,
        contact_person_number: task.contact_person_number,
        // label_id: task.label_id,
        ids: task.id,
        task_fromdate: task.task_fromdate
          ? moment(task.task_fromdate).format("DD-MM-YYYY hh:mm A")
          : null,
        task_enddate: task.task_enddate
          ? moment(task.task_enddate).format("DD-MM-YYYY hh:mm A")
          : null,
        task_remark: task.task_remark,
        // task_type: task.task_type,
        status: task.status,
        created_date_time: task.created_date_time
          ? moment(task.created_date_time).format("DD-MM-YYYY hh:mm A")
          : null,
      };
    });

    /** ---------------- COUNT ---------------- */
    const total = await TaskModel.count({ where: whereClause });

    /** ---------------- RESPONSE ---------------- */
    return resSuccess({
      data: {
        item: finalData,
        total_count: total
      }
    });

  } catch (error) {
    console.error("AllSupportTicketGet error:", error);

    return resBadRequest({
      developer_msg: error.message
    });
  }
};

export const AllSupportTicketCategory = async (req, res) => {
  try {
    const { a_application_login_id } = req.body;
    /** ---------------- TENANT DB ---------------- */
    const tenantDBFind = await tenantMasterModel.findOne({
      where: {
        isDelete: 0,
        db_name: WEBSITE_LEAD_HANDLE_DB_NAME,
      },
      attributes: ["a_application_login_id", "company_masters_id"],
    });

    if (!tenantDBFind) {
      return res.status(404).json({
        ack: 0,
        msg: "Tenant Not Found",
      });
    }

    const tenantDB = (
      await getTenantDB(
        tenantDBFind.a_application_login_id,
        tenantDBFind.company_masters_id
      )
    ).sequelize;

    const TaskCategoryModel = taskCategoryModel(tenantDB);

    /** ---------------- FETCH CATEGORY ---------------- */
    const categories = await TaskCategoryModel.findAll({
      where: {
        isDelete: 0,
        visibility: 1, // (you wrote "vasiblity", assuming correct column is "visibility")
      },
      attributes:
        ["task_category_name", "id"],
      order: [["id", "ASC"]],
    });

    // return res.status(200).json({
    //   ack: 1,
    //   data: categories,
    // });

    return resSuccess({
      data: {
        item: categories
      }
    });

  } catch (error) {
    console.error("AllSupportTicketGetcatory error:", error);

    return resBadRequest({
      developer_msg: error.message
    });
  }
};

export const supportTicketMessageGet = async (req, res) => {
  try {
    const { reference_id } = req.body;

    if (!isValid(reference_id)) {
      return resError({
        ack_msg: "Invalid Request",
        developer_msg: "reference_id not found",
      });
    }

    const tenantDBFind = await tenantMasterModel.findOne({
      where: {
        isDelete: 0,
        db_name: WEBSITE_LEAD_HANDLE_DB_NAME,
      },
      attributes: ["a_application_login_id", "company_masters_id"],
    });

    if (!tenantDBFind) {
      return res.status(404).json({
        ack: 0,
        msg: "Tenant Not Found",
      });
    }

    const tenantDB = (
      await getTenantDB(
        tenantDBFind.a_application_login_id,
        tenantDBFind.company_masters_id
      )
    ).sequelize;

    const taskMessageHistroyModelIntance = taskMessageHistroyModel(tenantDB);

    const finalList = await taskMessageHistroyModelIntance.findAll({
      where: {
        isDelete: 0,
        task_id: reference_id,
        message_side: { [Op.in]: [2] }
      },
      raw: true,
      attributes: ["description", "created_date_time", "application_login_name", "media_url", "media_name", "message_side"],
    });

    const mappedList = finalList.map(item => {
      let attachment = null;
      if (item.media_url) {
        if (Number(item.message_side) === 1) {
          // attachment = `task_history_attachment/${item.media_url}`;
          attachment = `${CHAT_MESSAGE_IMG_LINK_EXTENDED}${item.media_url}`;
        } else {
          // attachment = `store_ticket_attachment/${item.media_url}`;
          attachment = `${CHAT_MESSAGE_IMG_LINK_EXTENDED}${item.media_url}`;
        }
      }
      return {
        ...item,
        attachment
      };
    });

    return resSuccess({
      data: mappedList,
    });
  } catch (error) {
    console.log("supportTicketMessageGet error", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};

export const supportTicketMessageCreate = async (req, res) => {
  try {

    const {
      reference_id,
      description,
      a_application_login_id
    } = req.body;

    if (!description?.trim() && !req.file) {
      return resError({
        ack_msg: "Please provide either a message description or an attachment.",
        developer_msg: "Both description and file are empty",
      });
    }

    const tenantDBFind = await tenantMasterModel.findOne({
      where: {
        isDelete: 0,
        db_name: WEBSITE_LEAD_HANDLE_DB_NAME,
      },
      attributes: ["a_application_login_id", "company_masters_id"],
    });

    if (!tenantDBFind) {
      return res.status(404).json({
        ack: 0,
        msg: "Tenant Not Found",
      });
    }

    const tenantDB = (
      await getTenantDB(
        tenantDBFind.a_application_login_id,
        tenantDBFind.company_masters_id
      )
    ).sequelize;

    const application_login_name = await loginModel.findOne({
      where: {
        id: a_application_login_id,
        isDelete: "0",
      },
      attributes: [
        "username"
      ],
    });

    let media_url = null;
    let media_name = null;
    if (req.file) {
      const findCompanyId = await getCompanyByLoginId(a_application_login_id);
      if (findCompanyId) {
        const company_id = tenantDBFind.company_masters_id.toString();
        const fileName = path.basename(req.file.path);
        const directoryPath = path.join(
          process.cwd(),
          "media-folder",
          "task_history_attachment",
          company_id
        );
        await fs.mkdirp(directoryPath);
        const destinationPath = path.join(directoryPath, fileName);
        await fs.move(req.file.path, destinationPath);

        media_url = `${company_id}/${fileName}`;
        media_name = req.file.originalname || fileName;
      }
    }

    const TaskMessageModel = taskMessageHistroyModel(tenantDB);
    const result = await TaskMessageModel.create({
      task_id: reference_id,
      a_application_login_id: a_application_login_id,
      description: description,
      message_side: 2,
      message_type_id: 0,
      is_reminder: 0,
      media_url: media_url || "",
      media_name: media_name || "",
      application_login_name: application_login_name.dataValues.username
    });

    /** ---------------------------------------------------------
     * 9. Success Response
     ----------------------------------------------------------*/
    return resSuccess({
      data: { item: result },
      // ack_msg: "Support Ticket Created Successfully"
    });

  } catch (error) {

    console.log("supportTicketMessageCreate error", error);

    return resBadRequest({
      ack_msg: "Error",
      developer_msg: error.message
    });

  }
};

export const clearDataWhatsappJobsTypeWise = async (req, res) => {
  try {
    const { whatsapp_dispatch_type, company_masters_id } = req.body;

    let whereClause = {
      isDelete: 0,
      status: { [Op.ne]: '-6' },
      task_fromdate: {
        [Op.gte]: moment().startOf("day").toDate(),
      },
    };

    if (whatsapp_dispatch_type == 1) {
      whereClause.is_notification_sand_wp = 1;
    } else if (whatsapp_dispatch_type == 2) {
      whereClause.is_notification_sand_email = 1;
    } else {
      return resError({
        ack_msg: "Invalid Request",
        developer_msg: "reference_id not found",
      });
    }

    const taskManagementModelIntance = taskManagementModel(req.tenantDB);
    const check = await taskManagementModelIntance.findOne({ where: whereClause });

    return resSuccess({
      data: { company_masters_id, whatsapp_dispatch_type, isClear: check ? false : true },
    });

  } catch (error) {
    console.log("clearDataWhatsappJobsTypeWise error", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};

export const assignReadUnreadTask = async (req) => {
  try {
    const { appliedFilers, updateCollection, appliedTo, a_application_login_id } = req.body;

    let type;
    if (updateCollection === '1' || updateCollection === 1) { // unread
      type = 'unread';
    } else if (updateCollection === '0' || updateCollection === 0) { // read
      type = 'read';
    } else {
      return resError({
        ack_msg: "Selected Data Not Found."
      });
    }

    let whereClause_e = {};

    if (appliedTo == "all") {
      appliedFilers.a_application_login_id = a_application_login_id; // important for permission
      const {
        whereClause, // Use the main whereClause from buildAllTaskWhere
        // You can destructure others if needed
      } = buildAllTaskWhere({
        ...appliedFilers,           // spread all filters
        companyId: req.companyId || appliedFilers.company_masters_id,
        loginId: a_application_login_id,
        // Add any other required params with defaults if needed
      });

      whereClause_e = whereClause;
    }
    else if (isValid(appliedTo)) {
      whereClause_e.id = appliedTo;
      whereClause_e.isDelete = 0;
    }
    else {
      return resBadRequest({
        ack_msg: "Something went wrong",
        developer_msg: `Invalid appliedTo`,
      });
    }

    const Task = taskManagementModel(req.tenantDB);

    const tasks = await Task.findAll({
      where: whereClause_e,
      attributes: ["id", "is_read_by_a_application_login_id"],
      raw: true
    });

    if (tasks.length === 0) {
      return resSuccess({
        ack_msg: "No tasks found to update."
      });
    }

    await Promise.all(
      tasks.map(async (task) => {
        let updateObj = {};
        const is_read_by_a_application_login_id_arr = task.is_read_by_a_application_login_id
          ? task.is_read_by_a_application_login_id.split(",")
          : [];

        const exists = is_read_by_a_application_login_id_arr.includes(String(a_application_login_id));

        if (type === 'unread') {
          // Remove current user from read list
          const filterArr = exists
            ? is_read_by_a_application_login_id_arr.filter(item => item !== String(a_application_login_id))
            : is_read_by_a_application_login_id_arr;

          updateObj.is_read_by_a_application_login_id = filterArr.join(",");
        }
        else if (type === 'read') {
          // Add current user to read list
          const filterArr = !exists
            ? [...is_read_by_a_application_login_id_arr, a_application_login_id]
            : is_read_by_a_application_login_id_arr;

          updateObj.is_read_by_a_application_login_id = filterArr.join(",");
        }

        return Task.update(updateObj, {
          where: { id: task.id },
          // You can add silent: true if you don't want updatedAt to change
        });
      })
    );

    return resSuccess({
      ack_msg: "Updated successfully."
    });

  } catch (error) {
    console.error("assignReadUnreadTask Error:", error);
    return resBadRequest({
      ack_msg: "Something went wrong",
      developer_msg: `Error: ${error.message}`,
    });
  }
};

export const getStickeyNotesData = async (req) => {
  try {
    const {
      a_application_login_id,
      task_category_id
    } = req.body;

    /* ================= COMPANY CHECK ================= */

    const findCompanyId = await getCompanyByLoginId(
      a_application_login_id
    );

    if (!findCompanyId?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found for a_application_login_id: ${a_application_login_id}`
      });
    }

    const companyId = findCompanyId.company_masters_id;

    const TaskModel = taskManagementModel(req.tenantDB);
    const TaskCategoryModel = taskCategoryModel(req.tenantDB);

    /* ================= CATEGORY IDS ================= */

    let categoryIds = [];

    if (task_category_id) {
      categoryIds = task_category_id
        .split(",")
        .map((id) => Number(id.trim()))
        .filter(Boolean);
    }

    /* ================= CATEGORY DATA ================= */

    const categoryList = await TaskCategoryModel.findAll({
      where: {
        id: {
          [Op.in]: categoryIds
        },
        isDelete: 0
      },
      attributes: [
        "id",
        "task_category_name",
        "task_color"
      ],
      raw: true
    });

    const categoryMap = new Map();

    categoryList.forEach((cat) => {
      categoryMap.set(cat.id, cat);
    });

    /* ================= TASK DATA ================= */

    const resultTasks = await TaskModel.findAll({
      where: {
        isDelete: 0,
        company_masters_id: companyId,
        a_application_login_id: a_application_login_id,
        is_support_ticket: 0,
        task_category_id: {
          [Op.in]: categoryIds
        },
        status: {
          [Op.ne]: -6
        },
      },
      attributes: [
        "id",
        "task_title",
        "task_remark",
        "task_category_id",
        "created_date_time"
      ],
      order: [["id", "DESC"]],
      raw: true
    });

    /* ================= GROUP CATEGORY WISE ================= */

    const groupedData = {};

    categoryIds.forEach((id) => {
      const category = categoryMap.get(id);

      groupedData[id] = {
        category_id: id,
        category_name: category?.task_category_name || "",
        category_color: category?.task_color || "",
        notes: []
      };
    });

    resultTasks.forEach((task) => {
      const category = categoryMap.get(task.task_category_id);

      if (!groupedData[task.task_category_id]) {
        groupedData[task.task_category_id] = {
          category_id: task.task_category_id,
          category_name: category?.task_category_name || "",
          category_color: category?.task_color || "",
          notes: []
        };
      }

      groupedData[task.task_category_id].notes.push({
        id: task.id,
        title: task.task_title,
        content: task.task_remark,
        category_id: task.task_category_id,
        category_name: category?.task_category_name || "",
        color: category?.task_color || "#FFE66D",
        created_date_time: task.created_date_time
      });
    });

    /* ================= RESPONSE ================= */

    return resSuccess({
      data: {
        item: Object.values(groupedData)
      }
    });

  } catch (e) {
    console.error("Error in getStickeyNotesData:", e);

    return resBadRequest({
      developer_msg: `Error: ${e.message}`
    });
  }
};

export const createStickeyNote = async (req) => {
  try {

    const {
      a_application_login_id,
      task_category_id,
      content,
    } = req.body;

    /* ================= VALIDATION ================= */

    if (!a_application_login_id) {
      return resError({
        ack_msg: "Login id is required",
      });
    }

    if (!task_category_id) {
      return resError({
        ack_msg: "Task category id is required",
      });
    }

    if (!content || !content.trim()) {
      return resError({
        ack_msg: "Content is required",
      });
    }

    /* ================= COMPANY CHECK ================= */

    const findCompanyId = await getCompanyByLoginId(
      a_application_login_id
    );

    if (!findCompanyId?.company_masters_id) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found for a_application_login_id: ${a_application_login_id}`,
      });
    }

    const companyId = findCompanyId.company_masters_id;

    /* ================= MODELS ================= */

    const TaskModel = taskManagementModel(req.tenantDB);

    /* ================= CREATE NOTE ================= */

    const createTask = await TaskModel.create({
      company_masters_id: companyId,
      a_application_login_id: a_application_login_id,
      assigned_team_member: a_application_login_id,
      task_category_id: Number(task_category_id),
      task_title: content,
      task_remark: content,
      is_support_ticket: 0,
      status: "-3",
      task_priority: "3",
      task_type: "5",
      task_enddate: moment().format("YYYY-MM-DD HH:mm:ss"),
      task_fromdate: moment().format("YYYY-MM-DD HH:mm:ss"),
      created_date_time: moment().format("YYYY-MM-DD HH:mm:ss")
    });

    /* ================= RESPONSE ================= */

    return resSuccess({

      ack_msg: "Sticky note created successfully",

      data: {
        id: createTask.id,
      },

    });

  } catch (e) {

    console.error(
      "Error in createStickeyNote:",
      e
    );

    return resBadRequest({
      developer_msg: `Error: ${e.message}`,
    });

  }
};

// =============================
// EDIT STICKY NOTE
// =============================

export const editStickeyNote = async (req) => {
  try {

    const {
      a_application_login_id,
      note_id,
      content,
    } = req.body;

    /* ================= VALIDATION ================= */

    if (!a_application_login_id) {
      return resError({
        ack_msg: "Login id is required",
      });
    }

    if (!note_id) {
      return resError({
        ack_msg: "Note id is required",
      });
    }

    if (!content || !content.trim()) {
      return resError({
        ack_msg: "Content is required",
      });
    }

    /* ================= COMPANY CHECK ================= */

    const findCompanyId =
      await getCompanyByLoginId(
        a_application_login_id
      );

    if (!findCompanyId?.company_masters_id) {

      return resError({
        ack_msg: "Company not found",
        developer_msg:
          `No company found for a_application_login_id: ${a_application_login_id}`,
      });

    }

    const companyId =
      findCompanyId.company_masters_id;

    /* ================= MODEL ================= */

    const TaskModel =
      taskManagementModel(req.tenantDB);

    /* ================= FIND NOTE ================= */

    const findNote =
      await TaskModel.findOne({

        where: {
          id: note_id,
          company_masters_id: companyId,
          a_application_login_id: a_application_login_id,
          isDelete: 0,
        },

      });

    if (!findNote) {

      return resError({
        ack_msg: "Sticky note not found",
      });

    }

    /* ================= UPDATE ================= */

    await TaskModel.update(
      {
        task_remark: content,
        task_title: content,
      },
      {
        where: {
          id: note_id,
        },
      }
    );

    /* ================= RESPONSE ================= */

    return resSuccess({

      ack_msg:
        "Sticky note updated successfully",

    });

  } catch (e) {

    console.error(
      "Error in editStickeyNote:",
      e
    );

    return resBadRequest({
      developer_msg:
        `Error: ${e.message}`,
    });

  }
};

// =============================
// DELETE STICKY NOTE
// SOFT DELETE
// =============================

export const deleteStickeyNote = async (req) => {

  try {

    const {
      a_application_login_id,
      note_id,
    } = req.body;

    /* ================= VALIDATION ================= */

    if (!a_application_login_id) {

      return resError({
        ack_msg:
          "Login id is required",
      });

    }

    if (!note_id) {

      return resError({
        ack_msg:
          "Note id is required",
      });

    }

    /* ================= COMPANY CHECK ================= */

    const findCompanyId =
      await getCompanyByLoginId(
        a_application_login_id
      );

    if (!findCompanyId?.company_masters_id) {

      return resError({
        ack_msg:
          "Company not found",

        developer_msg:
          `No company found for a_application_login_id: ${a_application_login_id}`,
      });

    }

    const companyId =
      findCompanyId.company_masters_id;

    /* ================= MODEL ================= */

    const TaskModel =
      taskManagementModel(req.tenantDB);

    /* ================= FIND NOTE ================= */

    const findNote =
      await TaskModel.findOne({

        where: {
          id: note_id,
          company_masters_id: companyId,
          isDelete: 0,
        },

      });

    if (!findNote) {

      return resError({
        ack_msg:
          "Sticky note not found",
      });

    }

    /* ================= SOFT DELETE ================= */

    await TaskModel.update(
      {
        isDelete: 1,
      },
      {
        where: {
          id: note_id,
        },
      }
    );

    /* ================= RESPONSE ================= */

    return resSuccess({

      ack_msg:
        "Sticky note deleted successfully",

    });

  } catch (e) {

    console.error(
      "Error in deleteStickeyNote:",
      e
    );

    return resBadRequest({
      developer_msg:
        `Error: ${e.message}`,
    });

  }
};

export const completeStickeyNote = async (req) => {

  try {

    const {
      a_application_login_id,
      note_id,
      status,
    } = req.body;

    /* ================= VALIDATION ================= */

    if (!a_application_login_id) {

      return resError({
        ack_msg: "Login id is required",
      });

    }

    if (!note_id) {

      return resError({
        ack_msg: "Note id is required",
      });

    }

    /* ================= COMPANY CHECK ================= */

    const findCompanyId =
      await getCompanyByLoginId(
        a_application_login_id
      );

    if (!findCompanyId?.company_masters_id) {

      return resError({
        ack_msg: "Company not found",

        developer_msg:
          `No company found for a_application_login_id: ${a_application_login_id}`,
      });

    }

    const companyId =
      findCompanyId.company_masters_id;

    /* ================= MODEL ================= */

    const TaskModel =
      taskManagementModel(req.tenantDB);

    /* ================= FIND NOTE ================= */

    const findNote =
      await TaskModel.findOne({

        where: {
          id: note_id,
          company_masters_id: companyId,
          isDelete: 0,
        },

      });

    if (!findNote) {

      return resError({
        ack_msg: "Sticky note not found",
      });

    }

    /* ================= UPDATE STATUS ================= */

    await TaskModel.update(
      {
        status: -6,
      },
      {
        where: {
          id: note_id,
        },
      }
    );

    /* ================= RESPONSE ================= */

    return resSuccess({

      ack_msg:
        "Sticky note updated successfully",

    });

  } catch (e) {

    console.error(
      "Error in completeStickeyNote:",
      e
    );

    return resBadRequest({
      developer_msg:
        `Error: ${e.message}`,
    });

  }
};

export const taskCategoryGet = async (req) => {
  try {
    const { a_application_login_id } = req.body;

    if (!a_application_login_id) {
      return resError({
        ack_msg: "Application Login ID is required",
      });
    }

    const TaskCategoryModel = taskCategoryModel(req.tenantDB);

    const categories = await TaskCategoryModel.findAll({
      where: {
        isDelete: 0,
        // Only those categories where user ID exists in is_assigned_widget (comma separated)
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn(
              "FIND_IN_SET",
              a_application_login_id,
              Sequelize.col("is_assigned_widget")
            ),
            {
              [Op.gt]: 0,
            }
          ),
        ],
      },
      order: [["id", "DESC"]],
      attributes: [
        "id",
        "task_category_name",
        "task_color",
      ],
    });

    if (categories && categories.length > 0) {
      return resSuccess({
        ack_msg: "Task Category Get Successfully",
        data: { item: categories },
      });
    } else {
      return resSuccess({
        ack_msg: "No Task Category found",
        data: { item: [] },
      });
    }
  } catch (error) {
    console.error("taskCategoryGet error:", error);
    return resError({
      ack_msg: "Error fetching task categories",
      developer_msg: error.message,
    });
  }
};

export const widgetAdd = async (req) => {

  const {
    request_flag,
    task_category_id,
    a_application_login_id,
  } = req.body;

  // request_flag
  // 1 = Add Widget
  // 2 = Remove Widget

  if (!task_category_id) {
    return resError({
      ack_msg: "Task Category Id is Required",
      developer_msg: "Task Category Id is Required",
    });
  }

  const TaskCategoryModels = taskCategoryModel(req.tenantDB);

  // ─────────────────────────────────────────────
  // ADD WIDGET
  // ─────────────────────────────────────────────
  if (Number(request_flag) === 1) {

    try {

      const category = await TaskCategoryModels.findOne({
        where: {
          id: task_category_id,
          isDelete: 0,
        },
      });

      if (!category) {
        return resError({
          ack_msg: "Task category not found",
          developer_msg:
            "Task category not found or deleted",
        });
      }

      let assignedIds = [];

      // remove 0
      if (category.is_assigned_widget) {

        assignedIds =
          category.is_assigned_widget
            .split(",")
            .filter((id) => id && id !== "0");
      }

      // already added
      if (
        assignedIds.includes(
          a_application_login_id.toString()
        )
      ) {

        return resSuccess({
          ack: 1,
          ack_msg: "Widget already assigned",
          data: {
            assignedIds,
          },
        });
      }

      // push current login id
      assignedIds.push(
        a_application_login_id.toString()
      );

      const updateData = {
        is_assigned_widget:
          assignedIds.length > 0
            ? assignedIds.join(",")
            : "0",
      };

      const [affectedRows] =
        await TaskCategoryModels.update(
          updateData,
          {
            where: {
              id: task_category_id,
              isDelete: 0,
            },
          }
        );

      if (affectedRows === 0) {

        return resError({
          ack_msg: "Failed to assign widget",
          developer_msg:
            "No rows updated in database",
        });
      }

      return resSuccess({
        ack: 1,
        ack_msg: "Widget assigned successfully",
        data: {
          assignedIds,
        },
      });

    } catch (error) {

      return resError({
        ack: 0,
        ack_msg:
          "Something went wrong while assigning widget",
        developer_msg: error.message,
      });
    }
  }

  // ─────────────────────────────────────────────
  // REMOVE WIDGET
  // ─────────────────────────────────────────────
  else if (Number(request_flag) === 2) {

    try {

      const category = await TaskCategoryModels.findOne({
        where: {
          id: task_category_id,
          isDelete: 0,
        },
      });

      if (!category) {

        return resError({
          ack_msg: "Task category not found",
          developer_msg:
            "Task category not found or deleted",
        });
      }

      let assignedIds = [];

      if (category.is_assigned_widget) {

        assignedIds =
          category.is_assigned_widget
            .split(",")
            .filter((id) => id && id !== "0");
      }

      // remove current login id
      assignedIds = assignedIds.filter(
        (id) =>
          id !==
          a_application_login_id.toString()
      );

      const updateData = {
        is_assigned_widget:
          assignedIds.length > 0
            ? assignedIds.join(",")
            : "0",
      };

      const [affectedRows] =
        await TaskCategoryModels.update(
          updateData,
          {
            where: {
              id: task_category_id,
              isDelete: 0,
            },
          }
        );

      if (affectedRows === 0) {

        return resError({
          ack_msg: "Failed to remove widget",
          developer_msg:
            "No rows updated in database",
        });
      }

      return resSuccess({
        ack: 1,
        ack_msg: "Widget removed successfully",
        data: {
          assignedIds,
        },
      });

    } catch (error) {

      return resError({
        ack: 0,
        ack_msg:
          "Something went wrong while removing widget",
        developer_msg: error.message,
      });
    }
  }

  // ─────────────────────────────────────────────
  // INVALID FLAG
  // ─────────────────────────────────────────────
  else {

    return resError({
      ack_msg: "Invalid request flag",
      developer_msg:
        "request_flag must be 1 or 2",
    });
  }
};