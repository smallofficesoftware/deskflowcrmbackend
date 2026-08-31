import jwt from "jsonwebtoken";
import moment from "moment";
import nodemailer from "nodemailer";
import { Op } from "sequelize";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";
import loginModel from "../../models/application_login/loginModel.js";
import companyVsApplicationLoginModel from "../../models/company_setup/companyVsApplicationLoginModel.js";
import { ClaudeOfficeWhatsAppOtp } from "../../services/company_setup/thirdPartyIntegrationService.js";
import { REGISTRATION_FLAG_UPDATE_RULE, REQUEST_FLAG } from "../../utils/AppEnumeration.js";
import {
  generateEmailDeleteAccount,
  generateEmailMessage,
  generateOTP,
  generateTextWhatsAppOTPMessage,
  isValidEmail,
  resBadRequest,
  resError,
  resSuccess
} from "../../utils/sharedFunctions.js";
import {
  getCompanyByLoginId,
  getCompanyDetailByLoginId,
  loginHistories,
} from "../commonServices.js";
import { getReviewPromptStatus } from "../company_setup/reviewServices.js";

import { createTransporter } from "../../middlewares/nodemailer.js";
import companyModel from "../../models/company_setup/companyModel.js";
import {
  ADVERTISEMENT_VARIABLE,
  ANDROID_APPLICATION_VERSION,
  ANDROID_UPDATE_VERSION_MSG,
  APPLICATION_APK_URL,
  APPLICATION_APK_URL_ANDROID,
  APPLICATION_APK_URL_IOS,
  APPLICATION_LOGIN_PROFILE_IMG_LINK_EXTENDED,
  APPLICATION_VERSION,
  CALL_HELPER_APP_VERSION,
  CALL_TRACKER_APP_URL,
  CREATE_PLAN_OTP_CREATE_NUM,
  CUSTOMER_SUPPORT_TICKET_ASSING_ID,
  ENCRYPT_WHATSAPP_RESPONSE,
  JWT_TOKEN_EXPIRES_TIME,
  JWT_TOKEN_SIGNATURE,
  LOCATIONS_TIME_FOR_MOBILE,
  LOCATIONS_UPDATE_ON_SERVER,
  MAIL_SETTING_HOST_NAME,
  MAIL_SETTING_HOST_PORT,
  MAIL_SETTING_HOST_USER_NAME,
  MAIL_SETTING_HOST_USER_PASSWORD,
  MASTER_OTP,
  MASTER_PIN,
  RAISE_SUPPORT_TICKET_FLAG,
  SUPPORT_TICKET_INFO_MESSAGE,
  UPDATE_VERSION_MSG,
  MAINTENANCE_BYPASS_IPS,
} from "../../utils/appConstants.js";
// const whatsAppKey = "aa771918-d589-4ad1-a5b0-fca2f3abdf71";
// const whatsappAuthKey = "s9Iz7gqyCfknn1RW0XBAklxQbwJAMHPym2JlRlAa1qNusiTjr1";
// Generate OTP and create new user
import crypto from "crypto";
import fs from "fs-extra";
import path from "path";
import applicationLoginHistoriesModel from "../../models/application_login/applicationLoginHistoriesModel.js";
import { applicationLoginTypeRightModel } from "../../models/application_login/applicationLoginTypeRightModel.js";
import companyVsWhatsappConfigModel from "../../models/company_setup/companyVsWhatsappConfigModel.js";
import miracleConfigModel from "../../models/company_setup/miracleConfigModel.js";
import maintenanceModesModel from "../../models/configuration/maintenanceModesModel.js";
import tenantMasterModel from "../../models/configuration/tenantMasterModel.js";
import { attendanceModel } from "../../models/hr/attendanceModel.js";
import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";
import { cityModel } from "../../models/masters/cityModel.js";
import { stateModel } from "../../models/masters/stateModel.js";

function computeAutoOutTime(lastCheckOutDateTime, defaultDailyOutTime) {
  const lastTime = moment(lastCheckOutDateTime);
  const datePart = lastTime.format("YYYY-MM-DD");
  const defaultOut = moment(`${datePart} ${defaultDailyOutTime}`, "YYYY-MM-DD HH:mm:ss");
  if (lastTime.isAfter(defaultOut)) {
    const candidate = lastTime.clone().add(5, "seconds");
    if (candidate.format("YYYY-MM-DD") !== datePart) {
      return moment(`${datePart} 23:59:59`, "YYYY-MM-DD HH:mm:ss").format("YYYY-MM-DD HH:mm:ss");
    }
    return candidate.format("YYYY-MM-DD HH:mm:ss");
  }
  return defaultOut.format("YYYY-MM-DD HH:mm:ss");
}


export const registerUser = async (req, res) => {
  try {
    const {
      username,
      contact_number,
      recovery_email,
      registration_flag,
      isActive,
      isDelete,
      android_refresh_token,
      ios_refresh_token,
      web_refresh_token
    } = req.body;

    // Check existing user (mobile OR email)
    const existingUser = await loginModel.findOne({
      where: { recovery_mobile: contact_number, isDelete: "0" },
    });

    const existingEmail = await loginModel.findOne({
      where: { recovery_email: recovery_email, isDelete: "0" },
    });

    const matchedUser = existingUser || existingEmail;

    // ================= EXISTING USER FLOW =================
    if (matchedUser) {
      const loginId = matchedUser.dataValues.id;

      // Check company mapping
      const companyVsLogin = await companyVsApplicationLoginModel.findOne({
        where: { a_application_login_id: loginId, isDelete: 0 },
      });

      //Already linked
      if (companyVsLogin) {
        return resError({
          ack_msg: "You are already registered",
          developer_msg: "User already mapped in companyVsApplicationLoginModel",
        });
      }

      // Not linked → send OTP (NO new entry)
      const otp = generateOTP(6);

      await loginModel.update(
        { otp: otp },
        { where: { id: loginId } }
      );

      // WhatsApp OTP
      try {
        await ClaudeOfficeWhatsAppOtp(
          otp,
          matchedUser.dataValues.recovery_mobile
        );
      } catch (err) {
        return resError({
          ack_msg: "Failed to send WhatsApp OTP",
          developer_msg: err.message,
        });
      }

      // Email OTP
      try {
        const message = generateEmailMessage({ otp });

        const transporter = nodemailer.createTransport({
          host: MAIL_SETTING_HOST_NAME,
          port: MAIL_SETTING_HOST_PORT,
          secure: true,
          auth: {
            user: MAIL_SETTING_HOST_USER_NAME,
            pass: MAIL_SETTING_HOST_USER_PASSWORD,
          },
        });

        await transporter.verify();

        await transporter.sendMail({
          from: MAIL_SETTING_HOST_USER_NAME,
          to: matchedUser.dataValues.recovery_email,
          subject: "Deskflow CRM – Account Verification OTP",
          html: message,
        });
      } catch (emailError) {
        console.error("Email OTP failed:", emailError);
      }

      return resSuccess({
        ack_msg: "OTP sent successfully",
        data: matchedUser,
      });
    }

    // ================= NEW USER FLOW =================
    const otp = generateOTP(6);
    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");

    const registerBody = {
      username: username,
      recovery_mobile: contact_number,
      recovery_email: recovery_email,
      android_refresh_token: android_refresh_token || "",
      ios_refresh_token: ios_refresh_token || "",
      web_refresh_token: web_refresh_token || "",
      otp: otp,
      registration_flag: registration_flag,
      isActive: isActive || 1,
      isDelete: isDelete || 0,
      created_date_time: formattedDate.toString(),
    };

    const newUser = await loginModel.create(registerBody);

    if (!newUser) {
      return resError({
        ack_msg: "User creation failed",
        developer_msg: "Insert failed",
      });
    }

    // WhatsApp OTP
    try {
      await ClaudeOfficeWhatsAppOtp(otp, contact_number);
    } catch (err) {
      return resError({
        ack_msg: "Failed to send WhatsApp OTP",
        developer_msg: err.message,
      });
    }

    // Email OTP
    try {
      const message = generateEmailMessage({ otp });

      const transporter = nodemailer.createTransport({
        host: MAIL_SETTING_HOST_NAME,
        port: MAIL_SETTING_HOST_PORT,
        secure: true,
        auth: {
          user: MAIL_SETTING_HOST_USER_NAME,
          pass: MAIL_SETTING_HOST_USER_PASSWORD,
        },
      });

      await transporter.verify();

      await transporter.sendMail({
        from: MAIL_SETTING_HOST_USER_NAME,
        to: recovery_email,
        subject: "Deskflow CRM – Account Verification OTP",
        html: message,
      });
    } catch (err) {
      console.error("Email sending failed:", err);
    }

    return resSuccess({
      ack_msg: "User registered successfully",
      data: newUser,
    });

  } catch (error) {
    console.error("Error registering user:", error);
    return resBadRequest();
  }
};


