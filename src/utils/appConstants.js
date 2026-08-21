import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
export const __dirnameConstant = path.dirname(__filename);

export const NODE_ENV = process.env.NODE_ENV || 'development';

dotenv.config({
  path: path.resolve(process.cwd(), `.env.${NODE_ENV}`),
  override: true,
});

export const PORT = process.env.PORT;
export const HOST = process.env.HOST;
export const FRONTEND_OF_SMALL_OFFICE_CRM_END_POINT = process.env.FRONTEND_OF_SMALL_OFFICE_CRM_END_POINT;
export const BACKEND_OF_SMALL_OFFICE_CRM_END_POINT = process.env.BACKEND_OF_SMALL_OFFICE_CRM_END_POINT;
export const baseURL = NODE_ENV === 'development' ? `${HOST}:${PORT}` : HOST;
export const BACKEND_OF_SMALL_OFFICE_B2B_PORTAL_END_POINT = process.env.BACKEND_OF_SMALL_OFFICE_B2B_PORTAL_END_POINT;
export const ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE = process.env.ENABLE_TENANT_MIGRATIONS_ON_COMPANY_CREATE === "true";
export const BACKEND_OF_WPPCONNECT = process.env.BACKEND_OF_WPPCONNECT;

export const APP_URL_SMALL_OFFICE_CRM = process.env.APP_URL_SMALL_OFFICE_CRM;
export const MASTER_OTP = process.env.MASTER_OTP;
export const MASTER_PIN = process.env.MASTER_PIN;
export const REPORT_PIN = process.env.REPORT_PIN;
export const CALL_HELPER_APP_VERSION = process.env.CALL_HELPER_APP_VERSION;
export const CALL_TRACKER_APP_URL = process.env.CALL_TRACKER_APP_URL;
export const SUPER_ADMIN_WHATSAPP_APP_KEY = process.env.SUPER_ADMIN_WHATSAPP_APP_KEY;
export const SUPER_ADMIN_WHATSAPP_AUTH_KEY = process.env.SUPER_ADMIN_WHATSAPP_AUTH_KEY;

export const EMAIL_SEND_TO_SUPER_ADMIN_EMAIL_ID = process.env.EMAIL_SEND_TO_SUPER_ADMIN_EMAIL_ID;
export const WEBSITE_FROM_ADMIN_MAIL_ID = process.env.WEBSITE_FROM_ADMIN_MAIL_ID;
export const JOB_CREATOR_WEBSITE_URL = process.env.JOB_CREATOR_WEBSITE_URL;
export const WEBSITE_FROM_ADMIN_MOBILE_NUMBER = process.env.WEBSITE_FROM_ADMIN_MOBILE_NUMBER;
export const EMAIL_SEND_SUPER_ADMIN_SUBJECT = "Deskflow CRM – Account Verification OTP";
export const WHATSAPP_SEND_ADD_PRE_NUMBER = "91";

export const MAIL_SETTING_HOST_NAME = process.env.MAIL_SETTING_HOST_NAME;
export const MAIL_SETTING_HOST_PORT = process.env.MAIL_SETTING_HOST_PORT;
export const MAIL_SETTING_HOST_USER_NAME = process.env.MAIL_SETTING_HOST_USER_NAME;
export const MAIL_SETTING_HOST_USER_PASSWORD = process.env.MAIL_SETTING_HOST_USER_PASSWORD;

// Time is set in hours
export const JWT_TOKEN_EXPIRES_TIME = process.env.JWT_TOKEN_EXPIRES_TIME;
export const JWT_TOKEN_SIGNATURE = "abcd123456789";
// Tent Config
export const TENANT_DB_HOST_NAME = process.env.TENANT_DB_HOST_NAME;
export const TENANT_DB_USER_NAME = process.env.TENANT_DB_USER_NAME;
export const TENANT_DB_PASSWORD = process.env.TENANT_DB_PASSWORD;
export const TENANT_DB_DB_NAME = process.env.TENANT_DB_DB_NAME;

