import moment from "moment";
import cron from "node-cron";
import { Op, Sequelize } from "sequelize";
import { reminderMessagesModel } from "../../../models/activities/reminderMessagesModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import cronJobsModel from "../../../models/configuration/cronJobsModel.js";
import tenantMasterModel from "../../../models/configuration/tenantMasterModel.js";
import { EXTERNAL_CRONE_RUNNING_FLAG_VAR } from "../../../utils/appConstants.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resBadRequest, resSuccess } from "../../../utils/sharedFunctions.js";
import { sendMultipleNotification } from "../../company_setup/thirdPartyIntegrationService.js";

const cronTasks = new Map();

export const reminderCronStartStop = async (req, res) => {
  const { request_flag, id, cron_time } = req.body;
  const currentDateTime = moment().format("YYYY-MM-DD HH:mm");

  try {
    // Cron job logic
    if (request_flag === 1) {
      const task = cron.schedule(cron_time, async () => {
        try {
          // Fetch all tenants
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

          if (!tenantList || tenantList.length === 0) {
            console.warn("⚠️ No tenants found");
            return resBadRequest({
              ack_msg: "No tenants found",
              developer_msg: "No tenants found in the database",
              status: 404,
            });
          }

          // Determine time range based on cron_time
          const cronIntervals = {
            "*/5 * * * * *": 5 * 1000, // 5 seconds
            "* * * * *": 60 * 1000, // 1 minute
            "*/5 * * * *": 5 * 60 * 1000, // 5 minutes
            "*/15 * * * *": 15 * 60 * 1000, // 15 minutes
            "*/30 * * * *": 30 * 60 * 1000, // 30 minutes
            "0 */6 * * *": 6 * 60 * 60 * 1000, // 6 hours
            "59 59 23 * * *": 24 * 60 * 60 * 1000, // 24 hours
          };

          const interval = cronIntervals[cron_time] || 15 * 60 * 1000; // Default to 15 minutes
          const now = moment();
          const startTime = now.format("YYYY-MM-DD HH:mm");
          const endTime = moment(now).add(interval, "milliseconds").format("YYYY-MM-DD HH:mm");

          // Loop through tenants
          for (const tenant of tenantList) {
            const tenantData = tenant.dataValues;

            // Create a new Sequelize instance for the tenant's database
            const tenantSequelize = new Sequelize(
              tenantData.db_name,
              tenantData.db_user,
              tenantData.db_password,
              {
                host: tenantData.db_host,
                dialect: "mysql",
                timezone: "+05:30",
                define: { timestamps: false },
                pool: { max: 20, min: 0, acquire: 30000, idle: 10000 },
                logging: false,
              }
            );

            try {
              const ReminderMessages = reminderMessagesModel(tenantSequelize);

              // Fetch reminders within the dynamic time range
              const reminders = await ReminderMessages.findAll({
                where: {
                  isDelete: 0,
                  status: 0,
                  reminder_data_time: {
                    [Op.gte]: startTime,
                    [Op.lte]: endTime,
                  },
                },
                attributes: ["a_application_login_id", "assigned_to", "id"],
              });

              reminders.map(async (item) => {
                const tokens = [];

                // Get first user's tokens
                const refresh_token = await loginModel.findAll({
                  where: {
                    id: item.a_application_login_id,
                    [Op.or]: [
                      { web_refresh_token: { [Op.ne]: null } },
                      { android_refresh_token: { [Op.ne]: null } },
                      { ios_refresh_token: { [Op.ne]: null } },
                    ],
                  },
                  attributes: [
                    "web_refresh_token",
                    "android_refresh_token",
                    "ios_refresh_token",
                  ],
                });

                tokens.push(
                  ...refresh_token.flatMap((tokenObj) => {
                    const {
                      android_refresh_token,
                      web_refresh_token,
                      ios_refresh_token,
                    } = tokenObj.dataValues;
                    return [
                      android_refresh_token,
                      web_refresh_token,
                      ios_refresh_token,
                    ];
                  })
                );

                // Get second user's tokens (if different)
                if (item.a_application_login_id !== item.assigned_to) {
                  const refresh_token2 = await loginModel.findAll({
                    where: {
                      id: item.assigned_to,
                      [Op.or]: [
                        { web_refresh_token: { [Op.ne]: null } },
                        { android_refresh_token: { [Op.ne]: null } },
                        { ios_refresh_token: { [Op.ne]: null } },
                      ],
                    },
                    attributes: [
                      "web_refresh_token",
                      "android_refresh_token",
                      "ios_refresh_token",
                    ],
                  });

                  tokens.push(
                    ...refresh_token2.flatMap((tokenObj) => {
                      const {
                        android_refresh_token,
                        web_refresh_token,
                        ios_refresh_token,
                      } = tokenObj.dataValues;
                      return [
                        android_refresh_token,
                        web_refresh_token,
                        ios_refresh_token,
                      ];
                    })
                  );
                }

                // Filter out null, empty, or duplicate tokens
                const uniqueTokens = [
                  ...new Set(
                    tokens.filter((token) => token && token.trim() !== "")
                  ),
                ];

                // Send notification if tokens exist
                if (uniqueTokens.length > 0) {
                  try {
                    await sendMultipleNotification({
                      deviceTokens: uniqueTokens,
                      title: `Pending Reminder`,
                      body: `Upcoming Reminder #${item.id}`,
                      data: {
                        page_id: PAGE_ID.REMINDER,
                      },
                    });
                  } catch (notificationError) {
                    console.error(
                      "Notification failed (non-critical):",
                      notificationError.message
                    );
                  }
                } else {
                  console.log("No device tokens found for owners.");
                }
              });
            } catch (error) {
              console.error(
                `Error querying reminders for tenant ${tenantData.db_name}:`,
                error
              );
              continue;
            }
          }
        } catch (error) {
          console.error("Cron run failed:", error);
        }
      });

      cronTasks.set(id, task);

      await cronJobsModel.update(
        { cron_start_time: currentDateTime, cron_stop_time: "" },
        { where: { id } }
      );
    } else if (request_flag === 2) {

      const task = cronTasks.get(id);
      if (task) {
        task.stop();
        cronTasks.delete(id);

        await cronJobsModel.update(
          { cron_start_time: "", cron_stop_time: currentDateTime },
          { where: { id } }
        );

      } else {
        return resBadRequest({
          ack_msg: "No cron job found for the given ID.",
        });
      }
    } else {
      return resBadRequest({ ack_msg: "Invalid request_flag value." });
    }
  } catch (error) {
    console.error("Error in reminderCronStartStop:", error);
    return resBadRequest({ ack_msg: error.message || "An error occurred" });
  }
};