export const loginUser = async (req, res) => {
  const { contact_number, android_refresh_token, ios_refresh_token } = req.body;

  try {
    // await sleep(120 * 1000) // 1200 seconds
    const isEmailLogin = contact_number.includes("@");
    const user = await loginModel.findOne({
      where: {
        isDelete: "0",
        [Op.or]: [
          { recovery_mobile: contact_number },
          { recovery_email: contact_number },
        ],
      },
    });

    if (!user) {
      return resError({
        ack_msg: "Please use a different number or sign up",
        developer_msg: "User not found",
      });
    }

    const isOwner = await companyVsApplicationLoginModel.findOne({
      where: {
        a_application_login_id: user.dataValues.id,
      },
    });
    let isOwnerFlag;
    if (isOwner) {
      isOwnerFlag = isOwner.dataValues.company_flag === 1 ? true : false;
    } else {
      isOwnerFlag = false;
    }

    const userPin = user.dataValues.login_pin;
    const hasPin = userPin && userPin.toString().length >= 4;

    let responseData = {};

    let updateData = {};

    if (android_refresh_token) {
      updateData.android_refresh_token = android_refresh_token;
    }
    if (ios_refresh_token) {
      updateData.ios_refresh_token = ios_refresh_token;
    }

    if (hasPin) {
      // Case 1: User has PIN Return haspin in response
      responseData = {
        haspin: "1",
        isOwner: isOwnerFlag
      };
    } else {
      // Case 2: No PIN Generate OTP, send WhatsApp, return otp
      const otp = generateOTP(6);
      updateData.otp = otp;
      responseData = {
        otp: "2",
        isOwner: isOwnerFlag
      };

      ClaudeOfficeWhatsAppOtp(otp, user.dataValues.recovery_mobile);

      if (isValidEmail(user.dataValues.recovery_email)) {
        try {
          const message = generateEmailMessage({ otp });
          const transporter = nodemailer.createTransport({
            host: MAIL_SETTING_HOST_NAME,
            port: MAIL_SETTING_HOST_PORT,
            secure: true,
            auth: {
              user: MAIL_SETTING_HOST_USER_NAME,
              pass: MAIL_SETTING_HOST_USER_PASSWORD,
            },
          });
          await transporter.verify();
          const mailOptions = {
            from: MAIL_SETTING_HOST_USER_NAME,
            to: user.dataValues.recovery_email,
            subject: "Deskflow CRM Account Verification OTP",
            html: message,
          };
          await transporter.sendMail(mailOptions);
        } catch (err) {
          console.error("Error with email transport or sending:", err);
          return resBadRequest({ developer_msg: err.message });
        }
      }
    }

    const updateWhere = isEmailLogin
      ? { recovery_email: contact_number }
      : { recovery_mobile: contact_number };


    if (Object.keys(updateData).length > 0) {
      await loginModel.update(updateData, {
        where: updateWhere,
      });
    }

    return resSuccess({
      data: responseData,
    });
  } catch (error) {
    console.log("login Error", error);

    return resBadRequest({ developer_msg: error.message });
  }
};

export const changePicProfile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a file" });
    }
    let directoryPath;
    let convertPath = ""; // Initialize media URL as null
    let mediaName = ""; // Initialize media name as null
    const { id } = req.body;
    let profile_pic = req.file.path;
    const fileName = path.basename(profile_pic);
    if (profile_pic) {
      directoryPath = path.join(
        process.cwd(),
        "media-folder",
        "profile_photo",
        req.body.id.toString()
      );

      await fs.mkdirp(directoryPath);
      const filePath = profile_pic;
      const fileName = path.basename(filePath);
      const destinationPath = path.join(directoryPath, fileName);
      await fs.move(filePath, destinationPath);

      // Set the media URL and media name for the database entry
      convertPath = id.toString() + "/" + fileName;
    }

    // Update the user's profile pic in the database
    const updatedUser = await loginModel.update(
      { profile_pic: convertPath },
      {
        where: { id: id },
      }
    );
    return resSuccess({
      data: updatedUser,
      developer_msg: "Profile image change successful ",
    });
  } catch (err) {
    console.error(err);
    return resBadRequest({ developer_msg: err });
  }
};

