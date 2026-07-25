import multer from "multer";
import nodemailer from "nodemailer";
import loginModel from "../models/application_login/loginModel.js";
import companyModel from "../models/company_setup/companyModel.js";
import { getCompanyByLoginId } from "../services/commonServices.js";
import {
  MAIL_SETTING_HOST_NAME,
  MAIL_SETTING_HOST_PORT,
  MAIL_SETTING_HOST_USER_NAME,
  MAIL_SETTING_HOST_USER_PASSWORD,
} from "../utils/appConstants.js";
import logger from "../utils/logger.js";
export const createTransporter = async (a_application_login_id = null) => {

  const findCompanyId = a_application_login_id ? await getCompanyByLoginId(a_application_login_id) : null;

  const findFromCompanySetupMail = findCompanyId ? await companyModel.findOne({
    where: { id: findCompanyId.company_masters_id },
    attributes: [
      "id",
      "host_out_going_mail",
      "port_mail_setup",
      "mail_id_setup",
      "password_mail_setup",
    ],
  }) : null;

  const findFromLoginSetupMail = findFromCompanySetupMail ? await loginModel.findOne({
    where: { id: a_application_login_id },
    attributes: [
      "id",
      "host_out_going_mail",
      "port_mail_setup",
      "mail_id_setup",
      "password_mail_setup",
    ],
  }) : null;
  if (
    findFromLoginSetupMail?.dataValues &&
    findFromLoginSetupMail?.dataValues.host_out_going_mail !== ""
  ) {

    return nodemailer.createTransport({
      host: findFromLoginSetupMail?.dataValues.host_out_going_mail,
      port: findFromLoginSetupMail?.dataValues.port_mail_setup,
      secure: true, // Ensure this is true for SSL/TLS
      auth: {
        user: findFromLoginSetupMail?.dataValues.mail_id_setup,
        pass: findFromLoginSetupMail?.dataValues.password_mail_setup,
      },
    });
  } else if (findFromCompanySetupMail?.dataValues) {

    return nodemailer.createTransport({
      // pool: true,
      host: findFromCompanySetupMail?.dataValues.host_out_going_mail,
      port: findFromCompanySetupMail?.dataValues.port_mail_setup,
      secure: true, // Ensure this is true for SSL/TLS
      auth: {
        user: findFromCompanySetupMail?.dataValues.mail_id_setup,
        pass: findFromCompanySetupMail?.dataValues.password_mail_setup,
      },
    });
  } else {
    return nodemailer.createTransport({
      // pool: true,
      host: MAIL_SETTING_HOST_NAME,
      port: MAIL_SETTING_HOST_PORT,
      secure: true, // Ensure this is true for SSL/TLS
      auth: {
        user: MAIL_SETTING_HOST_USER_NAME,
        pass: MAIL_SETTING_HOST_USER_PASSWORD,
      },
    });
  }
};

export const sendOtp = async (toEmail) => {
  if (!toEmail) throw new Error('Recipient email is required');

  const mailOptions = {
    from: MAIL_SETTING_HOST_NAME,
    to: toEmail,
    subject: 'Your OTP Code',
    text: `Your One-Time Password is: ${otp}`,
  };

  try {

    await transporter.sendMail(mailOptions);

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now


    return otp;
  } catch (error) {
    logger.error('Failed to send OTP:', error);
    throw error;
  }
}

export const attachmentFromEmail = multer({
  dest: process.cwd() + "/media-folder/email_attachment",
});


