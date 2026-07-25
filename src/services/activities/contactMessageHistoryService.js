import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";

import fs from "fs-extra";
import moment from "moment";
import path from "path";
import Sequelize, { col, fn, Op } from "sequelize";
import { getUserRights } from "../../helpers/rightsHelper.js";
import { contactModel } from "../../models/activities/contactModel.js";
import loginModel from "../../models/application_login/loginModel.js";
import {
  CHAT_MESSAGE_IMG_LINK_EXTENDED,
  WHATSAPP_SEND_ADD_PRE_NUMBER
} from "../../utils/appConstants.js";
import { PAGE_ID } from "../../utils/AppEnumeration.js";
import logger from "../../utils/logger.js";
import {
  formatDateAndTimeCreateDateTime,
  resBadRequest,
  resError,
  resSuccess,
  sanitizeObjectOfNull,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import {
  addContactByWhatsApps,
  messageMailSend,
} from "../company_setup/thirdPartyIntegrationService.js";

export const getContactMessageHistoryById = async (req) => {
  try {
    const contactMessageHistoryId = req.params.id;
    if (!contactMessageHistoryId) {
      return resError({
        message: RequireMessage("ContactMessageHistory Id"),
      });
    }
    const CTMMode = contactMessageHistory(req.tenantDB);
    const findContactMessageHistory = await CTMMode.findOne({
      where: {
        id: contactId,
        isDelete: "0",
      },
    });
    return resSuccess({
      data: findContactMessageHistory,
    });
  } catch (e) {
    throw e;
  }
};

export const getAllContactMessageHistoryDemo = async (req, res) => {

  try {
    let contactBody = {
      contact_masters_id: req.body.contact_masters_id,
      ul: req.body.ul || 0,
      ll: req.body.ll || 15,
      searchTerm: req.body.searchTerm,
      isChecked: req.body.isChecked,
      isCheckedAttachment: req.body.isCheckedAttachment,
      filterAndSearch: req.body.filterAndSearch,
      selectedDates: req.body.selectedDates,
    };
    let whereClause = {};
    if (contactBody.filterAndSearch) {
      whereClause = {
        [Op.and]: [
          {
            description: {
              [Op.like]: "%" + contactBody.filterAndSearch.searchTerm + "%",
            },
          },
          {
            contact_masters_id: contactBody.contact_masters_id,
          },
          {
            isDelete: "0",
          },
        ],
      };
    }
    if (contactBody.filterAndSearch.isChecked !== undefined) {
      whereClause[Op.and].push({
        is_reminder: contactBody.filterAndSearch.isChecked,
      });
    }
    if (contactBody.filterAndSearch.isCheckedAttachment !== undefined) {
      whereClause[Op.and].push({
        message_type_id: contactBody.filterAndSearch.isCheckedAttachment,
      });
    }
    if (contactBody.filterAndSearch.selectedDates !== undefined) {

      const start = moment(contactBody.filterAndSearch.selectedDates[0]).format(
        "YYYY-MM-DD"
      );
      const end = moment(contactBody.filterAndSearch.selectedDates[1]).format(
        "YYYY-MM-DD"
      );
      whereClause[Op.and].push({
        created_date_time: {
          [Op.between]: [start, end],
        },
      });
    }

    whereClause.contact_masters_id = contactBody.contact_masters_id;
    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    const resultMessageHistory = await contactMessageHistory.findAll({
      where: whereClause,
      limit: contactBody.ll,
      offset: contactBody.ul,
      order: [["created_date_time", "DESC"]],
      attributes: {
        include: [
          [fn("DATE", col("created_date_time")), "messageDate"],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.remark  FROM reminder_messages WHERE reminder_messages.reference_id = contact_message_histories.id AND  reminder_messages.reference_table="contact_message_histories" AND reminder_messages.isDelete=0 AND reminder_messages.status=0 ORDER BY reminder_messages.id DESC LIMIT 1)`
            ),
            "reminder_remark",
          ],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.reminder_data_time  FROM reminder_messages WHERE reminder_messages.reference_id = contact_message_histories.id AND reminder_messages.reference_table="contact_message_histories" AND reminder_messages.isDelete=0 AND reminder_messages.status=0 ORDER BY reminder_messages.id DESC LIMIT 1)`
            ),
            "reminder_data_time",
          ],
          [
            Sequelize.literal(
              `(SELECT a_application_logins.username  FROM a_application_logins WHERE a_application_logins.id = contact_message_histories.a_application_login_id AND a_application_logins.isDelete=0)`
            ),
            "application_login_name",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.person_name  FROM contact_masters WHERE contact_masters.id = contact_message_histories.contact_masters_id AND contact_masters.isDelete=0)`
            ),
            "contact_name",
          ],
        ],
      },
    });
    const sanitizedMessageHistory =
      resultMessageHistory &&
      resultMessageHistory.map((messageItem) => {
        const sanitized = sanitizeObjectOfNull(messageItem.toJSON());
        return {
          ...sanitized,
          media_url: messageItem.dataValues.media_url
            ? CHAT_MESSAGE_IMG_LINK_EXTENDED + messageItem.dataValues.media_url
            : "",
          created_date_time: formatDateAndTimeCreateDateTime(
            messageItem.created_date_time
          ),
        };
      });

    const formatMessageHistoryWithLoop = (messages) => {
      const result = [];
      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        const messageObj = {
          id: message.id,
          messageDate: message.messageDate,
          description: message.description,
          lable: message.lable,
          current_status: message.current_status,
          message_type_id: message.message_type_id,
          created_date_time: message.created_date_time,
          s_timestemp: message.s_timestemp,
          company_masters_id: message.company_masters_id,
          a_application_login_id: message.a_application_login_id,
          contact_masters_id: message.contact_masters_id,
          message_side: message.message_side,
          media_url: message.media_url,
          media_name: message.media_name,
          is_reminder: message.is_reminder,
          entry_flag: message.entry_flag,
          isDelete: message.isDelete,
          isActive: message.isActive,
        };
        const messageDate = message.messageDate;
        let dateGroup = result.find((group) => group.date === messageDate);
        if (!dateGroup) {
          dateGroup = { date: messageDate, messages: [] };
          result.push(dateGroup);
        }
        dateGroup.messages.push(messageObj);
      }

      return result;
    };
    const formatMessageShow = formatMessageHistoryWithLoop(
      sanitizedMessageHistory
    );
    if (resultMessageHistory) {
      return resSuccess({
        data: {
          item1: formatMessageShow,
        },
      });
    } else {
      return resError({
        ack_msg: "No Message History",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    logger.error("Error fetching message history:", e);
    return resBadRequest();
    throw e;
  }
};

export const getAllContactMessageHistory = async (req, res) => {
  try {
    let contactBody = {
      contact_masters_id: req.body.contact_masters_id,
      a_application_login_id: req.body.a_application_login_id,
      startDateForUl: req.body.startDateForUl,
      searchTerm: req.body.searchTerm,
      isChecked: req.body.isChecked,
      isCheckedAttachment: req.body.isCheckedAttachment,
      filterAndSearch: req.body.filterAndSearch,
    };
    const findCompanyId = await getCompanyByLoginId(
      contactBody.a_application_login_id
    );

    const CTMModel = contactMessageHistory(req.tenantDB);
    let whereClause = {};

    /* Check Rights */
    const applicationLogin = req.body.a_application_login_id;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: applicationLogin,
      page_id: PAGE_ID.CONTACT_MESSAGE_HISTORY,
      tenentId: req.tenantDB
    });

    if (showPersonalData) { // all rights
      whereClause[Op.or] = [
        { a_application_login_id: contactBody.a_application_login_id },
      ];
    } else if (showAllData) {

    } else {
      whereClause[Op.or] = [{ a_application_login_id: null }];
    }

    whereClause[Op.and] = whereClause[Op.and] || [];
    /* Check Rights */

    if (contactBody.contact_masters_id) {
      whereClause = {
        ...whereClause,
        [Op.and]: [
          {
            contact_masters_id: contactBody.contact_masters_id,
          },
        ],
      };
    }

    if (contactBody.filterAndSearch.searchTerm) {
      whereClause = {
        ...whereClause,
        [Op.and]: [
          {
            description: {
              [Op.like]: "%" + contactBody.filterAndSearch.searchTerm + "%",
            },
          },
          {
            contact_masters_id: contactBody.contact_masters_id,
          },
        ],
      };
    }

    if (contactBody.filterAndSearch.isChecked !== undefined) {
      whereClause[Op.and].push({
        is_reminder: Number(contactBody.filterAndSearch.isChecked),
      });
    }
    if (contactBody.filterAndSearch.isCheckedAttachment !== undefined) {
      whereClause[Op.and].push({
        message_type_id: contactBody.filterAndSearch.isCheckedAttachment,
      });
    }
    if (contactBody.startDateForUl && contactBody.startDateForUl !== "-1") {
      let messageSortingWhere;
      messageSortingWhere = {
        contact_masters_id: contactBody.contact_masters_id,
        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("created_date_time")), {
            [Op.lt]: moment(contactBody.startDateForUl).format("YYYY-MM-DD")
          })
        ]
      }
      if (showPersonalData) {
        messageSortingWhere.a_application_login_id = contactBody.a_application_login_id
      }
      const findLastNextToDate = await CTMModel.findOne({
        where: messageSortingWhere,
        order: [["created_date_time", "DESC"]],
        attributes: [
          [fn("DATE", col("created_date_time")), "created_date"]
        ]
      });

      const start = moment(contactBody.startDateForUl).format("YYYY-MM-DD");
      const end1 = findLastNextToDate ? moment(findLastNextToDate.dataValues.created_date).subtract(50, "days").format("YYYY-MM-DD") : null;
      // const end1 = moment(contactBody.startDateForUl).subtract(50, "days").format("YYYY-MM-DD");
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("created_date_time")),
          {
            [Op.between]: [end1, start],
          }
        )
      );
    }
    if (contactBody.startDateForUl === "-1") {
      let messageSortingWhere = {};
      if (showPersonalData) {
        messageSortingWhere.a_application_login_id = contactBody.a_application_login_id
      }
      const findLastDate = await CTMModel.findOne({
        where: { contact_masters_id: contactBody.contact_masters_id, ...messageSortingWhere },
        order: [["created_date_time", "DESC"]],
        attributes: ["created_date_time"],
      });

      if (findLastDate) {
        const findLastNextToDate = await CTMModel.findOne({
          where: {
            contact_masters_id: contactBody.contact_masters_id,
            [Op.and]: [
              Sequelize.where(Sequelize.fn("DATE", Sequelize.col("created_date_time")), {
                [Op.lte]: moment(findLastDate.created_date_time).format("YYYY-MM-DD")
              })
            ],
            ...messageSortingWhere
          },
          order: [["created_date_time", "DESC"]],
          attributes: [
            [fn("DATE", col("created_date_time")), "created_date"]
          ]
        });

        const lastDate = findLastDate ? moment(findLastDate.dataValues.created_date_time).format("YYYY-MM-DD") : null;
        // const startDate = lastDate ? moment(lastDate).subtract(3, "days").format("YYYY-MM-DD") : null;
        const startDate = findLastNextToDate ? moment(findLastNextToDate.dataValues.created_date).subtract(50, "days").format("YYYY-MM-DD") : null;

        whereClause[Op.and].push(
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("created_date_time")),
            {
              [Op.gte]: startDate,
              [Op.lte]: lastDate,
            }
          )
        );
      }
    }
    if (contactBody.filterAndSearch.selectedDates !== undefined) {
      const start = moment(contactBody.filterAndSearch.selectedDates[0]).format(
        "YYYY-MM-DD"
      );
      const end = moment(contactBody.filterAndSearch.selectedDates[1]).format(
        "YYYY-MM-DD"
      );
      whereClause[Op.and].push(
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("created_date_time")),
          {
            [Op.gte]: start,
            [Op.lte]: end,
          }
        )
      );
    }
    const resultMessageHistory = await CTMModel.findAll({
      where: whereClause,
      order: [["created_date_time", "DESC"], ["id", "DESC"]],

      attributes: {
        include: [
          [fn("DATE", col("created_date_time")), "messageDate"],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.remark  FROM reminder_messages WHERE reminder_messages.reference_id = contact_message_histories.id AND  reminder_messages.reference_table="contact_message_histories" AND reminder_messages.isDelete=0 AND reminder_messages.status=0 ORDER BY reminder_messages.id DESC LIMIT 1)`
            ),
            "reminder_remark",
          ],
          [
            Sequelize.literal(
              `(SELECT reminder_messages.reminder_data_time  FROM reminder_messages WHERE reminder_messages.reference_id = contact_message_histories.id AND reminder_messages.reference_table="contact_message_histories" AND reminder_messages.isDelete=0 AND reminder_messages.status=0 ORDER BY reminder_messages.id DESC LIMIT 1)`
            ),
            "reminder_data_time",
          ],
          [
            Sequelize.literal(
              `(SELECT contact_masters.pinned_message  FROM contact_masters WHERE contact_masters.id = contact_message_histories.contact_masters_id AND contact_masters.isDelete=0)`
            ),
            "pinned_message",
          ],
        ],
      },
    });

    let activeTeamList;
    let activeTeamMap;
    if (resultMessageHistory) {
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

    const sanitizedMessageHistory = resultMessageHistory
      ? await Promise.all(
        resultMessageHistory.map(async (messageItem) => {
          const sanitized = sanitizeObjectOfNull(messageItem.toJSON());
          const username = activeTeamMap.get(Number(sanitized.deleted_by)) || null;;

          return {
            ...sanitized,
            media_url: messageItem.dataValues.media_url
              ? CHAT_MESSAGE_IMG_LINK_EXTENDED +
              messageItem.dataValues.media_url
              : "",
            created_date_time: formatDateAndTimeCreateDateTime(
              messageItem.created_date_time
            ),
            reminder_data_time: messageItem.dataValues.reminder_data_time
              ? formatDateAndTimeCreateDateTime(
                messageItem.dataValues.reminder_data_time
              )
              : "",
            deleted_by: username,
          };
        })
      )
      : [];

    const formatMessageHistoryWithLoop = (messages) => {
      const result = [];

      for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        const messageObj = {
          id: message.id,
          messageDate: message.messageDate,
          description: message.description,
          lable: message.lable,
          current_status: message.current_status,
          message_type_id: message.message_type_id,
          created_date_time: message.created_date_time,
          s_timestemp: message.s_timestemp,
          company_masters_id: message.company_masters_id,
          a_application_login_id: message.a_application_login_id,
          contact_masters_id: message.contact_masters_id,
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
          pinned_message: message.pinned_message,
          deleted_by: message.deleted_by,
        };
        const messageDate = message.messageDate;
        let dateGroup = result.find((group) => group.date === messageDate);
        if (!dateGroup) {
          dateGroup = { date: messageDate, messages: [] };
          result.push(dateGroup);
        }
        dateGroup.messages.push(messageObj);
      }

      return result;
    };

    const formatMessageShow = formatMessageHistoryWithLoop(
      sanitizedMessageHistory
    );
    if (resultMessageHistory) {
      return resSuccess({
        data: {
          item1: formatMessageShow,
          companyId: findCompanyId.company_masters_id,
        },
      });
    } else {
      return resError({
        ack_msg: "No Message History",
        developer_msg: "Data not found",
      });
    }
  } catch (e) {
    console.log("Error getAllContactMessageHistory:", e);
    return resBadRequest({ developer_msg: `Error ${e}` });
  }
};