export const runExternalCroneAPI = async (req) => {
  try {
    if (EXTERNAL_CRONE_RUNNING_FLAG_VAR != '1') {
      return resBadRequest({
        ack_msg: "no permision to run crone",
        developer_msg: "suspicias",
        status: 404,
      });
    }

    const expireDateCheck = moment(new Date()).format("YYYY-MM-DD");
    const checkCroneStatus = await cronJobsModel.findOne({
      where: {
        crone_tab_start_stop_flag: 1,
        cron_title: 'crone_tab_remainder_notification',
      }
    });
    if (!checkCroneStatus) {
      return resBadRequest({
        ack_msg: "The database administrator has stopped this cron. Please ensure it.",
        developer_msg: "suspicias",
        status: 404,
      });
    }
    const cron_time = req.params.cron_time;

    const tenantList = await tenantMasterModel.findAll({
      where: {
        isDelete: 0,
        isActive: 1,
        company_masters_id: {
          [Op.in]: Sequelize.literal(`(
            SELECT id FROM company_masters WHERE isDelete = 0 AND isActive=1 AND plan_expiry_date >= '${expireDateCheck}'
          )`)
        }
      },
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

    if (!tenantList || tenantList.length === 0) {
      console.warn("No tenants found");
      return resBadRequest({
        ack_msg: "No tenants found",
        developer_msg: "No tenants found in the database",
        status: 404,
      });
    }

    // Determine time range based on cron_time
    const cronIntervals = {
      "1": 5 * 1000, // 5 seconds
      "2": 60 * 1000, // 1 minute
      "3": 5 * 60 * 1000, // 5 minutes
      "4": 15 * 60 * 1000, // 15 minutes
      "5": 30 * 60 * 1000, // 30 minutes
      "6": 6 * 60 * 60 * 1000, // 6 hours
      "7": 24 * 60 * 60 * 1000, // 24 hours
    };

    const interval = cronIntervals[cron_time] || 15 * 60 * 1000; // Default to 15 minutes
    const now = moment();
    const startTime = now.format("YYYY-MM-DD HH:mm");
    const endTime = moment(now).add(interval, "milliseconds").format("YYYY-MM-DD HH:mm");

    // Loop through tenants
    for (const tenant of tenantList) {
      const tenantData = tenant.dataValues;

      // Create a new Sequelize instance for the tenant's database
      const tenantSequelize = new Sequelize(
        tenantData.db_name,
        tenantData.db_user,
        tenantData.db_password,
        {
          host: tenantData.db_host,
          dialect: "mysql",
          timezone: "+05:30",
          define: { timestamps: false },
          pool: { max: 200000, min: 0, acquire: 300000, idle: 100000 },
          logging: false,
        }
      );

      try {
        const ReminderMessages = reminderMessagesModel(tenantSequelize);

        // Fetch reminders within the dynamic time range
        const reminders = await ReminderMessages.findAll({
          where: {
            isDelete: 0,
            status: 0,
            reminder_data_time: {
              [Op.gte]: startTime,
              [Op.lte]: endTime,
            },
          },
          attributes: ["a_application_login_id", "assigned_to", "id"],
        });


        reminders.map(async (item) => {
          const tokens = [];

          // Get first user's tokens
          const refresh_token = await loginModel.findAll({
            where: {
              id: item.a_application_login_id,
              [Op.or]: [
                { web_refresh_token: { [Op.ne]: null } },
                { android_refresh_token: { [Op.ne]: null } },
                { ios_refresh_token: { [Op.ne]: null } },
              ],
            },
            attributes: [
              "web_refresh_token",
              "android_refresh_token",
              "ios_refresh_token",
            ],
          });

          tokens.push(
            ...refresh_token.flatMap((tokenObj) => {
              const {
                android_refresh_token,
                web_refresh_token,
                ios_refresh_token,
              } = tokenObj.dataValues;
              return [
                android_refresh_token,
                web_refresh_token,
                ios_refresh_token,
              ];
            })
          );

          // Get second user's tokens (if different)
          if (item.a_application_login_id !== item.assigned_to) {
            const refresh_token2 = await loginModel.findAll({
              where: {
                id: item.assigned_to,
                [Op.or]: [
                  { web_refresh_token: { [Op.ne]: null } },
                  { android_refresh_token: { [Op.ne]: null } },
                  { ios_refresh_token: { [Op.ne]: null } },
                ],
              },
              attributes: [
                "web_refresh_token",
                "android_refresh_token",
                "ios_refresh_token",
              ],
            });

            tokens.push(
              ...refresh_token2.flatMap((tokenObj) => {
                const {
                  android_refresh_token,
                  web_refresh_token,
                  ios_refresh_token,
                } = tokenObj.dataValues;
                return [
                  android_refresh_token,
                  web_refresh_token,
                  ios_refresh_token,
                ];
              })
            );
          }

          // Filter out null, empty, or duplicate tokens
          const uniqueTokens = [
            ...new Set(
              tokens.filter((token) => token && token.trim() !== "")
            ),
          ];

          // Send notification if tokens exist
          if (uniqueTokens.length > 0) {
            try {
              await sendMultipleNotification({
                deviceTokens: uniqueTokens,
                title: `Pending Reminder`,
                body: `Upcoming Reminder #${item.id}`,
                data: {
                  page_id: PAGE_ID.REMINDER,
                },
              });
            } catch (notificationError) {
              console.error(
                "Notification failed (non-critical):",
                notificationError.message
              );
            }
          } else {
            console.log("No device tokens found for owners.");
          }
        });
      } catch (error) {
        console.error(
          `Error querying reminders for tenant ${tenantData.db_name}:`,
          error
        );
        continue;
      }
    }

    return resSuccess({
      ack_msg: ` notification send successfully.`,
    });
  } catch (error) {
    console.error("Cron run failed:", error);
    return resBadRequest({ developer_msg: `Cron run failed:,${error}` });
  }
}