export const PRODUCT_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/productImg/`;
export const EXPENSE_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/expenseImg/`;
export const LEAVE_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/leaveImg/`;
export const CHAT_MESSAGE_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/media-folder/`;
export const TASK_CHAT_MESSAGE_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/media-folder/`;
export const APPLICATION_LOGIN_PROFILE_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/profile-pic/`;
export const TASK_ATTEECHMENT_VIEW = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/taskATH/`;
export const VISITING_CARD_VIEW = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/visitingCard/`;
export const COMPANY_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/companyImg/`;
export const PDF_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/order_view/`;
export const PDF_LINK_EXTENDED_Account_TRANSACTION = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/accountTransactions/`;
export const PDF_LINK_EXTENDED_EMP_Account_TRANSACTION = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/empAccountTransactions/`;
export const PDF_LINK_EXTENDED_TASK_CRONE = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/task_cron/`;
export const PDF_FOR_NEW_PLAN_PARCHASE_BY_CUSTOMER = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/newPlanInvoice/`;
export const VISIT_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/visitImg/`;
export const ORDER_ATTACHMENT_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/orderAttachment/`;
export const EXPORTS_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/export/`;
export const PRODUCT_BOM_IMG_LINK_EXTENDED = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/product-bom-img/`;
export const PDF_LINK_SHIPPING_LABEL = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/shipping_label_view/`;
export const MIRACLE_LEDGER_PDF = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/mcusledger/`;
export const CAMPAIGN_EXCEL_GENEREATE_LINK = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/camp-gen-excel/`;
export const WHATSAPP_TEMPLATE_STATIC_ATTACHMENT_GENEREATE_LINK = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/whatsapp-template-att/`;
export const HARDCODED_TOKEN = "poiuytrewq0987654321";

export const APPLICATION_VERSION = process.env.APPLICATION_VERSION;
export const ANDROID_APPLICATION_VERSION = process.env.ANDROID_APPLICATION_VERSION;
export const UPDATE_VERSION_MSG = `New Update <br/>Available <br/><b> ${APPLICATION_VERSION} vs</b><br/>for better experience <br/>with new function <br/><br/>Please<br/> Update the App`;
export const ANDROID_UPDATE_VERSION_MSG = `New Update <br/>Available <br/><b> ${ANDROID_APPLICATION_VERSION} vs</b><br/>for better experience <br/>with new function <br/><br/>Please<br/> Update the App`;
export const LOCATIONS_TIME_FOR_MOBILE = "5";
export const LOCATIONS_UPDATE_ON_SERVER = "15";
export const APPLICATION_APK_URL = `${BACKEND_OF_SMALL_OFFICE_CRM_END_POINT}/apk/${APPLICATION_VERSION}.apk`;
// when it is live that time it should be change
export const APPLICATION_APK_URL_IOS = "https://apps.apple.com/in/app/id6757629548";
export const APPLICATION_APK_URL_ANDROID = "https://play.google.com/store/search?q=deskflow&c=apps&hl=en_IN";

export const PACKING_FORWARDING_CHARGE_HSN_CODE = 998540
export const PACKING_FORWARDING_CHARGE_GST = 18

export const TRANSPORT_CHARGE_HSN_CODE = 996511
export const TRANSPORT_CHARGE__GST = 18
export const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET;
export const ENCRYPT_SMALL_OFFICE_CRM_RESPONSE = process.env.ENCRYPT_SMALL_OFFICE_CRM_RESPONSE === "true";
export const ENCRYPT_WHATSAPP_RESPONSE = process.env.ENCRYPT_WHATSAPP_RESPONSE === "true";
export const WHATSAPP_PAYLOAD_ENCRYPTION_KEY = process.env.WHATSAPP_PAYLOAD_ENCRYPTION_KEY;

