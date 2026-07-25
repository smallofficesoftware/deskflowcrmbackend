import Sequelize, { Op, col, fn } from "sequelize";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { labelModel } from "../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import {
  formatDateAndTimeCreateDateTime,
  formatDateCustom,
  resBadRequest,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";

export const getAllReminder = async (req) => {
  try {
    let { ul, ll } = req.body;
    let {
      searchTerm,
      a_application_login_id,
      searchDate,
      reminderCheckFlag,
      allreminderCheckFlag,
      typeFilter,
      startDate,
      endDate,
      assignedByMultiTeamMember,
      createdByMultiTeamMember
    } = req.body;

    const reminderMSGModel = reminderMessagesModel(req.tenantDB);

    let whereClause = {
      isDelete: "0",
      is_reminder_app_flag: "0",
      [Op.or]: [
        { a_application_login_id },
        { assigned_to: a_application_login_id },
      ],
      status: 0,
    };

    let baseWhereClause = {
      isDelete: "0",
      is_reminder_app_flag: "0",
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { assigned_to: a_application_login_id },
      ],
    };
    if (typeFilter == "all") {
      whereClause = {
        isDelete: "0",
        is_reminder_app_flag: "0",
      };
    }

    // searchDate filter
    if (searchDate) {
      whereClause = {
        isDelete: "0",
        is_reminder_app_flag: "0",
        status: "0",
        a_application_login_id,
        [Op.and]: [
          Sequelize.where(fn("DATE", col("reminder_data_time")), searchDate),
        ],
      };
    }

    if (startDate && endDate) {
      if (!whereClause[Op.and]) {
        whereClause[Op.and] = [];
      }

      whereClause[Op.and].push(
        Sequelize.where(fn("DATE", col("reminder_data_time")), {
          [Op.between]: [startDate, endDate],
        })
      );
    }

    const currentDate = new Date();

    if (typeFilter === "due") {
      whereClause = {
        ...whereClause,
        status: { [Op.ne]: 1 },
        reminder_data_time: { [Op.lt]: new Date() },
      };
    } else if (typeFilter === "future") {
      whereClause = {
        ...whereClause,
        status: { [Op.ne]: 1 },
        completed_date_time: { [Op.or]: [null, ""] },
        reminder_data_time: { [Op.gt]: currentDate },
      };
    } else if (typeFilter === "complete") {
      whereClause = {
        ...whereClause,
        status: 1,
      };
    }

    if (searchTerm) {
      const searchConditions = {
        [Op.or]: [
          { assigned_to_name: { [Op.like]: `%${searchTerm}%` } },
          { remark: { [Op.like]: `%${searchTerm}%` } },
          // { product_code: { [Op.like]: `%${searchTerm}%` } },
          // { product_description: { [Op.like]: `%${searchTerm}%` } },
        ],
      };
      whereClause = {
        [Op.and]: [whereClause, searchConditions],
      };
    }
    if (reminderCheckFlag === 1) {
      whereClause = {
        [Op.or]: [
          { a_application_login_id: a_application_login_id },
          { assigned_to: a_application_login_id },
        ],
        isDelete: "0",
        is_reminder_app_flag: "0",
      };

      if (searchDate) {
        whereClause = {
          [Op.and]: [
            Sequelize.where(fn("DATE", col("reminder_data_time")), searchDate),
            { a_application_login_id: a_application_login_id },
            { isDelete: "0" },
            { status: "1" },
            { is_reminder_app_flag: "0" },
          ],
        };
      }
    }

    // Multi-select filter for creators (who created the reminder)
    if (createdByMultiTeamMember && Array.isArray(createdByMultiTeamMember) && createdByMultiTeamMember.length > 0) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push({
        a_application_login_id: {
          [Op.in]: createdByMultiTeamMember
        }
      });
    }

    // Multi-select filter for assignees (to whom reminder is assigned)
    if (assignedByMultiTeamMember && Array.isArray(assignedByMultiTeamMember) && assignedByMultiTeamMember.length > 0) {
      whereClause[Op.and] = whereClause[Op.and] || [];
      whereClause[Op.and].push({
        assigned_to: {
          [Op.in]: assignedByMultiTeamMember
        }
      });
    }

    const dueCount = await reminderMSGModel.count({
      where: {
        ...baseWhereClause,
        status: { [Op.ne]: 1 },
        reminder_data_time: { [Op.lt]: new Date() },
      },
    });

    const futureCount = await reminderMSGModel.count({
      where: {
        ...baseWhereClause,
        status: { [Op.ne]: 1 },
        completed_date_time: { [Op.or]: [null, ""] },
        reminder_data_time: { [Op.gt]: currentDate },
      },
    });

    const completeCount = await reminderMSGModel.count({
      where: {
        ...baseWhereClause,
        status: 1,
      },
    });

    const resultReminder = await reminderMSGModel.findAll({
      where: whereClause,
      limit: Number(ll) || 50,
      offset: Number(ul) || 0,
      order: [
        typeFilter === "future"
          ? [
            Sequelize.fn(
              "ABS",
              Sequelize.fn(
                "TIMESTAMPDIFF",
                Sequelize.literal("SECOND"),
                col("reminder_data_time"),
                Sequelize.literal("NOW()")
              )
            ),
            "ASC",
          ]
          : typeFilter === "complete"
            ? [["completed_date_time", "DESC"]]
            : [["reminder_data_time", "DESC"]],
      ],
      attributes: {
        include: [
          [
            Sequelize.literal(
              `(SELECT contact_masters.person_name FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "person_name",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.company_name FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "company_name",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.mobile_number FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "mobile_number",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.lable FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "lable",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.source_type_id FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "source_type_id",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.contact_status FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "contact_status",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.assinged_to_work_a_application_id FROM contact_masters WHERE contact_masters.id = reminder_messages.contact_masters_id  AND contact_masters.isDelete=0)`
            ),
            "assinged_to_work_a_application_id",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_message_histories.description FROM contact_message_histories WHERE contact_message_histories.id = reminder_messages.reference_id AND reminder_messages.reference_table="contact_message_histories"  AND contact_message_histories.isDelete=0)`
            ),
            "contact_message",
          ],
          [
            Sequelize.literal(
              `(SELECT task_managements.id FROM task_managements WHERE task_managements.id = reminder_messages.task_id  AND task_managements.isDelete=0)`
            ),
            "task_management_id",
          ],
          [
            Sequelize.literal(
              `(SELECT task_managements.task_title FROM task_managements WHERE task_managements.id = reminder_messages.task_id  AND task_managements.isDelete=0)`
            ),
            "task_management_title",
          ],
          [
            Sequelize.literal(
              `(SELECT task_managements.task_remark FROM task_managements WHERE task_managements.id = reminder_messages.task_id  AND task_managements.isDelete=0)`
            ),
            "task_management_remark",
          ],
          [
            Sequelize.literal(
              `(SELECT task_managements.task_fromdate FROM task_managements WHERE task_managements.id = reminder_messages.task_id AND task_managements.isDelete=0)`
            ),
            "task_from_date",
          ],
          [
            Sequelize.literal(
              `(SELECT task_managements.task_enddate FROM task_managements WHERE task_managements.id = reminder_messages.task_id AND task_managements.isDelete=0)`
            ),
            "task_end_date",
          ],
          [
            Sequelize.literal(
              `(SELECT task_managements.assigned_team_member FROM task_managements WHERE task_managements.id = reminder_messages.task_id AND task_managements.isDelete=0)`
            ),
            "task_assigned_team_member",
          ],

        ],
      },
    });
    console.log("aaaaaaaaaaaaaa", resultReminder)
    let company_flag = null;
    const companyflag = await companyVsApplicationLoginModel.findOne({
      where: {
        a_application_login_id: req.body.a_application_login_id,
        isDelete: 0,
      },
      attributes: ["company_flag"],
    });
    company_flag = companyflag ? companyflag.company_flag : null;


    const lableModelIntance = labelModel(req.tenantDB);
    const sourceModelIntance = sourceTypesModel(req.tenantDB);
    const statusModelIntance = stagestatusModel(req.tenantDB);

    const sanitizedReminders = await Promise.all(
      resultReminder.map(async (reminderItem) => {
        const sanitized = sanitizeObjectOfNull(reminderItem.toJSON());
        const reminderDate = new Date(reminderItem.reminder_data_time);

        let username = null;
        if (sanitized.a_application_login_id) {
          const userData = await loginModel.findOne({
            where: { id: sanitized.a_application_login_id, isDelete: 0 },
            attributes: ["username"],
          });
          username = userData ? userData.username : null;
        }

        let isDue = 2;
        if (reminderDate < currentDate && reminderItem.status !== 1) {
          isDue = 1;
        }

        let labelDetails = [];

        if (sanitized.lable) {
          const labelIds = sanitized.lable
            .split(",")
            .map(id => Number(id.trim()))
            .filter(id => !isNaN(id));

          if (labelIds.length > 0) {
            const labels = await lableModelIntance.findAll({
              where: {
                id: {
                  [Op.in]: labelIds,
                },
                isDelete: 0,
              },
              attributes: ["lable_name", "color"],
            });

            labelDetails = labels.map(label => ({
              label_name: label.lable_name,
              color: label.color,
            }));
          }
        }

        let sourceDetails = null;

        if (sanitized.source_type_id) {
          const sourceData = await sourceModelIntance.findOne({
            where: {
              id: sanitized.source_type_id,
              isDelete: 0,
            },
            attributes: ["source_name", "color"],
          });

          if (sourceData) {
            sourceDetails = {
              source_name: sourceData.source_name,
              color: sourceData.color,
            };
          }
        }

        let statusDetails = null;

        if (sanitized.contact_status) {
          const statusData = await statusModelIntance.findOne({
            where: {
              id: sanitized.contact_status,
              isDelete: 0,
            },
            attributes: ["name", "color"],
          });

          if (statusData) {
            statusDetails = {
              name: statusData.name,
              color: statusData.color,
            };
          }
        }

        return {
          ...sanitized,
          create_date_time: formatDateAndTimeCreateDateTime(
            sanitized.create_date_time
          ),
          reminder_data_time: formatDateAndTimeCreateDateTime(
            sanitized.reminder_data_time
          ),
          isDue: isDue,
          username: username,
          task_management_id: sanitized.task_management_id,
          // task_management_remark: sanitized.task_management_remark,
          // task_management_title: sanitized.task_management_title,
          task_from_date: sanitized.task_from_date
            ? formatDateCustom(sanitized.task_from_date)
            : null,
          task_end_date: sanitized.task_end_date
            ? formatDateCustom(sanitized.task_end_date)
            : null,
          task_assigned_team_member: sanitized.task_assigned_team_member || null,
          labels: labelDetails,
          sources: sourceDetails,
          status_name: statusDetails
        };
      })
    );

    if (resultReminder)
      return resSuccess({
        data: {
          item: sanitizedReminders,
          company_flag: company_flag,
          counts: {
            due: dueCount,
            future: futureCount,
            complete: completeCount,
          },
        },
      });
    else {
      return resError({
        ack_msg: "No Reminder",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    return resBadRequest({ developer_msg: e });
    throw e;
  }
};