export const mailSendToMessageHistory = async (req) => {
  const { email, subject, message, useGmail, ccEmail } = req.body;

  const applicationLoginId = req.body.a_application_login_id;
  const contactMastersId = req.body.contact_masters_id;
  const messageTypeId = req.body.message_type_id;
  const folder = req.file;
  const description = req.body.description;
  const findCompany = await getCompanyByLoginId(applicationLoginId);
  const CTMModel = contactMessageHistory(req.tenantDB);
  let directoryPath;
  if (folder) {
    directoryPath = path.join(
      process.cwd(),
      "media-folder",
      "contact_history_attachment",
      contactMastersId.toString()
    );
  }
  const mailBody = {
    email,
    subject,
    message,
    ccEmail,
    applicationLoginId,
    folder,
  };
  try {
    const mailSend = await messageMailSend(mailBody);
    if (mailSend.ack === 0) {
      return mailSend;
    }
    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    let convertPath = "";
    let mediaName = "";
    if (folder) {
      const directoryExists = await fs.pathExists(directoryPath);
      if (!directoryExists) {
        await fs.mkdirp(directoryPath);
      }

      const filePath = folder.path;
      const fileName = path.basename(filePath);
      const destinationPath = path.join(directoryPath, fileName);
      await fs.move(filePath, destinationPath);
      convertPath = contactMastersId.toString() + "/" + fileName;
      mediaName = folder.originalname || fileName;
    }

    const convertDescription = `<b>To </b>: ${email}<br><b>CC </b>: ${ccEmail ? ccEmail : ""
      }<br><b>Subject </b>:${subject ? subject : ""}<br><b>Description </b>:${message ? message : ""
      }`;
    const attachmentResult = await CTMModel.create({
      a_application_login_id: applicationLoginId,
      company_masters_id: findCompany.company_masters_id,
      contact_masters_id: contactMastersId,
      media_url: convertPath,
      media_name: mediaName,
      message_type_id: messageTypeId,
      message_side: 1,
      created_date_time: formattedDate,
      description: convertDescription || "",
      entry_flag: 2,
    });

    const updateUnread = await CTMModel.update({
      is_read_by_a_application_login_id: applicationLoginId
    }, {
      where: {
        id: contactMastersId
      }
    })

    if (attachmentResult) {
      return resSuccess({
        data: { item: attachmentResult },
        ack_msg: "Mail send successfully",
        developer_msg: folder
          ? "File moved successfully"
          : "Message saved successfully without attachment",
      });
    } else {
      return resError({
        ack_msg: "No Message History",
        developer_msg: "Data not found",
      });
    }
  } catch (error) {
    logger.error("Error processing request:", error.message);
    return resBadRequest({ developer_msg: `Error ${error}` });
  }
};

