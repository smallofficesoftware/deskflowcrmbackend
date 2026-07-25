import fs from 'fs-extra';
import moment from "moment";
import path from 'path';
import { col, Op, Sequelize } from "sequelize";
import { getUserRights } from '../../helpers/rightsHelper.js';
import { callhistoryModel } from "../../models/activities/callhistoryModel.js";
import { contactMessageHistory } from "../../models/activities/contactMessageHistoryModel.js";
import { contactModel } from "../../models/activities/contactModel.js";
import { reminderMessagesModel } from '../../models/activities/reminderMessagesModel.js';
import loginModel from "../../models/application_login/loginModel.js";
import { PAGE_ID } from '../../utils/AppEnumeration.js';
import logger from '../../utils/logger.js';
import {
  formatDateAndTimeCreateDateTime,
  resBadRequest,
  rescallhistory,
  resError,
  resSuccess
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

const callTypesShowList = [
  { id: "1", type: "Incoming", color: "#008000", msg_type: "2" },
  { id: "2", type: "Outgoing", color: "#0000FF", msg_type: "1" },
  { id: "3", type: "Missed", color: "#FFCCCC", msg_type: "2" },
  { id: "4", type: "Rejected", color: "#8B0000", msg_type: "2" },
  { id: "5", type: "Blocked", color: "#000000", msg_type: "2" },
  { id: "7", type: "Outgoing Call Not Connected", color: "#00b3ff", msg_type: "1" },
  { id: "9", type: "Answered Externally", color: "#FFB300", msg_type: "2" },
];
export const createCall = async (req, res) => {
  try {

    let callHistory;
    try {

      callHistory = typeof req.body.call_history === "string"
        ? JSON.parse(req.body.call_history)
        : req.body.call_history;
      if (!Array.isArray(callHistory) || callHistory.length === 0) {
        throw new Error("call_history must be a non-empty array");
      }
    } catch (parseError) {
      return resError({
        ack_msg: "Invalid call history format",
        developer_msg: parseError.message,
      });
    }

    const companyData = await getCompanyByLoginId(callHistory[0].a_application_login_id);
    if (!companyData) {
      return resError({
        ack_msg: "Company not found",
        developer_msg: `No company found for login ID ${callHistory[0].a_application_login_id}`,
      });
    }
    const companyId = String(companyData?.company_masters_id || "");


    let fileDetails = null;
    if (req.files?.call_recording?.[0]) {
      const uploadedFile = req.files.call_recording[0];
      const fileName = `${Date.now()}_${uploadedFile.originalname.replace(/\s+/g, '_')}`;
      const directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "call_recording",
        companyId
      );
      await fs.ensureDir(directoryPath);
      const destinationPath = path.join(directoryPath, fileName);
      await fs.move(uploadedFile.path, destinationPath);
      fileDetails = {
        relativePath: path.join(companyId, fileName),
        fileName: fileName,
        fullPath: destinationPath,
      };
    }
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      hours = String(hours).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${ampm}`;
    };
    const currentDate = new Date();
    let formattedDate = formatDate(currentDate);
    const newCallDataPromises = callHistory.map(async (entry, index) => {
      const mobileNumber = entry.mobile_number.replace(' ', '').slice(-10);
      let contact = await contactModel(req.tenantDB).findOne({
        where: {
          isDelete: 0,
          mobile_number: {
            [Op.like]: `%${mobileNumber}`,
          },
          [Op.or]: [
            {
              a_application_login_id: callHistory[0].a_application_login_id,
            },
            {
              assinged_to_work_a_application_id:
                [callHistory[0].a_application_login_id],
            },
          ],
        },
        order: [['id', 'DESC']],
        attributes: ["id", "person_name"],
      });

      // If not found, search globally
      if (!contact) {
        contact = await contactModel(req.tenantDB).findOne({
          where: {
            isDelete: 0,
            mobile_number: {
              [Op.like]: `%${mobileNumber}`,
            },
          },
          order: [['id', 'DESC']],
          attributes: ["id", "person_name"],
        });
      }

      // Still not found
      if (!contact) {
        resSuccess({
          message: `Contact not found for mobile number ${mobileNumber} in call history entry ${index}`,
        });
        return null;
      }


      console.log("find contact", contact);



      // Fetch remark from reminder message model
      let reminderRemark = "";
      const reminderModel = reminderMessagesModel(req.tenantDB);

      const reminderData = await reminderModel.findOne({
        where: {
          contact_masters_id: contact.id,
          call_date: entry.call_date_time,
          // call_type: entry.call_type,
          call_duration: Number.isFinite(entry.duration) && entry.duration >= 0
            ? `${String(Math.floor(entry.duration / 60)).padStart(2, '0')}:${String(entry.duration % 60).padStart(2, '0')}`
            : "00:00",
        },
        attributes: ['remark'],
      });
      console.log("REMINDERRRRR", reminderData);
      if (reminderData) {
        reminderRemark = reminderData.remark;
      }
      console.log(reminderRemark);
      return {
        call_type: entry.call_type,
        call_date_time: entry.call_date_time,
        duration: Number.isFinite(entry.duration) && entry.duration >= 0
          ? `${String(Math.floor(entry.duration / 60)).padStart(2, '0')}:${String(entry.duration % 60).padStart(2, '0')}`
          : "00:00",
        mobile_number: entry.mobile_number,
        file_path: entry.file_path || null || "",
        file_name: index === 0 && fileDetails ? fileDetails.relativePath : entry.file_name || null || "",
        file_duration: entry.file_duration,
        call_name: contact.person_name,
        a_application_login_id: entry.a_application_login_id,
        company_masters_id: companyData.company_masters_id,
        contact_id: contact.id,
        created_date_time: formattedDate,
        remark: reminderRemark || "",
      };
    });
    const newCallData = (await Promise.all(newCallDataPromises)).filter((entry) => entry !== null);
    if (newCallData.length === 0) {
      return rescallhistory({
        ack_msg: "No valid contacts found",
        // developer_msg: "None of the provided mobile numbers match any contacts in the database",
      });
    }
    const callhistorydata = callhistoryModel(req.tenantDB);
    const Callarray = []
    for (const entry of newCallData) {
      const exists = await callhistorydata.findAll({
        where: {
          a_application_login_id: entry.a_application_login_id,
          call_type: entry.call_type,
          mobile_number: entry.mobile_number,
          call_date_time: entry.call_date_time,
        },
      });
      if (exists.length > 0) {

      }
      else {
        console.log("rrrrrrrrrrrrrrrr", entry);
        Callarray.push(entry)
      }
    }


    console.log("newCallDataPromisesnewCallDataPromises", newCallDataPromises);

    if (Callarray.length === 0) {
      return rescallhistory({
        ack_msg: "Data dupction found",
      })
    };
    const createdCalls = await callhistorydata.bulkCreate(Callarray);
    const getCallType = (callTypeId) => {
      const id = String(callTypeId || "");
      return callTypesShowList.find((option) => option.id === id);
    };
    const usernameLiteral = async (login_id) => {
      const user = await loginModel.findOne({
        where: { id: login_id, isDelete: 0 },
        attributes: ["username"],
      });
      return user?.username || "Unknown";
    };
    const callMsgBodies = await Promise.all(
      Callarray.map(async (callData) => {
        const username = await usernameLiteral(callData.a_application_login_id);
        return {
          contact_masters_id: callData.contact_id,
          a_application_login_id: callData.a_application_login_id,
          company_masters_id: callData.company_masters_id,
          description: `
            <b>Call History</b><br>
            call ${getCallType(callData.call_type).msg_type === "2" ? "from" : "to"} ${callData.call_name} on date ${formatDate(new Date(callData.call_date_time))}<br>
            <b style="color:${getCallType(callData.call_type).color};">${getCallType(callData.call_type).type}</b><br>
            <b>Mobile Number : </b>${callData.mobile_number}<br>
            Duration: ${callData.duration} Minutes<br>
           Remark: ${callData.remark || " "}
          `,
          created_date_time: formatDate(new Date(callData.call_date_time)) || formattedDate,
          message_side: getCallType(callData.call_type).msg_type,
          application_login_name: username,
        };
      })
    );


    const ContactMaster = contactModel(req.tenantDB);
    const contactIds = Callarray.map(c => c.contact_id);
    const updateUnread = await ContactMaster.update({
      is_read_by_a_application_login_id: Callarray[0].a_application_login_id
    }, {
      where: {
        id: contactIds
      }
    })

    const CBTMSGHistory = contactMessageHistory(req.tenantDB);
    await CBTMSGHistory.bulkCreate(callMsgBodies);

    return resSuccess({
      data: { item: createdCalls },
      ack_msg: `Call history created successfully. ${fileDetails ? 'Recording uploaded.' : ''}`,
    });
  } catch (error) {
    logger.error("Call creation error:", error);
    return resError({
      ack_msg: "Failed to create call history",
      developer_msg: error.message,
    });
  }
};
// export const createCall = async (req, res) => {
//   try {
//     // 1. Validate & Parse call_history
//     let callHistory;
//     try {
//       callHistory = typeof req.body.call_history === "string"
//         ? JSON.parse(req.body.call_history)
//         : req.body.call_history;

//       if (!Array.isArray(callHistory) || callHistory.length === 0) {
//         throw new Error("call_history must be a non-empty array");
//       }
//     } catch (parseError) {
//       return resError({
//         ack_msg: "Invalid call history format",
//         developer_msg: parseError.message,
//       });
//     }

//     // 2. Get Company Data
//     const companyData = await getCompanyByLoginId(callHistory[0].a_application_login_id);
//     if (!companyData) {
//       return resError({
//         ack_msg: "Company not found",
//         developer_msg: `No company found for login ID ${callHistory[0].a_application_login_id}`,
//       });
//     }

//     const companyId = companyData.company_masters_id.toString();

//     // 3. File Upload Handling
//     let fileDetails = null;
//     if (req.files?.call_recording?.[0]) {
//       const uploadedFile = req.files.call_recording[0];
//       const fileName = `${Date.now()}_${uploadedFile.originalname.replace(/\s+/g, "_")}`;
//       const directoryPath = path.join(process.cwd(), "media-folder", "call_recording", companyId);
//       await fs.ensureDir(directoryPath);
//       const destinationPath = path.join(directoryPath, fileName);
//       await fs.move(uploadedFile.path, destinationPath);
//       fileDetails = {
//         relativePath: path.join(companyId, fileName),
//         fileName,
//         fullPath: destinationPath,
//       };
//     }

//     // 4. Format Date
//     const formatDate = (date) => {
//       const year = date.getFullYear();
//       const month = String(date.getMonth() + 1).padStart(2, "0");
//       const day = String(date.getDate()).padStart(2, "0");
//       let hours = date.getHours();
//       const minutes = String(date.getMinutes()).padStart(2, "0");
//       const seconds = String(date.getSeconds()).padStart(2, "0");
//       const ampm = hours >= 12 ? "PM" : "AM";
//       hours = hours % 12 || 12;
//       hours = String(hours).padStart(2, "0");
//       return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${ampm}`;
//     };

//     const formattedDate = formatDate(new Date());

//     // 5. Prepare Call Data
//     const newCallDataPromises = callHistory.map(async (entry, index) => {
//       const mobileNumber = entry.mobile_number.replace(" ", "").slice(-10);

//       const contact = await contactModel(req.tenantDB).findOne({
//         where: { isDelete: 0, mobile_number: { [Op.like]: `%${mobileNumber}` } },
//         attributes: ["id", "person_name"],
//       });

//       if (!contact) {
//         resSuccess({ message: `Contact not found for mobile number ${mobileNumber} in entry ${index}` });
//         return null;
//       }

//       return {
//         call_type: entry.call_type,
//         call_date_time: entry.call_date_time,
//         duration: Number.isFinite(entry.duration) && entry.duration >= 0
//           ? `${String(Math.floor(entry.duration / 60)).padStart(2, "0")}:${String(entry.duration % 60).padStart(2, "0")}`
//           : "00:00",
//         mobile_number: entry.mobile_number,
//         file_path: entry.file_path || null,
//         file_name:
//           index === 0 && fileDetails ? fileDetails.relativePath : (entry.file_name || null),
//         file_duration: entry.file_duration,
//         call_name: contact.person_name,
//         a_application_login_id: entry.a_application_login_id,
//         company_masters_id: companyData.company_masters_id,
//         contact_id: contact.id,
//         created_date_time: formattedDate,
//       };
//     });

//     const newCallData = (await Promise.all(newCallDataPromises)).filter((entry) => entry !== null);

//     if (newCallData.length === 0) {
//       return rescallhistory({ ack_msg: "No valid contacts found" });
//     }

//     // 6. Remove Duplicate Calls
//     const callhistorydata = callhistoryModel(req.tenantDB);
//     const Callarray = [];

//     for (const entry of newCallData) {
//       const exists = await callhistorydata.findAll({
//         where: {
//           a_application_login_id: entry.a_application_login_id,
//           call_type: entry.call_type,
//           mobile_number: entry.mobile_number,
//           call_date_time: entry.call_date_time,
//         },
//       });
//       if (exists.length === 0) {
//         Callarray.push(entry);
//       }
//     }

//     if (Callarray.length === 0) {
//       return rescallhistory({ ack_msg: "Data duplication found" });
//     }

//     // 7. Insert Call History
//     const createdCalls = await callhistorydata.bulkCreate(Callarray);

//     // 8. Insert into CBTMSGHistory + Update Contact `is_read`
//     const CBTMSGHistory = contactMessageHistory(req.tenantDB);
//     const ContactMaster = contactModel(req.tenantDB);

//     for (const callData of Callarray) {
//       const username = await loginModel.findOne({
//         where: { id: callData.a_application_login_id, isDelete: 0 },
//         attributes: ["username"],
//       });

//       // Insert message
//       await CBTMSGHistory.create({
//         contact_masters_id: callData.contact_id,
//         a_application_login_id: callData.a_application_login_id,
//         company_masters_id: callData.company_masters_id,
//         description: `
//           <b>Call History</b><br>
//           call ${getCallType(callData.call_type).msg_type === "2" ? "from" : "to"} ${callData.call_name} on date ${formatDate(new Date(callData.call_date_time))}<br>
//           <b style="color:${getCallType(callData.call_type).color};">${getCallType(callData.call_type).type}</b><br>
//           <b>Mobile Number : </b>${callData.mobile_number}<br>
//           Duration: ${callData.duration} Minutes<br>
//         `,
//         created_date_time: formattedDate,
//         message_side: getCallType(callData.call_type).msg_type,
//         application_login_name: username?.username || "Unknown",
//       });

//       // Update Contact unread
//       await ContactMaster.update(
//         { is_read_by_a_application_login_id: callData.a_application_login_id },
//         { where: { id: callData.contact_id } }
//       );
//     }

//     // 9. Response
//     return resSuccess({
//       data: { item: createdCalls },
//       ack_msg: `Call history created successfully. ${fileDetails ? "Recording uploaded." : ""}`,
//     });

//   } catch (error) {
//     logger.error("Call creation error:", error);
//     return resError({
//       ack_msg: "Failed to create call history",
//       developer_msg: error.message,
//     });
//   }
// };

export const getcall = async (req, res) => {
  try {
    const { a_application_login_id, searchTerm } = req.body;
    let { ul, ll } = req.body;

    const callhistorydata = callhistoryModel(req.tenantDB);

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id,
      page_id: PAGE_ID.CALL_HISTORY,
      tenentId: req.tenantDB
    });

    const whereCondition = {
      isDelete: '0',
    };

    if (findCompanyId.company_flag == 1 || (findCompanyId.company_flag === 2 && showAllData)) {
      whereCondition.company_masters_id = findCompanyId.company_masters_id;
    } else if (findCompanyId.company_flag == 2 && showPersonalData) {
      whereCondition.a_application_login_id = a_application_login_id;
    } else {
      whereCondition.a_application_login_id = a_application_login_id;
    }


    if (searchTerm && searchTerm.trim() !== '') {
      const term = `%${searchTerm.trim()}%`;
      whereCondition[Op.or] = [
        { created_date_time: { [Op.like]: term } },
        { mobile_number: { [Op.like]: term } },
        { call_name: { [Op.like]: term } },
      ];
    }
    const callhistorydataAll = await callhistorydata.findAll({
      where: whereCondition,
      limit: Number(ll) || 50,
      offset: Number(ul) || 0,
      order: [['id', 'DESC']],
    });

    if (!callhistorydataAll?.length) {
      return resError({
        ack_msg: 'No Call History Data',
        developer_msg: 'Data not found',
      });
    }
    const callData = await Promise.all(
      callhistorydataAll.map(async (call) => {
        const rawCall = call.toJSON ? call.toJSON() : call;

        try {

          rawCall.call_date_time = formatDateAndTimeCreateDateTime(rawCall.call_date_time);
          rawCall.created_date_time = formatDateAndTimeCreateDateTime(rawCall.created_date_time);
        } catch (err) {
          logger.error('Date Format Error:', err.message);
          rawCall.created_date_time = 'Invalid Date';
        }

        // try{
        //     const companyName = await contactModel.findAll({
        //       where:{
        //         mobile_number:rawCall.mobile_number
        //       },
        //       attributes:["company_name"]
        //     })
        // }
        // catch(err){
        //   logger.error(err);

        // }

        let userData = null;
        if (rawCall.a_application_login_id) {
          try {
            userData = await loginModel.findOne({
              where: {
                id: rawCall.a_application_login_id,
              },
              attributes: ['username', 'recovery_mobile'],
            });
          } catch (err) {
            logger.error(`Login data fetch error for call ID ${rawCall.id}:`, err);
          }
        }

        return {
          ...rawCall,
          username: userData?.username,
          recovery_mobile: userData?.recovery_mobile,
          // company_name: userData?.company_name,
        };
      })
    );

    return resSuccess({
      data: { item: callData },
    });
  } catch (e) {
    logger.error('Unhandled Error:', e);
    return resBadRequest({ developer_msg: `Error: ${e.message || e}` });
  }
};


