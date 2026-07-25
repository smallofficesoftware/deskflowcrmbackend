import nodemailer from "nodemailer";
import { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { MAIL_SETTING_HOST_NAME, MAIL_SETTING_HOST_PORT, MAIL_SETTING_HOST_USER_NAME, MAIL_SETTING_HOST_USER_PASSWORD } from "../../utils/appConstants.js";
import { REGISTRATION_FLAG_UPDATE_RULE } from "../../utils/AppEnumeration.js";
import { generateOTP, isValid, resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { ClaudeOfficeWhatsAppOtp } from "../company_setup/thirdPartyIntegrationService.js";

export const sendOTPOldNumber = async (req) => {
    try {
        const { a_application_login_id, m, au } = req.body;
        if (au) {
            const checkPhoneDuplication = await loginModel.findOne({ where: { isDelete: 0, recovery_mobile: m } });
            if (checkPhoneDuplication) {
                return resError({
                    ack_msg: `The phone number already exists in our system, Try different.`,
                    developer_msg: `phone number duplication`,
                });
            }
        }
        const getUserMobileNumber = await loginModel.findOne(
            {
                where: { isDelete: 0, id: a_application_login_id },
                attributes: ["recovery_mobile"],
                raw: true
            }
        );
        const mobile_number = au ? m : getUserMobileNumber.recovery_mobile;
        if (isValid(getUserMobileNumber)) {
            const otp = generateOTP(6);
            ClaudeOfficeWhatsAppOtp(otp, mobile_number);
            await loginModel.update({ otp }, {
                where: { id: a_application_login_id },
            });
            return resSuccess({
                ack_msg: "Send OTP in your whatsapp.",
            });
        } else {
            return resError({
                ack_msg: `Invalid User`,
                developer_msg: `user is not found`,
            });
        }
    } catch (error) {
        console.error("Error in sendOTPOldNumber:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const checkOldNumberOTP = async (req) => {
    try {
        const { a_application_login_id, otp, au, m } = req.body;
        const checkOTP = await loginModel.findOne(
            {
                where: { isDelete: 0, id: a_application_login_id, otp },
                attributes: ["id", "is_email_verified"],
                raw: true
            }
        );
        if (isValid(checkOTP)) {
            if (au) {
                const registration_flag = REGISTRATION_FLAG_UPDATE_RULE[`${checkOTP.is_email_verified}_1`];
                await loginModel.update({ recovery_mobile: m, isOtpVerified: 1, registration_flag: registration_flag }, {
                    where: { isDelete: 0, id: a_application_login_id },
                });
            }
            return resSuccess({
                ack_msg: "OTP matched Successfully.",
            });
        } else {
            return resError({
                ack_msg: `Wrong OTP`,
                developer_msg: `Invalid OTP`,
            });
        }
    } catch (error) {
        console.error("Error in sendOTPOldNumber:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const sendOTPNewNumber = async (req) => {
    try {
        const { a_application_login_id, new_number } = req.body;
        if (isValid(new_number)) {
            const checkPhoneDuplication = await loginModel.findOne({ where: { isDelete: 0, recovery_mobile: new_number } });
            if (checkPhoneDuplication) {
                return resError({
                    ack_msg: `The Phone Number already exists in our system, Try different.`,
                    developer_msg: `phone duplication`,
                });
            }
            const otp = generateOTP(6);
            ClaudeOfficeWhatsAppOtp(otp, new_number);
            await loginModel.update({ otp }, {
                where: { id: a_application_login_id },
            });
            return resSuccess({
                ack_msg: "Send OTP in your whatsapp.",
            });
        } else {
            return resError({
                ack_msg: `Invalid mobile number`,
                developer_msg: `mobile number is blank`,
            });
        }
    } catch (error) {
        console.error("Error in sendOTPNewNumber:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};
export const checkNewNumberOTP = async (req) => {
    try {
        const { a_application_login_id, otp, newEnteredNumber } = req.body;
        const checkOTP = await loginModel.findOne(
            {
                where: { isDelete: 0, id: a_application_login_id, otp },
                attributes: ["id", "is_email_verified"],
                raw: true
            }
        );
        if (isValid(checkOTP)) {
            const checkDuplication = await loginModel.findOne(
                {
                    where: { isDelete: 0, recovery_mobile: newEnteredNumber },
                    attributes: ["id"],
                    raw: true
                }
            );
            if (isValid(checkDuplication)) {
                return resError({
                    ack_msg: `Number is alredy exist.`,
                    developer_msg: `Invalid OTP`,
                });
            }
            const registration_flag = REGISTRATION_FLAG_UPDATE_RULE[`${checkOTP.is_email_verified}_1`];
            await loginModel.update({ recovery_mobile: newEnteredNumber, isOtpVerified: 1, registration_flag: registration_flag }, {
                where: { isDelete: 0, id: a_application_login_id },
            });
            return resSuccess({
                ack_msg: "OTP matched Successfully.",
            });
        } else {
            return resError({
                ack_msg: `Wrong OTP`,
                developer_msg: `Invalid OTP`,
            });
        }
    } catch (error) {
        console.error("Error in checkNewNumberOTP:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const checkOldEmailOTP = async (req) => {
    try {
        const { a_application_login_id, otp, au, e } = req.body;
        const checkOTP = await loginModel.findOne(
            {
                where: { isDelete: 0, id: a_application_login_id, otp },
                attributes: ["id", "isOtpVerified"],
                raw: true
            }
        );
        if (isValid(checkOTP)) {
            if (au) {
                const registration_flag = REGISTRATION_FLAG_UPDATE_RULE[`1_${checkOTP.isOtpVerified}`];
                await loginModel.update({ recovery_email: e, is_email_verified: 1, registration_flag: registration_flag }, {
                    where: { isDelete: 0, id: a_application_login_id },
                });
            }
            return resSuccess({
                ack_msg: "OTP matched Successfully.",
            });
        } else {
            return resError({
                ack_msg: `Wrong OTP`,
                developer_msg: `Invalid OTP`,
            });
        }
    } catch (error) {
        console.error("Error in checkOldEmailOTP:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const sendOTPOldEmail = async (req) => {
    try {
        const { a_application_login_id, e, au } = req.body;

        if (au) {
            const checkEmailDuplication = await loginModel.findOne({ where: { isDelete: 0, recovery_email: e } });
            if (checkEmailDuplication) {
                return resError({
                    ack_msg: `The email address already exists in our system, Try different.`,
                    developer_msg: `email duplication`,
                });
            }
        }
        const isUser = await loginModel.findOne(
            {
                where: { isDelete: 0, id: a_application_login_id, registration_flag: { [Op.in]: au ? [2] : [0, 1] } },
                attributes: ["id"],
                raw: true
            }
        );

        if (isValid(isUser)) {
            const otp = generateOTP(6);
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
                    to: e,
                    subject: "Deskflow CRM Email Address Verification OTP",
                    text: `Your OTP is: ${otp}`
                };

                const info = await transporter.sendMail(mailOptionsAdmin);

                if (info.accepted && info.accepted.length > 0) {
                    await loginModel.update({ otp }, {
                        where: { id: a_application_login_id },
                    });
                    return resSuccess({
                        ack_msg: "Send OTP in your Email Address.",
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
            }

            return resSuccess({
                ack_msg: "Send OTP in your Email Address.",
            });
        } else {
            return resError({
                ack_msg: `Invalid User`,
                developer_msg: `user is not found`,
            });
        }
    } catch (error) {
        console.error("Error in sendOTPOldEmail:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const sendOTPNewEmail = async (req) => {
    try {
        const { a_application_login_id, e } = req.body;
        if (isValid(e)) {
            const checkEmailDuplication = await loginModel.findOne({ where: { isDelete: 0, recovery_email: e } });
            if (checkEmailDuplication) {
                return resError({
                    ack_msg: `The email address already exists in our system, Try different.`,
                    developer_msg: `email duplication`,
                });
            }
            const otp = generateOTP(6);
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
                    to: e,
                    subject: "Deskflow CRM New Email Address Verification OTP",
                    text: `Your OTP is: ${otp}`
                };

                const info = await transporter.sendMail(mailOptionsAdmin);

                if (info.accepted && info.accepted.length > 0) {
                    await loginModel.update({ otp }, {
                        where: { id: a_application_login_id },
                    });
                    return resSuccess({
                        ack_msg: "Send OTP in your Email Address.",
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
            }
            await loginModel.update({ otp }, {
                where: { id: a_application_login_id },
            });
            return resSuccess({
                ack_msg: "Send OTP in your Email Address.",
            });
        } else {
            return resError({
                ack_msg: `Invalid email address`,
                developer_msg: `email address is blank`,
            });
        }
    } catch (error) {
        console.error("Error in sendOTPNewEmail:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};

export const checkNewEmailOTP = async (req) => {
    try {
        const { a_application_login_id, otp, newEnteredEmailAddress } = req.body;
        const checkOTP = await loginModel.findOne(
            {
                where: { isDelete: 0, id: a_application_login_id, otp },
                attributes: ["id", "is_email_verified", "isOtpVerified"],
                raw: true
            }
        );
        if (isValid(checkOTP)) {
            const checkDuplication = await loginModel.findOne(
                {
                    where: { isDelete: 0, recovery_email: newEnteredEmailAddress },
                    attributes: ["id"],
                    raw: true
                }
            );
            if (isValid(checkDuplication)) {
                return resError({
                    ack_msg: `Email Address is already exist.`,
                    developer_msg: `Invalid OTP`,
                });
            }
            const registration_flag = REGISTRATION_FLAG_UPDATE_RULE[`1_${checkOTP.isOtpVerified}`];
            await loginModel.update({ recovery_email: newEnteredEmailAddress, is_email_verified: 1, registration_flag: registration_flag }, {
                where: { isDelete: 0, id: a_application_login_id },
            });
            return resSuccess({
                ack_msg: "OTP matched Successfully.",
            });
        } else {
            return resError({
                ack_msg: `Wrong OTP`,
                developer_msg: `Invalid OTP`,
            });
        }
    } catch (error) {
        console.error("Error in checkNewEmailOTP:", error);
        return resBadRequest({
            ack_msg: "Something went wrong",
            developer_msg: `Error: ${error.message}`,
        });
    }
};