// In-app review prompt (system-review + store-review) — global settings, not per-company
export const REVIEW_PROMPT_ENABLED = process.env.REVIEW_PROMPT_ENABLED !== "false";
export const REVIEW_INITIAL_PROMPT_DAYS = Number(process.env.REVIEW_INITIAL_PROMPT_DAYS) || 30;
export const REVIEW_RETRY_INTERVAL_DAYS = Number(process.env.REVIEW_RETRY_INTERVAL_DAYS) || 3;
export const REVIEW_STORE_PROMPT_DELAY_DAYS = Number(process.env.REVIEW_STORE_PROMPT_DELAY_DAYS) || 7;
export const REVIEW_MIN_STAR_FOR_STORE_PROMPT = Number(process.env.REVIEW_MIN_STAR_FOR_STORE_PROMPT) || 4;
export const REVIEW_COMMENT_MIN_LENGTH = Number(process.env.REVIEW_COMMENT_MIN_LENGTH) || 30;


export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

export const WPP_CONNECT_CONNECTION_TYPE = process.env.WPP_CONNECT_CONNECTION_TYPE;

export const LOG_LEVEL = process.env.LOG_LEVEL;

export const CUSTOM_FORM_FEILD_LIMIT = process.env.CUSTOM_FORM_FEILD_LIMIT?.split(",");

export const TASK_AUTO_REFRESH_ON = process.env.TASK_AUTO_REFRESH_ON;
export const TASK_AUTO_REFRESH_TIMEOUT = process.env.TASK_AUTO_REFRESH_TIMEOUT
export const TASK_AUTO_REFRESH_INACTIVITY_DELAY = process.env.TASK_AUTO_REFRESH_INACTIVITY_DELAY

export const CONTACT_AUTO_REFRESH_ON = process.env.CONTACT_AUTO_REFRESH_ON;
export const CONTACT_AUTO_REFRESH_TIMEOUT = process.env.CONTACT_AUTO_REFRESH_TIMEOUT;
export const CONTACT_AUTO_REFRESH_INACTIVITY_DELAY = process.env.CONTACT_AUTO_REFRESH_INACTIVITY_DELAY;
export const EXTERNAL_CRONE_RUNNING_FLAG_VAR = process.env.EXTERNAL_CRONE_RUNNING_FLAG;

export const WEBSITE_LEAD_HANDLE_DB_NAME = process.env.WEBSITE_LEAD_HANDLE_DB_NAME;
export const WBSITE_LEAD_ASSIGN_ID = process.env.WBSITE_LEAD_ASSIGN_ID;
export const CUSTOMER_SUPPORT_TICKET_ASSING_ID = process.env.CUSTOMER_SUPPORT_TICKET_ASSING_ID;

export const WHATSAPP_DATABASE_NAME = process.env.WHATSAPP_DATABASE_NAME;
export const WHATSAPP_DATABASE_HOST = process.env.WHATSAPP_DATABASE_HOST;
export const WHATSAPP_DATABASE_USERNAME = process.env.WHATSAPP_DATABASE_USERNAME;
export const WHATSAPP_DATABASE_PASSWORD = process.env.WHATSAPP_DATABASE_PASSWORD;


export const ADVERTISEMENT_VARIABLE = process.env.ADVERTISEMENT_VARIABLE;


export const RAISE_SUPPORT_TICKET_FLAG = process.env.RAISE_SUPPORT_TICKET_FLAG;
export const SUPPORT_TICKET_INFO_MESSAGE = process.env.SUPPORT_TICKET_INFO_MESSAGE;

export const CREATE_PLAN_OTP_CREATE_NUM = process.env.CREATE_PLAN_OTP_CREATE_NUM;
export const CUSTOMER_SUPPORT_TICKET_DATE_VIEW = process.env.CUSTOMER_SUPPORT_TICKET_DATE_VIEW;
export const CUSTOMER_SUPPORT_TICKET_TIME_RANGE = process.env.CUSTOMER_SUPPORT_TICKET_TIME_RANGE;
export const CUSTOMER_SUPPORT_TICKET_MAX_COUNT = process.env.CUSTOMER_SUPPORT_TICKET_MAX_COUNT;

export const WP_V2_URL = process.env.WP_V2_URL;


export const API_LOG_ENABLE_FLAG = process.env.API_LOG_ENABLE_FLAG;

export const MAINTENANCE_BYPASS_IPS = process.env.MAINTENANCE_BYPASS_IPS
  ? process.env.MAINTENANCE_BYPASS_IPS.split(",").map((ip) => ip.trim())
  : [];