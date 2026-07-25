import { fetchMetaTemplate, fetchWABAConfig, fetchWABAConfigTeam, sendCampaign, sendToWhatsApp } from "./whatsappService.js";

export const sendsSalesPdfV2Cloude = async ({
    phone_number,
    recipientName,
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
}) => {
    return sendToWhatsApp({
        phone_number,
        recipientName,
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
        provider: 'business_api',
    });
};

export const sendsTaskV2Cloude = async ({
    phone_number,
    recipientName,
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
        recipientName,
        mediaUrl,
        fileName,
        messageText,
        messageType,
        whatsapp_phone_number_id,
        whatsapp_connection_id,
        whatsapp_api_key,
        a_application_login_id,
        message,
        provider: 'business_api',
        axios
    });
};

export const sendsContactV2Cloude = async ({
    phone_number,
    recipientName,
    message,
    whatsapp_phone_number_id,
    whatsapp_connection_id,
    whatsapp_api_key,
    a_application_login_id,
    axios,
    languageCode,
    templateName,
    messageType,
    templateVariables
}) => {
    return sendToWhatsApp({
        phone_number,
        recipientName,
        message,
        whatsapp_phone_number_id,
        whatsapp_connection_id,
        whatsapp_api_key,
        a_application_login_id,
        axios,
        languageCode,
        provider: 'business_api',
        templateName,
        messageType,
        templateVariables
    });
};

export const fetchTemplateV2Cloude = async ({
    whatsapp_api_key,
    whatsapp_waba_id,
    a_application_login_id,
    axios
}) => {
    return fetchMetaTemplate({
        whatsapp_api_key,
        whatsapp_waba_id,
        a_application_login_id,
        axios
    });
}

export const fetchWABAConfigDetailsV2Cloude = async ({
    whatsapp_api_key,
    whatsapp_waba_id,
    a_application_login_id,
    axios
}) => {
    return fetchWABAConfig({
        whatsapp_api_key,
        whatsapp_waba_id,
        a_application_login_id,
        axios
    });
}

export const fetchWABAConfigDetailsTeamV2Cloude = async ({
    whatsapp_api_key,
    whatsapp_waba_id,
    a_application_login_id,
    axios
}) => {
    return fetchWABAConfigTeam({
        whatsapp_api_key,
        whatsapp_waba_id,
        a_application_login_id,
        axios
    });
}

export const sendTemplateMessageV2Cloude = async ({
    phone_number,
    recipientName,
    whatsapp_phone_number_id,
    whatsapp_connection_id,
    whatsapp_api_key,
    a_application_login_id,
    languageCode,
    axios,
    templateName,
    templateVariables,
    mediaUrl,
    fileName
}) => {
    return sendToWhatsApp({
        phone_number,
        recipientName,
        whatsapp_phone_number_id,
        whatsapp_connection_id,
        whatsapp_api_key,
        a_application_login_id,
        languageCode,
        axios,
        provider: 'business_api',
        templateName,
        templateVariables,
        messageType: "template",
        mediaUrl,
        fileName
    });
};

export const sendCampaignMessageV2Cloude = async ({
    template_name,
    language_code,
    name,
    media_url,
    fileName,
    recipient_type,
    recipient_file_url,
    contact_numbers,
    variables_mapping,
    axios,
    a_application_login_id,
    whatsapp_api_key,
    whatsapp_waba_id,
    description,
    scheduled_at,
    is_scheduled
}) => {
    return sendCampaign({
        template_name,
        language_code,
        name,
        media_url,
        fileName,
        recipient_type,
        recipient_file_url,
        contact_numbers,
        variables_mapping,
        axios,
        a_application_login_id,
        whatsapp_api_key,
        whatsapp_waba_id,
        description,
        scheduled_at,
        is_scheduled
    });
};