export const getcallHistoryForContactWise = async (req, res) => {
  try {
    const { a_application_login_id, contactId, ul, ll, call_type } = req.body;

    if (!a_application_login_id || !contactId) {
      return resError({
        ack_msg: "Missing required parameters",
        developer_msg: "a_application_login_id or contactId missing",
      });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId) {
      return resError({
        ack_msg: "Company not found for user",
      });
    }

    // const { showAllData, showPersonalData } = await getUserRights({
    //   company_masters_id: findCompanyId.company_masters_id,
    //   a_application_login_id,
    //   page_id: PAGE_ID.CALL_HISTORY,        // Reuse same PAGE_ID as first function
    //   tenentId: req.tenantDB
    // });

    const contactData = await contactModel(req.tenantDB).findOne({
      where: {
        id: contactId,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: "0",
      },
      attributes: ["mobile_number"],
    });

    if (!contactData || !contactData.mobile_number) {
      return resError({
        ack_msg: "Contact not found or missing mobile number",
      });
    }

    const mobileNumber = contactData.mobile_number;


    const callTypesShowList = [
      { id: "1", type: "Incoming", color: "#008000", msg_type: "2" },
      { id: "2", type: "Outgoing", color: "#0000FF", msg_type: "1" },
      { id: "3", type: "Missed", color: "#FFCCCC", msg_type: "2" },
      { id: "4", type: "Rejected", color: "#8B0000", msg_type: "2" },
      { id: "5", type: "Blocked", color: "#000000", msg_type: "2" },
      { id: "7", type: "Outgoing Call Not Connected", color: "#00b3ff", msg_type: "1" },
      { id: "9", type: "Answered Externally", color: "#FFB300", msg_type: "2" },
    ];
    let whereClause = {
      isDelete: "0",
      mobile_number: {
        [Op.like]: `%${mobileNumber}`,
      },
    };

    // if (findCompanyId.company_flag == 1 || (findCompanyId.company_flag === 2 && showAllData)) {
    //   // Admin / Full Access → Can see all calls in the company for this contact
    //   whereClause.company_masters_id = findCompanyId.company_masters_id;
    // }
    // else if (findCompanyId.company_flag == 2 && showPersonalData) {
    //   // Can only see their own calls
    //   whereClause.company_masters_id = findCompanyId.company_masters_id;
    //   whereClause.a_application_login_id = a_application_login_id;
    // }
    // else {
    //   // Default: Only own data (safest fallback)
    //   whereClause.company_masters_id = findCompanyId.company_masters_id;
    //   whereClause.a_application_login_id = a_application_login_id;
    // }

    const callhistorydata = callhistoryModel(req.tenantDB);

    const callTypeWiseCounts = await callhistorydata.findAll({
      where: whereClause,
      attributes: [
        'call_type',
        [Sequelize.fn('COUNT', col('*')), 'call_type_count']
      ],
      group: ["call_type"],
      raw: true
    });

    const callTypwWiseCount = (callTypeWiseCounts || []).map(k => ({
      [k.call_type]: k.call_type_count
    }));

    // put down this line
    if (call_type != '0') {
      whereClause.call_type = call_type;
    }
    // put down this line

    const callHistoryList = await callhistorydata.findAll({
      where: whereClause,
      order: [["id", "DESC"]],
    });

    if (!callHistoryList?.length) {
      return resError({
        ack_msg: "No Call History Data",
        developer_msg: "Data not found",
      });
    }

    const callData = await Promise.all(
      callHistoryList.map(async (call) => {
        const rawCall = call.toJSON ? call.toJSON() : call;

        const callTypeObj = callTypesShowList.find(
          (c) => c.id === String(rawCall.call_type)
        );

        // Format date & time
        const formattedDate = rawCall.call_date_time
          ? moment(rawCall.call_date_time).format("DD/MM/YYYY")
          : "";

        const callStartTime = rawCall.call_date_time
          ? moment(rawCall.call_date_time).format("HH:mm:ss")
          : "";

        // let callEndTime = "";
        // if (rawCall.call_date_time && rawCall.duration) {
        //   const totalSeconds = rawCall.duration;

        //   // Break duration into hours, minutes, seconds
        //   const hours = Math.floor(totalSeconds / 3600);
        //   const minutes = Math.floor((totalSeconds % 3600) / 60);
        //   const seconds = totalSeconds % 60;

        //   // Add duration to start time
        //   callEndTime = moment(rawCall.call_date_time)
        //     .add(hours, "hours")
        //     .add(minutes, "minutes")
        //     .add(seconds, "seconds")
        //     .format("HH:mm:ss");
        // }

        let callEndTime = "";

        if (rawCall.call_date_time && rawCall.duration) {
          let totalSeconds = 0;

          // ✅ If duration is in "mm:ss" format
          if (typeof rawCall.duration === "string" && rawCall.duration.includes(":")) {
            const parts = rawCall.duration.split(":").map(Number);

            if (parts.length === 2) {
              const [minutes, seconds] = parts;
              totalSeconds = (minutes * 60) + seconds;
            } else if (parts.length === 3) {
              const [hours, minutes, seconds] = parts;
              totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
            }
          }
          // ✅ If already number (fallback safe)
          else {
            totalSeconds = Number(rawCall.duration) || 0;
          }

          callEndTime = moment(rawCall.call_date_time)
            .add(totalSeconds, "seconds")
            .format("HH:mm:ss");
        }



        // Get username (Call By Me)
        let username = "Unknown";
        try {
          const user = await loginModel.findOne({
            where: { id: rawCall.a_application_login_id },
            attributes: ["username"],
          });
          if (user) username = user.username;
        } catch (err) {
          console.error("Error fetching username:", err);
        }

        return {
          id: rawCall.id,
          call_type: callTypeObj?.type || "Unknown",
          call_type_color: callTypeObj?.color || "#999999",
          call_date: formattedDate,
          call_start_time: callStartTime,
          call_end_time: callEndTime,
          duration: `${rawCall.duration || 0}`,
          call_by_me: username,
          remark: rawCall.remark || "",
        };
      })
    );

    return resSuccess({
      data: { items: callData, callTypwWiseCount },
    });
  } catch (e) {
    console.error("Unhandled Error:", e);
    return resBadRequest({
      developer_msg: `Error: ${e.message || e}`,
    });
  }
};