export const createAttachment = async (req) => {
  const applicationLoginId = req.body.a_application_login_id || req.body.a_application_id;
  const contactMastersId = req.body.contact_masters_id;
  const messageTypeId = req.body.message_type_id;
  const folder = req.file;
  const description = req.body.description;
  const messageSide = req.body.message_side;
  const msg = req.body.msg;

  const directoryPath = path.join(
    process.cwd(),
    "media-folder",
    "contact_history_attachment",
    contactMastersId.toString()
  );
  try {
    const findCompanyId = await getCompanyByLoginId(applicationLoginId);
    const CTMModel = contactMessageHistory(req.tenantDB);

    await fs.mkdirp(directoryPath);

    const filePath = folder.path || folder;
    const fileName = path.basename(filePath);
    const destinationPath = path.join(directoryPath, fileName);

    await fs.move(filePath, destinationPath);

    let convertPath = contactMastersId.toString() + "/" + fileName;
    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    const attachmentResult = await CTMModel.create({
      a_application_login_id: applicationLoginId,
      contact_masters_id: contactMastersId,
      media_url: convertPath,
      media_name: folder.originalname || fileName,
      message_type_id: messageTypeId,
      message_side: messageSide,
      created_date_time: formattedDate,
      description: description || "",
      application_login_name: req.body.application_login_name,
      company_masters_id: findCompanyId.company_masters_id,
    });

    const contactModelInstance = contactModel(req.tenantDB);
    const updateUnread = await contactModelInstance.update({
      is_read_by_a_application_login_id: applicationLoginId
    }, {
      where: {
        id: contactMastersId
      }
    })

    if (msg == "0" || msg == 0) {
      let contact_masters_id = contactMastersId;
      const requestData = {
        table: "contact_masters",
        columns: "id,mobile_number",
        where: `{\"isDelete\":\"0\",\"id\":\"${contact_masters_id}\,"}`,
      };
      const getContactById = await contactModelInstance.findOne(
        {
          where: { isDelete: 0, id: contact_masters_id },
          attributes: ["mobile_number"],
          raw: true
        }
      );

      if (!getContactById) {
        return resError({
          ack_msg: "Mobile number not found in contact data",
          developer_msg: `mobile_number missing`,
        });
      }

      let contact_master_number = WHATSAPP_SEND_ADD_PRE_NUMBER + `${getContactById.mobile_number}`;
      req.logger.info({ contact_master_number })
      let atteched_file = CHAT_MESSAGE_IMG_LINK_EXTENDED + convertPath;
      let whatsappReqestFlag = "msg";
      let contact_history_message = description;
      let a_application_login_id = applicationLoginId;
      let whatsAppKeyAll = await loginModel.findOne({
        where: { id: a_application_login_id, isDelete: 0 },
        attributes: ["whatsapp_appkey", "whatsapp_authkey"],
      });
      let superAdminWhatsAppKey = whatsAppKeyAll.whatsapp_appkey;
      let superAdminWhatsappAuthKey = whatsAppKeyAll.whatsapp_authkey;
      await addContactByWhatsApps(
        req,
        whatsappReqestFlag,
        atteched_file,
        contact_master_number,
        contact_history_message,
        a_application_login_id,
        superAdminWhatsAppKey,
        superAdminWhatsappAuthKey,
        folder
      );
    }
    return resSuccess({
      data: {
        item: attachmentResult,
      },
      developer_msg: "File moved successfully",
    });
  } catch (error) {
    logger.error("Error moving file:", error.message);
    return resBadRequest({
      developer_msg: error,
    });
  }
};