export const verifyOtp = async (req, res) => {
  let { contact_number, otp, request_flag, platform } = req.body;

  try {
    let user;
    let token;
    let device_id;
    let checkDuplicate;
    let checkCompanyAlreadyExists;
    let findItShouldPayornot = 0;
    let device_id_obj;
    let workspacesList = [];

    // Find user and check if they have a PIN
    const userExist = await loginModel.findOne({
      where: {
        isDelete: "0",
        [Op.or]: [
          { recovery_mobile: contact_number },
          { recovery_email: contact_number },
        ],
      },
    });
    // return user/Exist
    const mobile_number = userExist.dataValues.recovery_mobile;

    if (!userExist) {
      return resError({
        ack_msg: "User not found",
        developer_msg: "User not found with this contact number",
      });
    }

    const userPin = userExist.dataValues.login_pin;
    const hasPin = userPin && userPin.toString().length >= 4;
    let setCompanyFlag = "";
    // Master OTP bypass (for admin/testing)
    let isMasterBypass = false;

    if (hasPin) {
      // This is PIN flow → only Master PIN should work as bypass
      if (otp == MASTER_PIN) {
        isMasterBypass = true;
      }
    } else {
      // This is OTP flow → only Master OTP should work as bypass
      if (otp == MASTER_OTP) {
        isMasterBypass = true;
      }
    }

    // Set checkDuplicate based on verification type
    if (isMasterBypass) {
      // Bypass: just check user exists (no OTP/PIN match needed)
      checkDuplicate = {
        recovery_mobile: mobile_number,
        isDelete: "0",
      };
    } else if (hasPin && otp == userPin) {
      // Normal PIN match
      checkDuplicate = {
        recovery_mobile: mobile_number,
        isDelete: "0",
      };
    } else {
      // Normal OTP match
      checkDuplicate = {
        recovery_mobile: mobile_number,
        otp,
        isDelete: "0",
      };
    }

    let expiryMsg;
    let daysUntilExpiry;

    if (
      request_flag === REQUEST_FLAG.Login ||
      request_flag === REQUEST_FLAG.Register
    ) {
      user = await loginModel.findOne({
        where: checkDuplicate,
        attributes: ["username", "id", "recovery_mobile", "recovery_email", "registration_flag", "isOtpVerified", "is_email_verified"]
      });

      if (!user) {
        return resError({
          ack_msg: hasPin ? "Invalid PIN" : "Invalid OTP",
          developer_msg: "Verification failed",
        });
      }

      const findApplicationId = user.dataValues.id;

      const updateData = { login_pin: "" };

      if (!hasPin && otp != userPin && user) {
        if (user.dataValues.registration_flag == '1') {
          updateData.is_email_verified = 1;
        } else if (user.dataValues.registration_flag == '2') {
          updateData.isOtpVerified = 1;
        } else {
          updateData.isOtpVerified = 1;
        }
        const loginPin = await loginModel.update(updateData, {
          where: {
            id: findApplicationId,
            isDelete: 0,
          },
        });
      }

      // Fetch all companies/workspaces mapped to the user
      const userCompanies = await companyVsApplicationLoginModel.findAll({
        where: { a_application_login_id: findApplicationId, isDelete: 0 },
        attributes: ["company_masters_id", "company_flag"]
      });

      const companyIds = userCompanies.map(c => c.company_masters_id);

      if (companyIds.length > 0) {
        const companiesInfo = await companyModel.findAll({
          where: { id: companyIds, isDelete: "0" },
          attributes: ["id", "company_name", "parent_company_id"]
        });

        const ownerCompanyIds = userCompanies
          .filter(c => c.company_flag === 1)
          .map(c => c.company_masters_id);

        let ownerChildCompanies = [];
        if (ownerCompanyIds.length > 0) {
          ownerChildCompanies = await companyModel.findAll({
            where: { parent_company_id: ownerCompanyIds, isDelete: "0" },
            attributes: ["id", "company_name", "parent_company_id"]
          });
        }

        const combined = [...companiesInfo, ...ownerChildCompanies];
        const seenIds = new Set();
        for (const item of combined) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            workspacesList.push({
              id: item.id,
              company_name: item.company_name,
              parent_company_id: item.parent_company_id
            });
          }
        }
      }

      // If user has multiple workspaces, we need to defer selection
      const hasMultipleWorkspaces = workspacesList.length > 1;
      let activeCompanyId = null;

      if (workspacesList.length === 1) {
        activeCompanyId = workspacesList[0].id;
      }

      const verifyCompanyIs = activeCompanyId
        ? await companyVsApplicationLoginModel.findOne({
          where: { a_application_login_id: findApplicationId, company_masters_id: activeCompanyId, isDelete: "0" },
        })
        : null;

      setCompanyFlag = verifyCompanyIs ? verifyCompanyIs.dataValues.company_flag : (userCompanies.length > 0 ? userCompanies[0].company_flag : 2);

      findItShouldPayornot = activeCompanyId
        ? await companyModel.findOne({
          where: {
            id: activeCompanyId,
            isDelete: "0",
          },
        })
        : null;

      let verifyTenantId = null;
      const verifyApplicationLoginId = userCompanies.length > 0;

      if (activeCompanyId) {
        if (request_flag === REQUEST_FLAG.Register) {
          verifyTenantId = await tenantMasterModel.findOne({
            where: {
              isDelete: 0,
              a_application_login_id: findApplicationId,
            },
          });
        } else if (request_flag === REQUEST_FLAG.Login) {
          verifyTenantId = await tenantMasterModel.findOne({
            where: {
              isDelete: 0,
              company_masters_id: activeCompanyId,
            },
          });
        }
      }

      if (hasMultipleWorkspaces) {
        // Return multiple workspaces state, do not issue final workspace token yet
        token = jwt.sign({ id: user.id }, JWT_TOKEN_SIGNATURE, {
          expiresIn: JWT_TOKEN_EXPIRES_TIME,
        });
        checkCompanyAlreadyExists = 5; // 5 = Multiple workspaces
      } else if (
        activeCompanyId &&
        findItShouldPayornot?.dataValues.plan_id !== 0
      ) {
        if (!verifyTenantId && request_flag === REQUEST_FLAG.Login) {
          return resSuccess({
            data: {
              item: user,
              checkCompanyAlreadyExists: 4,
              findItShouldPayornot,
              workspaces: workspacesList
            },
          });
        }

        token = jwt.sign({ id: user.id, companyId: activeCompanyId }, JWT_TOKEN_SIGNATURE, {
          expiresIn: JWT_TOKEN_EXPIRES_TIME,
        });

        checkCompanyAlreadyExists = 1;

        // Plan expiry calculation
        const currentDate = new Date();
        const planExpiryDate = new Date(
          findItShouldPayornot?.dataValues.plan_expiry_date
        );

        const normalizedCurrentDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate()
        );

        const normalizedPlanExpiryDate = new Date(
          planExpiryDate.getFullYear(),
          planExpiryDate.getMonth(),
          planExpiryDate.getDate()
        );

        const timeDifference =
          normalizedPlanExpiryDate.getTime() - normalizedCurrentDate.getTime();
        daysUntilExpiry = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));

        const expiryCountdown =
          daysUntilExpiry >= 0 && daysUntilExpiry <= 5
            ? daysUntilExpiry
            : daysUntilExpiry > 5
              ? daysUntilExpiry
              : null;

        expiryMsg =
          expiryCountdown <= 5
            ? `Your Account will Expire in ${expiryCountdown} Days`
            : daysUntilExpiry > 5
              ? -1
              : null;

        if (request_flag === REQUEST_FLAG.Login) {
          await loginHistories({
            a_application_login_id: findApplicationId,
          });
        }
      } else {
        checkCompanyAlreadyExists = verifyApplicationLoginId ? 2 : 3;
      }
      // if (!isMasterBypass) {
      /* Device ID token generate */
      device_id = jwt.sign({ id: user.id + '_device_id' }, JWT_TOKEN_SIGNATURE, {
        expiresIn: JWT_TOKEN_EXPIRES_TIME,
      });

      if (platform == 'web') {
        device_id_obj = { web_device_token: device_id, web_last_login: moment(new Date()).format("YYYY-MM-DD HH:mm:ss") }
      } else if (platform == 'ios') {
        device_id_obj = { ios_device_token: device_id, ios_last_login: moment(new Date()).format("YYYY-MM-DD HH:mm:ss") }
      } else if (platform == 'android') {
        device_id_obj = { android_device_token: device_id, android_last_login: moment(new Date()).format("YYYY-MM-DD HH:mm:ss") }
      }

      if (device_id_obj) {
        await loginModel.update(device_id_obj, {
          where: {
            id: findApplicationId,
            isDelete: 0,
          },
        });
      }
      /* Device ID token generate */
      // }

    } else {
      return resError({
        ack_msg: "Invalid request flag",
        developer_msg: "Request flag is invalid",
      });
    }

    const daysExpiry = daysUntilExpiry < 0 ? -1 : daysUntilExpiry;

    return resSuccess({
      data: {
        item: user,
        token,
        device_id,
        checkCompanyAlreadyExists,
        findItShouldPayornot,
        expiryMsg,
        daysExpiry,
        hasPin: hasPin, // Include hasPin in response for client-side handling
        company_flag: setCompanyFlag,
        workspaces: workspacesList
      },
    });
  } catch (error) {
    console.log("ooootttttttpppppp", error);

    return resBadRequest({
      ack_msg: "An error occurred during verification",
      developer_msg: `${error.message}`,
    });
  }
};
export const otpSendEmailOrNumberDeleteAccount = async (req, res) => {
  let { loginId, contact_number, emailId } = req.body;
  try {
    if (contact_number) {
      let user;

      const resultLogin = await loginModel.findOne({
        where: { id: loginId, recovery_mobile: contact_number, isDelete: "0" },
      });
      let otp;
      if (resultLogin) {
        otp = generateOTP(6);
        let contactBody = {
          otp: otp,
        };
        user = await loginModel.update(contactBody, {
          where: { id: loginId, isDelete: "0" },
        });
      } else {
        return resError({
          ack_msg: "Your number is not register with us",
          developer_msg: "User data not data not found",
        });
      }
      if (user) {
        const message = generateTextWhatsAppOTPMessage({ otp });
        const whatsappReqestFlag = "otp";
        // addContactByWhatsApps(
        //   req,
        //   whatsappReqestFlag,
        //   WHATSAPP_SEND_ADD_PRE_NUMBER + contact_number,
        //   message,
        //   "",
        //   SUPER_ADMIN_WHATSAPP_APP_KEY,
        //   SUPER_ADMIN_WHATSAPP_AUTH_KEY
        // );
        ClaudeOfficeWhatsAppOtp(otp, contact_number);
      } else {
        return resError({
          ack_msg: "Your number is not proper",
          developer_msg: "User data not data not found",
        });
      }
      return resSuccess({
        data: user,
      });
    } else {
      const resultLoginEmail = await loginModel.findOne({
        where: { id: loginId, recovery_email: emailId, isDelete: "0" },
      });
      let otp;
      if (resultLoginEmail) {
        otp = generateOTP(6);
        let contactBody = {
          otp: otp,
        };
        const user = await loginModel.update(contactBody, {
          where: { id: loginId, isDelete: "0" },
        });
        if (user) {
          // Verify transporter
          const transporter = await createTransporter(loginId);
          transporter.verify(async function (error, success) {
            if (error) {
              return resError({
                ack_msg: "Verification Failed",
                developer_msg: `Mail is not Verification Transporter verification failed ${error.message}`,
              });
            } else {
              // Choose Gmail or Webmail based on the request parameter
              const selectedTransporter = await createTransporter(loginId);
              const message = generateEmailDeleteAccount({ otp });
              const findCompanyEmail = await getCompanyDetailByLoginId(loginId);

              const mailOptions = {
                from: findCompanyEmail.mail_id_setup,
                to: resultLoginEmail.dataValues.recovery_email,
                subject: "Deskflow CRM Account Verification OTP", // Default to 'No Subject' if not provided
                html: message || "",
              };

              // Send the email
              selectedTransporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                  return res
                    .status(500)
                    .json({ message: "Failed to send email", error });
                }
                res
                  .status(200)
                  .json({ message: "Email sent successfully", info });
              });
            }
          });
          return resSuccess({
            data: user,
          });
        } else {
        }
      } else {
        return resError({
          ack_msg: "Your emailId is not register",
          developer_msg: "User data not data not found",
        });
      }
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error}`,
    });
  }
};
export const otpSendChangeNumber = async (req, res) => {
  let { loginId, contact_number } = req.body;
  try {
    let user;
    if (!contact_number) {
      return resError({
        ack_msg: "Please write Mobile Number",
        developer_msg: "Contact Number Blank",
      });
    }
    const resultLogin = await loginModel.findOne({
      where: { recovery_mobile: contact_number, isDelete: "0" },
    });
    let otp;
    if (!resultLogin) {
      otp = generateOTP(6);
      let contactBody = {
        otp: otp,
      };
      user = await loginModel.update(contactBody, {
        where: { id: loginId, isDelete: "0" },
      });
    } else {
      return resError({
        ack_msg: "Your number is register with us , Please change the Number",
        developer_msg: "Number is already exist",
      });
    }
    if (user) {
      const message = generateTextWhatsAppOTPMessage({ otp });
      const whatsappReqestFlag = "otp";
      // addContactByWhatsApps(
      //   req,
      //   whatsappReqestFlag,
      //   WHATSAPP_SEND_ADD_PRE_NUMBER + contact_number,
      //   message,
      //   "",
      //   SUPER_ADMIN_WHATSAPP_APP_KEY,
      //   SUPER_ADMIN_WHATSAPP_AUTH_KEY
      // );
      ClaudeOfficeWhatsAppOtp(otp, contact_number);
    } else {
      return resError({
        ack_msg: "Your number is not proper",
        developer_msg: "User data not data not found",
      });
    }
    return resSuccess({
      data: user,
    });
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error}`,
    });
  }
};

