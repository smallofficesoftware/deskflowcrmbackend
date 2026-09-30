import Sequelize, { Op, col, fn } from "sequelize";
import { reminderMessagesModel } from "../../models/activities/reminderMessagesModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import { labelModel } from "../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../models/masters/stagestatusModel.js";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import {
  formatDateAndTimeCreateDateTime,
  formatDateCustom,
  resBadRequest,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

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
      viewScope, // "all" | "my" - explicit scope toggle, same idea as Task Management's All/My
      startDate,
      endDate,
      assignedByMultiTeamMember,
      createdByMultiTeamMember
    } = req.body;

    const reminderMSGModel = reminderMessagesModel(req.tenantDB);

    const companyInfo = await getCompanyByLoginId(a_application_login_id);
    const company_flag = companyInfo ? companyInfo.company_flag : null;

    // Rights (ticket #2573, "also see personal data and all data"): same
    // all_data/personal page-rights model Task Management already uses
    // (rightsHelper.js), instead of the old hardcoded "company owner + on
    // the All tab" special case - so a team member granted "All data" sees
    // every reminder too, on every tab, not just the owner on one tab. The
    // owner still always gets full access even without a seeded rights row,
    // matching the bypass every other page gets.
    const { showAllData } = await getUserRights({
      company_masters_id: companyInfo?.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.REMINDER,
      tenentId: req.tenantDB,
    });
    const canSeeAllData = showAllData || Number(company_flag) === 1;

    // "All"/"My" toggle (feature request: same as Task Management's All/My
    // buttons). "My" always means own+assigned, even for someone with
    // all-data rights - matches Task's taskFilter===2 meaning "assigned to
    // me" unconditionally. "All" asks for company-wide, still capped by the
    // same rights check. No toggle sent (older callers) keeps the
    // rights-only default from ticket #2573 unchanged.
    const effectiveSeesAllData = viewScope === "my" ? false : canSeeAllData;

    // "Own + assigned to me" - what everyone gets by default: personal-data
    // rights, or no rights row configured at all (deliberately conservative,
    // unlike Task Management's "no rights row = full access" - reminders
    // were always own-only before this fix, so an unconfigured team member
    // should stay restricted rather than suddenly seeing everyone's).
    const personalScope = {
      [Op.or]: [
        { a_application_login_id: a_application_login_id },
        { assigned_to: a_application_login_id },
      ],
    };

    let whereClause = {
      isDelete: "0",
      is_reminder_app_flag: "0",
      status: 0,
      ...(effectiveSeesAllData ? {} : personalScope),
    };

    let baseWhereClause = {
      isDelete: "0",
      is_reminder_app_flag: "0",
      ...(effectiveSeesAllData ? {} : personalScope),
    };

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
    } else if (typeFilter === "all") {
      // "All" means every status, not just not-yet-completed - drop the
      // status:0 default the base whereClause carries. (Regression from the
      // rights rework above: that used to only happen for the company
      // owner, via a whereClause replaced wholesale further up; scope is
      // unified now, so this needs to be explicit and apply to everyone.)
      const { status, ...rest } = whereClause;
      whereClause = rest;
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

    // Counts follow the same filters as the list (ticket #2573): search
    // term, single-day/date-range filter and the creator/assignee
    // multi-selects all apply here too - only the scope (base) each count
    // starts from differs. Never built from whereClause, since that one
    // already has a specific typeFilter's condition folded into it above.
    const applyCountFilters = (base) => {
      let result = { ...base };

      if (searchDate) {
        result[Op.and] = result[Op.and] || [];
        result[Op.and].push(
          Sequelize.where(fn("DATE", col("reminder_data_time")), searchDate)
        );
      }

      if (startDate && endDate) {
        result[Op.and] = result[Op.and] || [];
        result[Op.and].push(
          Sequelize.where(fn("DATE", col("reminder_data_time")), {
            [Op.between]: [startDate, endDate],
          })
        );
      }

      if (searchTerm) {
        result = {
          [Op.and]: [
            result,
            {
              [Op.or]: [
                { assigned_to_name: { [Op.like]: `%${searchTerm}%` } },
                { remark: { [Op.like]: `%${searchTerm}%` } },
              ],
            },
          ],
        };
      }

      if (createdByMultiTeamMember && Array.isArray(createdByMultiTeamMember) && createdByMultiTeamMember.length > 0) {
        result[Op.and] = result[Op.and] || [];
        result[Op.and].push({
          a_application_login_id: { [Op.in]: createdByMultiTeamMember },
        });
      }

      if (assignedByMultiTeamMember && Array.isArray(assignedByMultiTeamMember) && assignedByMultiTeamMember.length > 0) {
        result[Op.and] = result[Op.and] || [];
        result[Op.and].push({
          assigned_to: { [Op.in]: assignedByMultiTeamMember },
        });
      }

      return result;
    };

    const countsWhereClause = applyCountFilters(baseWhereClause);

    // "All"/"My" badge totals (feature request, matches Task Management's
    // isTaskCountGetAll/isTaskCountGetMy): total live reminders in each
    // scope, same extra filters as above, independent of due/upcoming/
    // completed. "All" is still capped by canSeeAllData - a login without
    // the right just gets the same number as "My".
    const scopelessBase = { isDelete: "0", is_reminder_app_flag: "0" };
    const myCount = await reminderMSGModel.count({
      where: applyCountFilters({ ...scopelessBase, ...personalScope }),
    });
    const allCount = canSeeAllData
      ? await reminderMSGModel.count({ where: applyCountFilters(scopelessBase) })
      : myCount;

    const dueCount = await reminderMSGModel.count({
      where: {
        ...countsWhereClause,
        status: { [Op.ne]: 1 },
        reminder_data_time: { [Op.lt]: new Date() },
      },
    });

    const futureCount = await reminderMSGModel.count({
      where: {
        ...countsWhereClause,
        status: { [Op.ne]: 1 },
        completed_date_time: { [Op.or]: [null, ""] },
        reminder_data_time: { [Op.gt]: currentDate },
      },
    });

    const completeCount = await reminderMSGModel.count({
      where: {
        ...countsWhereClause,
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
          can_see_all_data: canSeeAllData, // lets the frontend decide whether to show the "All" button at all
          counts: {
            due: dueCount,
            future: futureCount,
            complete: completeCount,
            all: allCount,
            my: myCount,
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