// export const contactMessagePinUpin = async (req) => {
//   const { request_flag, contact_master_id, messageId } = req.body;

//   const ContactModels = contactModel(req.tenantDB);

//   try {
//     if (request_flag === 1) {
//       // PIN MESSAGE
//       await ContactModels.update(
//         { pinned_message: messageId },
//         {
//           where: {
//             id: contact_master_id,
//             isDelete: 0,
//           },
//         }
//       );

//       return resSuccess({
//         ack: 1,
//         ack_msg: "Message pinned successfully",
//       });
//     } else {
//       // UNPIN MESSAGE
//       await ContactModels.update(
//         { pinned_message: null },
//         {
//           where: {
//             id: contact_master_id,
//             isDelete: 0,
//           },
//         }
//       );

//       return resSuccess({
//         ack: 1,
//         ack_msg: "Message unpinned successfully",
//       });
//     }
//   } catch (error) {
//     return resError({
//       ack_msg: "Something went wrong",
//       developer_msg: error.message,
//     });
//   }
// };


export const contactMessagePinUpin = async (req) => {
  const { request_flag, contact_master_id, messageId } = req.body;

  const ContactModels = contactModel(req.tenantDB);

  try {
    // PIN MESSAGE
    if (request_flag === 1) {
      await ContactModels.update(
        { pinned_message: messageId },
        {
          where: {
            id: contact_master_id,
            isDelete: 0,
          },
        }
      );

      return resSuccess({
        ack: 1,
        ack_msg: "Message pinned successfully",
      });
    }
    // UNPIN MESSAGE
    else if (request_flag === 2) {
      await ContactModels.update(
        { pinned_message: null },
        {
          where: {
            id: contact_master_id,
            isDelete: 0,
          },
        }
      );

      return resSuccess({
        ack: 1,
        ack_msg: "Message unpinned successfully",
      });
    }
    // INVALID FLAG
    else {
      return resError({
        ack: 0,
        ack_msg: "Invalid request flag",
      });
    }

  } catch (error) {
    return resError({
      ack_msg: "Something went wrong",
      developer_msg: error.message,
    });
  }
};