export const otpSendEmailVerifyProfile = async (req, res) => {
  const { loginId } = req.body;

  try {
    // Fetch user login details
    const resultLoginEmail = await loginModel.findOne({
      where: { id: loginId, isDelete: "0" },
      attributes: ["id", "recovery_email"],
    });

    if (!resultLoginEmail) {
      return resError({
        ack_msg: "Your email is not registered",
        developer_msg: "User data not found",
      });
    }

    const recoveryEmail = resultLoginEmail.dataValues.recovery_email;
    if (!recoveryEmail) {
      return resError({
        ack_msg: "No recovery email found",
        developer_msg: "Recovery email is not set for this user",
      });
    }

    // Generate OTP
    const otp = generateOTP(6);
    const contactBody = { otp };

    // Update user with OTP
    const user = await loginModel.update(contactBody, {
      where: { id: loginId, isDelete: "0" },
    });

    if (!user) {
      return resError({
        ack_msg: "Failed to update OTP",
        developer_msg: "User OTP update failed",
      });
    }

    // Create transporter
    let transporter;
    let mailOptions;

    // WhatsApp OTP email configuration
    transporter = nodemailer.createTransport({
      host: MAIL_SETTING_HOST_NAME,
      port: MAIL_SETTING_HOST_PORT,
      secure: true,
      auth: {
        user: MAIL_SETTING_HOST_USER_NAME,
        pass: MAIL_SETTING_HOST_USER_PASSWORD,
      },
    });

    mailOptions = {
      from: MAIL_SETTING_HOST_USER_NAME,
      to: recoveryEmail,
      subject: "Deskflow CRM Account Verification OTP",
      html: generateEmailMessage({ otp }) || `Your OTP is: ${otp}`,
    };

    // Verify transporter and send email
    try {
      await transporter.verify();
      const info = await transporter.sendMail(mailOptions);

      return resSuccess({
        ack_msg: "Email sent successfully",
        developer_msg: "",
        data: { user, info, otp },
      });
    } catch (error) {
      return resError({
        ack_msg: "Failed to send email",
        developer_msg: `Email sending failed: ${error.message}`,
      });
    }
  } catch (error) {
    return resBadRequest({
      ack_msg: "Internal server error",
      developer_msg: `Unexpected error: ${error.message}`,
    });
  }
};

