import { sendToWhatsApp } from "./whatsappService.js";

export const sendsSalesPdfV2Qr = async ({
    phone_number,
    mediaUrl,
    fileName,
    messageText,
    messageType,
    whatsapp_phone_number_id,
    whatsapp_connection_id,
    whatsapp_api_key,
    a_application_login_id,
    message,
    axios
}) => {
    return sendToWhatsApp({
        phone_number,
        mediaUrl,
        fileName,
        messageText,
        messageType,
        whatsapp_phone_number_id,
        whatsapp_connection_id,
        whatsapp_api_key,
        a_application_login_id,
        message,
        axios,
        provider: 'baileys'
    });
};

export const sendsTaskV2Qr = async ({
    phone_number,
    mediaUrl,
    fileName,
    messageText,
    messageType,
    whatsapp_phone_number_id,
    whatsapp_connection_id,
    whatsapp_api_key,
    a_application_login_id,
    message,
    axios
}) => {
    return sendToWhatsApp({
        phone_number,
        mediaUrl,
        fileName,
        messageText,
        messageType,
        whatsapp_phone_number_id,
        whatsapp_connection_id,
        whatsapp_api_key,
        a_application_login_id,
        message,
        provider: 'baileys',
        axios
    });
};

export const sendsContactV2Qr = async ({
    phone_number,
    message,
    whatsapp_phone_number_id,
    whatsapp_connection_id,
    whatsapp_api_key,
    a_application_login_id,
    axios,
}) => {
    return sendToWhatsApp({
        phone_number,
        message,
        whatsapp_phone_number_id,
        whatsapp_connection_id,
        whatsapp_api_key,
        a_application_login_id,
        axios,
        provider: 'baileys'
    });
};