export const verifyOtpForChangeNumber = async (req, res) => {
  let { contact_number, otp, loginId } = req.body;

  try {
    let checkDuplicate;
    if (!contact_number) {
      return resError({
        ack_msg: "Please write Mobile Number.",
        developer_msg: "Contact Number is blank",
      });
    }
    if (!otp) {
      return resError({
        ack_msg: "Please write otp",
        developer_msg: "otp is blank",
      });
    }
    if (otp == MASTER_OTP) {
      checkDuplicate = {
        id: loginId,
        isDelete: "0",
      };
    } else {
      checkDuplicate = {
        id: loginId,
        otp,
        isDelete: "0",
      };
    }
    const user = await loginModel.findOne({
      where: checkDuplicate,
    });
    if (user) {
      const loginBody = {
        recovery_mobile: contact_number,
      };
      const updateUser = await loginModel.update(loginBody, {
        where: checkDuplicate,
      });

      if (!updateUser) {
        return resError({
          developer_msg: "Data not match-2",
        });
      }
      return resSuccess({
        data: updateUser,
        developer_msg: "Your Account Number change  successfully",
      });
    } else {
      return resError({
        ack_msg: "Please enter valid otp",
        developer_msg: "Data not match-3",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error}`,
    });
    throw error;
  }
};
export const verifyOtpForDeleteAccount = async (req, res) => {
  let { contact_number, otp, emailId, loginId } = req.body;

  try {
    let checkDuplicate;
    let checkDuplicateCompany;
    if (!otp) {
      return resError({
        ack_msg: "Please write otp",
        developer_msg: "otp is blank",
      });
    }
    if (otp == MASTER_OTP) {
      checkDuplicate = {
        id: loginId,
        isDelete: "0",
      };
      checkDuplicateCompany = {
        a_application_login_id: loginId,
        isDelete: "0",
      };
    } else {
      checkDuplicate = {
        id: loginId,
        otp,
        isDelete: "0",
      };
      checkDuplicateCompany = {
        a_application_login_id: loginId,
        otp,
        isDelete: "0",
      };
    }

    const companyFlag = await companyModel.findOne({
      where: {
        a_application_login_id: loginId,
      },
      attributes: ["id"],
    });
    // return(companyFlag)

    const user = await loginModel.findOne({
      where: checkDuplicate,
    });
    // return(user)
    if (user) {
      const loginBody = {
        isDelete: "1",
      };

      const updateUser = await loginModel.update(loginBody, {
        where: checkDuplicate,
      });
      const companyVsApplicationBody = {
        isDelete: "1",
      };
      const companyVslogin = await companyVsApplicationLoginModel.update(
        companyVsApplicationBody,
        {
          where: {
            a_application_login_id: loginId,
          },
        }
      );

      if (!updateUser && !companyVslogin) {
        return resError({
          developer_msg: "Data not match-4",
        });
      }

      if (companyFlag) {
        if (companyFlag.id) {

          const companyBody = {
            isDelete: "1",
          };
          const companyUpdate = await companyModel.update(companyBody, {
            where: {
              id: companyFlag.id,
            },
          });

          const companyVsApplicationBody = {
            isDelete: "1",
          };

          const companyVsApplication =
            await companyVsApplicationLoginModel.update(
              companyVsApplicationBody,
              {
                where: {
                  company_masters_id: companyFlag.id,
                },
              }
            );
        }
        return resSuccess({
          data: updateUser,
          developer_msg: "Your Account & Company is Deleted successfully",
        });
      } else {
        return resSuccess({
          data: updateUser,
          developer_msg: "Your Account is Deleted successfully",
        });
      }
      return resSuccess({
        data: updateUser,
        developer_msg: "Your Account is Deleted successfully",
      });
    } else {
      return resError({
        ack_msg: "Please enter valid otp",
        developer_msg: "Data not match-5",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error}`,
    });
    throw error;
  }
};
export const verifyEmailProfile = async (req, res) => {
  let { otp, loginId } = req.body;

  try {
    let checkDuplicate;
    if (!otp) {
      return resError({
        ack_msg: "Please write otp",
        developer_msg: "otp is blank",
      });
    }
    if (otp == MASTER_OTP) {
      checkDuplicate = {
        id: loginId,
        isDelete: "0",
      };
    } else {
      checkDuplicate = {
        id: loginId,
        otp,
        isDelete: "0",
      };
    }
    const user = await loginModel.findOne({
      where: checkDuplicate,
      attributes: ['id', 'isOtpVerified'],
      raw: true
    });
    if (user) {
      const registration_flag = REGISTRATION_FLAG_UPDATE_RULE[`1_${user.isOtpVerified}`];
      const loginBody = {
        is_email_verified: 1,
        registration_flag: registration_flag,
      };
      const updateUser = await loginModel.update(loginBody, {
        where: checkDuplicate,
      });
      if (!updateUser) {
        return resError({
          developer_msg: "Data not match-8",
        });
      }
      return resSuccess({
        data: updateUser,
        developer_msg: "Your Email Verified successfully ",
      });
    } else {
      return resError({
        ack_msg: "Please enter valid otp",
        developer_msg: "Data not match-9",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `${error.msg}`,
    });
  }
};
export const getLoginById = async (req) => {
  try {
    const { loginId } = req.body;
    if (!loginId) {
      return resError({
        ack_msg: "Login id is Required",
        developer_msg: "Data not match-10",
      });
    }

    const findContact = await loginModel.findOne({
      where: {
        id: loginId,
        isDelete: "0",
      },
    });
    const setWithImgPath = {
      ...findContact.dataValues, // Spread all other properties
      profile_pic: findContact.dataValues.profile_pic
        ? APPLICATION_LOGIN_PROFILE_IMG_LINK_EXTENDED +
        findContact.dataValues.profile_pic
        : "", // Update the profile_pic property
    };

    if (findContact) {
      return resSuccess({
        data: setWithImgPath,
      });
    } else {
      return resError({
        ack_msg: "Login id is Required",
        developer_msg: "Data not match-11",
      });
    }
  } catch (e) {
    throw e;
  }
};

export const onLoad = async (req, res) => {
  try {
    let daysUntilExpiry;
    let expiryDays;
    // await sleep(120 * 1000) // 1200 seconds
    const { a_application_login_id, device_id, platform } = req.body;

    /* ===================== MAINTENANCE ===================== */
    let clientIp =
      req.headers["cf-connecting-ip"] ||
      req.headers["x-real-ip"] ||
      (req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0].trim() : null) ||
      req.ip ||
      req.socket?.remoteAddress ||
      "";
    if (clientIp.startsWith("::ffff:")) clientIp = clientIp.replace("::ffff:", "");
    const isIpBypassed = clientIp && MAINTENANCE_BYPASS_IPS.includes(clientIp.trim());

    if (!isIpBypassed) {
      const setting = await maintenanceModesModel.findOne({
        where: { isDelete: 0 },
      });

      if (setting && setting.dataValues.is_maintenance === 1) {
        return resError({
          ack: -1,
          ack_msg: "Service Unavailable. We are currently undergoing maintenance.",
          developer_msg: "Service Unavailable. We are currently undergoing maintenance.",
        });
      }
    }
    // const employeePayrollInc = await employeePayrollModel(req.tenantDB)
    /* ===================== LOGIN ===================== */
    const findLogin = await loginModel.findOne({
      where: {
        id: a_application_login_id,
        isDelete: "0",
      },
      raw: true,
      attributes: [
        "login_pin",
        "id",
        "isActive",
      ],
    });

    if (!findLogin) {
      return resError({
        ack: 0,
        ack_msg: "No user found.",
        developer_msg: "No user found.",
      });
    }
    if (findLogin.isActive == 0) {
      return resError({
        ack: 0,
        ack_msg: "Your account is deactivated. Access is restricted.",
        developer_msg: "isActive 0.",
      });
    }

    const PinNumber = Number(findLogin.login_pin);

    /* ===================== DEVICE CHECK ===================== */
    if (device_id) {
      const whereDeviceCheck = {
        id: a_application_login_id,
        isDelete: "0",
      };

      if (platform === "web") whereDeviceCheck.web_device_token = device_id;
      if (platform === "ios") whereDeviceCheck.ios_device_token = device_id;
      if (platform === "android") whereDeviceCheck.android_device_token = device_id;

      const checkDeviceIdDb = await loginModel.findOne({
        where: whereDeviceCheck,
        attributes: ["id"],
      });

      if (!checkDeviceIdDb) {
        return resError({
          ack: 0,
          ack_msg: "Logged out from this platform.",
          developer_msg: "Logged out from this platform.",
        });
      }
    }

    /* ===================== COMPANY & RIGHTS ===================== */
    // Ensure x-company-id is propagated from the JWT (set during selectWorkspace).
    // This guarantees getCompanyByLoginId resolves the active workspace,
    // not the fallback (oldest) company mapping.
    if (req.user?.companyId && !req.headers["x-company-id"]) {
      req.headers["x-company-id"] = String(req.user.companyId);
    }
    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    const applicationLoginTypeRightModelIntance = applicationLoginTypeRightModel(req.tenantDB);
    const resultRights = await applicationLoginTypeRightModelIntance.findAll({
      where: {
        a_application_login_id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
      },
      attributes: ["a_page_id_rights_jason", "page_id", "page_name"],
    });

    /* ===================== TENANT ===================== */
    req.headers["x-tenant-id"] = findLogin.id;

    await new Promise((resolve, reject) => {
      tenantMiddleware(req, res, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    const AttendanceModel = attendanceModel(req.tenantDB);
    const empPayrollModel = employeePayrollModel(req.tenantDB);

    const employee = await empPayrollModel.findOne({
      where: {
        a_application_login_id: req.body.a_application_login_id,
        isDelete: 0,
      },
      attributes: ["compulsary_attendance", "compulsary_attendance_image", "daily_out_time"],
      raw: true,
    });

    /* ===================== ATTENDANCE ===================== */
    const startOfDay = moment().startOf("day").format("YYYY-MM-DD HH:mm:ss");
    const endOfDay = moment().endOf("day").format("YYYY-MM-DD HH:mm:ss");

    const todayAttendance = await AttendanceModel.findOne({
      where: {
        a_application_login_id: findLogin.id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        check_in_out_date_time: { [Op.between]: [startOfDay, endOfDay] },
      },
      raw: true,
      attributes: ["attendance_status"],
      order: [["check_in_out_date_time", "DESC"]],
      limit: 1,
    });

    const compulsary_attendance = employee ? employee.compulsary_attendance == 1 : false;
    const compulsary_attendance_image = employee ? employee.compulsary_attendance_image == 1 : false;
    const hasCheckedInToday =
      todayAttendance ? todayAttendance.attendance_status === 1 : false;

    /* ===================== AUTO CHECK-OUT ===================== */
    const lastAttendance = await AttendanceModel.findOne({
      where: {
        a_application_login_id: findLogin.id,
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        check_in_out_date_time: { [Op.lt]: startOfDay },
      },
      raw: true,
      attributes: ["attendance_status", "check_in_out_date_time"],
      order: [["check_in_out_date_time", "DESC"]],
    });

    if (lastAttendance && lastAttendance.attendance_status === 1) {
      const dailyOutTime =
        employee?.daily_out_time && employee?.daily_out_time !== "00:00:00"
          ? employee?.daily_out_time
          : "20:00:00";

      const autoOutTime = computeAutoOutTime(
        lastAttendance.check_in_out_date_time,
        dailyOutTime
      );

      const inTime = moment(lastAttendance.check_in_out_date_time);
      const outTime = moment(autoOutTime);
      const duration = moment.duration(outTime.diff(inTime));

      const hours = String(Math.floor(duration.asHours())).padStart(2, "0");
      const minutes = String(duration.minutes()).padStart(2, "0");
      const seconds = String(duration.seconds()).padStart(2, "0");

      await AttendanceModel.create({
        a_application_login_id: findLogin.id,
        company_masters_id: findCompanyId.company_masters_id,
        attendance_status: 2,
        attendance_entry_flag: 2,
        check_in_out_date_time: autoOutTime,
        isDelete: 0,
        created_date_time: moment().format("YYYY-MM-DD HH:mm:ss"),
        image_url: "",
        total_working_hour: `${hours}:${minutes}:${seconds}`,
      });
    }

    /* ===================== PLAN CHECK ===================== */
    let company_id_pay_or_not = findCompanyId.company_masters_id;

    if (findCompanyId.company_flag === 2) {
      const teamPlan = await companyVsApplicationLoginModel.findOne({
        where: {
          isDelete: 0,
          company_masters_id: findCompanyId.company_masters_id,
          company_flag: 1,
        },
        attributes: ["company_masters_id"],
      });

      company_id_pay_or_not = teamPlan.company_masters_id;
    }

    const findItShouldPayornot = await companyModel.findOne({
      where: { id: company_id_pay_or_not, isDelete: "0" },
      raw: true,
      attributes: ["plan_id", "plan_expiry_date", "qr_code"],
    });

    if (findItShouldPayornot.plan_id !== 0) {
      const invalidDates = ["0000-00-00", "0000-01-01", "1970-01-01"];

      if (
        !findItShouldPayornot.plan_expiry_date ||
        invalidDates.includes(findItShouldPayornot.plan_expiry_date)
      ) {
        return resError({
          ack_msg: "Unauthorized",
          developer_msg: "Something went wrong",
        });
      }

      const today = new Date();
      const expiry = new Date(findItShouldPayornot.plan_expiry_date);

      const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const normalizedExpiry = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());

      daysUntilExpiry = Math.ceil(
        (normalizedExpiry - normalizedToday) / (1000 * 60 * 60 * 24)
      );
    }
    const byPassCompany = [2];
    const raise_support_ticket_flag = byPassCompany.includes(findCompanyId.company_masters_id) ? 2 : RAISE_SUPPORT_TICKET_FLAG

    const getMiracleFlag = await miracleConfigModel.findOne({
      where: {
        isDelete: 0,
        company_id: findCompanyId.company_masters_id,
        client_id: { [Op.ne]: '' },
        api_key: { [Op.ne]: '' }
      }
    })

    const getWhatsappPlatformFlag = await companyVsWhatsappConfigModel.findOne({
      where: {
        isDelete: 0,
        company_id: findCompanyId.company_masters_id
      },
      raw: true,
      attributes: ["plateform", "configured_type"]
    })

    let WHATSAPP_PLATEFORM;
    if (!getWhatsappPlatformFlag) {
      WHATSAPP_PLATEFORM = 0;
    }

    if (getWhatsappPlatformFlag?.plateform == 2 && getWhatsappPlatformFlag?.configured_type == 2) {
      WHATSAPP_PLATEFORM = 2;
    } else {
      WHATSAPP_PLATEFORM = 1;
    }


    /* ================= Company Data ================= */
    const companyDetails = await companyModel.findOne({
      where: { isDelete: 0, id: findCompanyId.company_masters_id },
      attributes: [
        "id",
        "company_name",
        "company_contact",
        "city_id",
        "address",
        "state_id",
        "company_email",
        "is_strict_check_product_stock"
      ],
    });

    const cityModels = await cityModel(req.tenantDB);
    const companyCityGet = await cityModels.findOne({
      where: {
        id: companyDetails.dataValues.city_id,
        isDelete: 0,
      },
      attributes: ["city_name"],
    });

    const stateModels = await stateModel(req.tenantDB);
    const companyStateGet = await stateModels.findOne({
      where: {
        id: companyDetails.dataValues.state_id,
        isDelete: 0,
      },
      attributes: ["state_name"],
    });

    const companyResult = {
      ...companyDetails.dataValues,
      ...companyCityGet?.dataValues,
      ...companyStateGet?.dataValues
    }

    const reviewStatus = await getReviewPromptStatus(a_application_login_id, platform);

    // Admin-panel toggle (maintenance_modes.is_training_disabled) — 1 hides the
    // "Software Training" button on the intro screen.
    const maintenanceSetting = await maintenanceModesModel.findOne({
      where: { isDelete: 0 },
      attributes: ["is_training_disabled"],
    });

    /* ===================== RESPONSE ===================== */
    const commonData = {
      is_training_disabled: maintenanceSetting?.dataValues?.is_training_disabled === 1 ? 1 : 0,
      review: reviewStatus,
      MIRACLE_FLAG: getMiracleFlag ? 1 : 2,
      WHATSAPP_PLATEFORM: WHATSAPP_PLATEFORM,
      RAISE_SUPPORT_TICKET_FLAG: raise_support_ticket_flag,
      SUPPORT_TICKET_INFO_MESSAGE: SUPPORT_TICKET_INFO_MESSAGE,
      compulsary_attendance,
      compulsary_attendance_image,
      hasCheckedInToday,
      resultRights,
      PinNumber,
      whatsapp_encrypt: ENCRYPT_WHATSAPP_RESPONSE,
      mobileVersion: {
        APPLICATION_VERSION,
        UPDATE_VERSION_MSG,
        LOCATIONS_TIME_FOR_MOBILE,
        LOCATIONS_UPDATE_ON_SERVER,
        APPLICATION_APK_URL,
        APPLICATION_APK_URL_IOS,
        APPLICATION_APK_URL_ANDROID,
        ANDROID_APPLICATION_VERSION,
        ANDROID_UPDATE_VERSION_MSG,
        CALL_HELPER_APP_VERSION,
        CALL_TRACKER_APP_URL
      },
      advertisement: ADVERTISEMENT_VARIABLE,
      customer_support_ticket_ids: CUSTOMER_SUPPORT_TICKET_ASSING_ID
    };

    if (findCompanyId.company_flag === 2) {
      if (findItShouldPayornot.plan_id !== 0) {
        expiryDays = daysUntilExpiry >= 0 ? -1 : undefined;
      }

      return resSuccess({
        data: {
          item: { ...findLogin, ...findItShouldPayornot },
          findCompanyId,
          expiryDays: expiryDays,
          companyDetails: companyResult,
          ...commonData,
        },
      });
    }

    if (findItShouldPayornot.plan_id === 0) {
      return resError({
        ack_msg: "Unauthorized",
        developer_msg: "Something went wrong",
      });
    }
    expiryDays = daysUntilExpiry >= 0 ? -1 : undefined;
    const expiryCountdown = daysUntilExpiry >= 0 ? daysUntilExpiry : null;
    const expiryMsg =
      expiryCountdown !== null && expiryCountdown <= 5
        ? `Your Account will Expire in ${expiryCountdown} Days`
        : "";

    const data = {
      item: findItShouldPayornot,
      expiryDays: expiryDays,
      companyDetails: companyResult,
      ...commonData,
    };

    if (expiryCountdown !== null) data.expiryMsg = expiryMsg;

    return resSuccess({ data });

  } catch (error) {
    return resBadRequest({
      ack_msg: "Unauthorized",
      developer_msg: `${error}`,
    });
  }
};

export const logOutUser = async (req) => {
  try {
    const { location_switch, activitylocationswitch, callHistoryswitch, callhistory_lastdate, callPopupSwitch, latitude, longitude, address } = req.body;
    const request_flag = req.body.request_flag
    const formattedDate = moment(new Date()).format("YYYY-MM-DD HH:mm:ss");
    console.log("wwwwwwwwwwwwwwww", req.body);
    console.log("zzzzzzzzzzzzzzzzzzzzz", request_flag);

    const resultLogOut = await applicationLoginHistoriesModel.update(
      { logout_date_time: formattedDate },
      {
        where: {
          a_application_login_id: req.body.a_application_login_id,
          isDelete: 0,
          logout_date_time: {
            [Op.is]: null,
          },
        },
      }
    );
    if (resultLogOut) {
      if (request_flag) {
        const updateData = {};
        // 1=> web 2=> Android 3=> IOS
        if (request_flag == 1) {
          updateData.web_refresh_token = "";
          updateData.latitude = latitude || "";
          updateData.longitude = longitude || "";
          updateData.address = address || "";
        } else if (request_flag == 2) {
          updateData.android_refresh_token = "";
          updateData.location_switch = location_switch || "";
          updateData.activitylocationswitch = activitylocationswitch || "";
          updateData.callHistoryswitch = callHistoryswitch || "";
          updateData.callhistory_lastdate = callhistory_lastdate || "";
          updateData.callPopupSwitch = callPopupSwitch || "";
          updateData.latitude = latitude || "";
          updateData.longitude = longitude || "";
          updateData.address = address || "";
        } else if (request_flag == 3) {
          updateData.ios_refresh_token = "";
          updateData.location_switch = location_switch || "";
          updateData.activitylocationswitch = activitylocationswitch || "";
          updateData.callHistoryswitch = callHistoryswitch || "";
          updateData.callhistory_lastdate = callhistory_lastdate || "";
          updateData.callPopupSwitch = callPopupSwitch || "";
          updateData.latitude = latitude || "";
          updateData.longitude = longitude || "";
          updateData.address = address || "";
        }

        try {
          await loginModel.update(updateData, {
            where: {
              id: req.body.a_application_login_id,
            },
          });
        } catch (error) {
          console.error("Error updating token:", error);
          return resError({
            ack_msg: "Not log Out something went wrong",
            developer_msg: "Error",
          });
        }
      }
      return resSuccess({
        ack_msg: "Log out SussesFully",
        developer_msg: "Log out SussesFully",
      });
    } else {
      return resError({
        ack_msg: "Not log Out something went wrong",
        developer_msg: "Error",
      });
    }
  } catch (error) {
    return resBadRequest({
      developer_msg: `Error ${error}`,
      ack_msg: "Error to not logout",
    });
  }
};


export const AppVersionGet = async (req) => {

  try {
    const getAppVersion = CALL_HELPER_APP_VERSION;
    // const getAppCallTrackerUrl = CALL_TRACKER_APP_URL

    if (getAppVersion) {
      return resSuccess({
        data: getAppVersion,
      });
    } else {
      return resError({
        ack_msg: "AppVersion Not Found",
        developer_msg: "AppVersion Not Found",
      });
    }

  } catch (error) {
    return resBadRequest({
      developer_msg: `Error ${error}`,
      ack_msg: "Error to not logout",
    });
  }
}



const SECRET_KEY = "my_secret_key_123";
const ALGORITHM = "aes-256-cbc";

export const encryptOTP = (text) => {
  const iv = crypto.randomBytes(16);

  const key = crypto
    .createHash("sha256")
    .update(SECRET_KEY)
    .digest();

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text.toString(), "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
};

export const PlanCreateOtp = async (req, res) => {
  const { a_application_login_id } = req.body;

  try {
    // 🔍 Find user by ID
    const user = await loginModel.findOne({
      where: {
        id: a_application_login_id,
        isDelete: "0",
      },
    });

    if (!user) {
      return resError({
        ack_msg: "User not found",
        developer_msg: "Invalid application login id",
      });
    }

    // 🔢 Generate OTP
    const otp = generateOTP(6);

    const numbersString = CREATE_PLAN_OTP_CREATE_NUM;

    const numberGet = numbersString
      .split(",")
      .map((num) => num.trim());

    for (const mobile of numberGet) {
      console.log("Sending OTP to:", mobile);

      try {
        await ClaudeOfficeWhatsAppOtp(otp, mobile);
      } catch (err) {
        console.error(`OTP send failed for ${mobile}`, err);
      }
    }
    const encryptedOtp = encryptOTP(otp);
    // ✅ Success response
    return resSuccess({
      data: {
        otp: encryptedOtp, // (keep for testing, remove in production)
      },
    });
  } catch (error) {

    return resBadRequest({
      developer_msg: error.message,
    });
  }
};

export const chooseWorkspace = async (req, res) => {
  const { companyId } = req.body;
  const userId = req.user.id;

  try {
    const user = await loginModel.findOne({
      where: { id: userId, isDelete: "0" },
      attributes: ["username", "id", "recovery_mobile", "recovery_email", "registration_flag", "isOtpVerified", "is_email_verified"]
    });

    if (!user) {
      return resError({
        ack_msg: "User not found",
        developer_msg: "Authentication context invalid",
      });
    }

    // Verify company/workspace mapping
    let verifyCompanyIs = await companyVsApplicationLoginModel.findOne({
      where: { a_application_login_id: userId, company_masters_id: companyId, isDelete: "0" },
    });

    let setCompanyFlag;
    if (verifyCompanyIs) {
      setCompanyFlag = verifyCompanyIs.dataValues.company_flag;
    } else {
      // Check if they are owner of parent company
      const companyInfo = await companyModel.findOne({
        where: { id: companyId, isDelete: "0" },
        attributes: ["parent_company_id"]
      });

      if (companyInfo && companyInfo.dataValues.parent_company_id) {
        const parentMapping = await companyVsApplicationLoginModel.findOne({
          where: {
            a_application_login_id: userId,
            company_masters_id: companyInfo.dataValues.parent_company_id,
            company_flag: 1, // Owner role
            isDelete: 0
          }
        });
        if (parentMapping) {
          setCompanyFlag = 1; // Owner flag inherited
        } else {
          return resError({
            ack_msg: "Access denied to this workspace",
            developer_msg: "No mapping found for workspace",
          });
        }
      } else {
        return resError({
          ack_msg: "Access denied to this workspace",
          developer_msg: "No mapping found for workspace",
        });
      }
    }

    const findItShouldPayornot = await companyModel.findOne({
      where: {
        id: companyId,
        isDelete: "0",
      },
    });

    if (!findItShouldPayornot) {
      return resError({
        ack_msg: "Workspace not found",
        developer_msg: "Company record not found",
      });
    }

    // Check if tenant database is registered
    const verifyTenantId = await tenantMasterModel.findOne({
      where: {
        isDelete: 0,
        company_masters_id: companyId,
      },
    });

    if (!verifyTenantId) {
      return resSuccess({
        data: {
          item: user,
          checkCompanyAlreadyExists: 4, // Needs setup step
          findItShouldPayornot,
        },
      });
    }

    const token = jwt.sign({ id: user.id, companyId }, JWT_TOKEN_SIGNATURE, {
      expiresIn: JWT_TOKEN_EXPIRES_TIME,
    });

    let daysUntilExpiry;
    let expiryMsg;

    if (findItShouldPayornot.dataValues.plan_id !== 0) {
      // Plan expiry calculation
      const currentDate = new Date();
      const planExpiryDate = new Date(
        findItShouldPayornot.dataValues.plan_expiry_date
      );

      const normalizedCurrentDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate()
      );

      const normalizedPlanExpiryDate = new Date(
        planExpiryDate.getFullYear(),
        planExpiryDate.getMonth(),
        planExpiryDate.getDate()
      );

      const timeDifference =
        normalizedPlanExpiryDate.getTime() - normalizedCurrentDate.getTime();
      daysUntilExpiry = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));

      const expiryCountdown =
        daysUntilExpiry >= 0 && daysUntilExpiry <= 5
          ? daysUntilExpiry
          : daysUntilExpiry > 5
            ? daysUntilExpiry
            : null;

      expiryMsg =
        expiryCountdown <= 5
          ? `Your Account will Expire in ${expiryCountdown} Days`
          : daysUntilExpiry > 5
            ? -1
            : null;

      await loginHistories({
        a_application_login_id: userId,
      });
    }

    const daysExpiry = daysUntilExpiry < 0 ? -1 : daysUntilExpiry;

    return resSuccess({
      data: {
        item: user,
        token,
        checkCompanyAlreadyExists: 1,
        findItShouldPayornot,
        expiryMsg,
        daysExpiry,
        company_flag: setCompanyFlag
      },
    });
  } catch (error) {
    console.error("selectWorkspace Error", error);
    return resBadRequest({
      ack_msg: "Failed to choose workspace",
      developer_msg: error.message,
    });
  }
};