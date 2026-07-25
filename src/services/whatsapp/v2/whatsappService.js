import loginModel from "../../../models/application_login/loginModel.js";
import { NODE_ENV } from "../../../utils/appConstants.js";
import { isValid, resError, resSuccess } from "../../../utils/sharedFunctions.js";

export const sendToWhatsApp = async ({
    phone_number,
    recipientName,
    mediaUrl,
    fileName,
    messageText,
    messageType,
    message,
    languageCode,
    whatsapp_phone_number_id,
    whatsapp_connection_id,
    whatsapp_api_key,
    a_application_login_id,
    axios,
    provider,
    templateName,
    templateVariables,
}) => {
    try {
        const getAuthDetailDb = await loginModel.findOne({
            where: {
                isDelete: 0,
                id: a_application_login_id
            },
            attributes: [
                "whatsapp_phone_number_id",
                "whatsapp_connection_id",
                "whatsapp_api_key"
            ],
            raw: true
        });

        const t_whatsapp_phone_number_id = getAuthDetailDb?.whatsapp_phone_number_id;
        // const t_whatsapp_connection_id = getAuthDetailDb?.whatsapp_connection_id;
        const t_whatsapp_api_key = getAuthDetailDb?.whatsapp_api_key;

        const payload = {
            phone_number: phone_number,
            whatsapp_phone_number_id: t_whatsapp_phone_number_id ? t_whatsapp_phone_number_id : whatsapp_phone_number_id,
            provider: provider,
            // connection_id: t_whatsapp_connection_id ? t_whatsapp_connection_id : whatsapp_connection_id,
        };

        // Media handling
        if (isValid(mediaUrl)) {
            payload.mediaUrl = NODE_ENV == 'development' ? 'https://pdfobject.com/pdf/sample.pdf' : mediaUrl
        }

        if (isValid(recipientName)) {
            payload.name = recipientName
        }

        if (isValid(templateName)) {
            payload.templateName = templateName
        }

        if (isValid(templateVariables)) {
            payload.templateVariables = templateVariables
        }

        if (isValid(fileName)) {
            payload.fileName = fileName;
        }

        if (isValid(messageType)) {
            payload.messageType = messageType;
        }

        if (isValid(messageText)) {
            payload.messageText = messageText;
        }
        if (isValid(message)) {
            payload.message = message;
        }
        if (isValid(languageCode)) {
            payload.languageCode = languageCode;
        }

        const response = await axios.post(
            "/whatsapp/send",
            payload,
            {
                headers: {
                    "Accept": "application/json",
                    "X-API-Key": `${t_whatsapp_api_key ? t_whatsapp_api_key : whatsapp_api_key}`,
                },
            }
        );


        if ([400, 404, 500].includes(response.status)) {
            return resError({
                ack_msg: response.data.error || response.data.message,
                developer_msg: "Error occurred while sending WhatsApp message.",
                data: response?.data
            });
        }

        if (response.status === 200) {
            return resSuccess({
                ack_msg: response.data.message || "WhatsApp message sent successfully.",
                developer_msg: "WhatsApp API message delivered successfully.",
                data: response?.data
            });
        }
    } catch (error) {
        console.log("sendToWhatsApp error", error);
        return resError({
            ack_msg: error?.msg,
            developer_msg: "error occured when sending message",
        });
    }
};

export const fetchMetaTemplate = async ({
    whatsapp_api_key,
    whatsapp_waba_id,
    a_application_login_id,
    axios
}) => {
    try {
        const getAuthDetailDb = await loginModel.findOne({
            where: {
                isDelete: 0,
                id: a_application_login_id
            },
            attributes: [
                "whatsapp_phone_number_id",
                "whatsapp_connection_id",
                "whatsapp_waba_id",
                "whatsapp_api_key"
            ],
            raw: true
        });

        const t_whatsapp_api_key = getAuthDetailDb?.whatsapp_api_key;
        const t_whatsapp_waba_id = getAuthDetailDb?.whatsapp_waba_id;

        const response = await axios.get(
            `/template/meta-list?waba_id=${t_whatsapp_waba_id ? t_whatsapp_waba_id : whatsapp_waba_id}`,
            {
                headers: {
                    "Accept": "application/json",
                    "X-API-Key": `${t_whatsapp_api_key ? t_whatsapp_api_key : whatsapp_api_key}`,
                },
            }
        );

        if (response.status == 404 || response.status == 400 || response.status == 500) {
            return resError({
                ack_msg: response.data.error || response.data.message,
                developer_msg: "error occured when fetched template",
            });
        } else if (response.status == 200) {
            return resSuccess({
                ack_msg: "Template fetched successfully.",
                data: response.data
            });
        }
    } catch (error) {
        console.log("fetchMetaTemplate error", error);
        return resError({
            ack_msg: error?.msg,
            developer_msg: "error occured when sending message",
        });
    }
}

export const fetchWABAConfig = async ({
    whatsapp_api_key,
    whatsapp_waba_id,
    a_application_login_id,
    axios
}) => {
    try {

        const response = await axios.get(
            `/whatsapp/phone-numbers`,
            {
                headers: {
                    "Accept": "application/json",
                    "X-API-Key": `${whatsapp_api_key}`,
                },
            }
        );

        if (response.status == 404 || response.status == 400 || response.status == 500) {
            return resError({
                ack_msg: response.data.error || response.data.message,
                developer_msg: "error occured when WABA Config Details",
            });
        } else if (response.status == 200) {
            return resSuccess({
                ack_msg: "WABA Details fetched successfully.",
                data: response.data
            });
        }
    } catch (error) {
        console.log("fetchWABAConfig error", error);
        return resError({
            ack_msg: error?.msg,
            developer_msg: "error occured when sending message",
        });
    }
}

export const fetchWABAConfigTeam = async ({
    whatsapp_api_key,
    whatsapp_waba_id,
    a_application_login_id,
    axios
}) => {
    try {

        const getAuthDetailDb = await loginModel.findOne({
            where: {
                isDelete: 0,
                id: a_application_login_id
            },
            attributes: [
                "whatsapp_phone_number_id",
                "whatsapp_connection_id",
                "whatsapp_waba_id",
                "whatsapp_api_key"
            ],
            raw: true
        });

        const t_whatsapp_api_key = getAuthDetailDb?.whatsapp_api_key;

        const response = await axios.get(
            `/whatsapp/phone-numbers`,
            {
                headers: {
                    "Accept": "application/json",
                    "X-API-Key": `${t_whatsapp_api_key}`,
                },
            }
        );

        if (response.status == 404 || response.status == 400 || response.status == 500) {
            return resError({
                ack_msg: response.data.error || response.data.message,
                developer_msg: "error occured when Team WABA Config Details",
            });
        } else if (response.status == 200) {
            return resSuccess({
                ack_msg: "Team WABA Details fetched successfully.",
                data: response.data
            });
        }
    } catch (error) {
        console.log("fetchWABAConfigTeam error", error);
        return resError({
            ack_msg: error?.msg,
            developer_msg: "error occured when fetching Team WABA Details",
        });
    }
}

export const sendCampaign = async ({
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
    is_scheduled,
}) => {
    try {
        const getAuthDetailDb = await loginModel.findOne({
            where: {
                isDelete: 0,
                id: a_application_login_id
            },
            attributes: [
                "whatsapp_phone_number_id",
                "whatsapp_connection_id",
                "whatsapp_waba_id",
                "whatsapp_api_key"
            ],
            raw: true
        });

        const t_whatsapp_api_key = getAuthDetailDb?.whatsapp_api_key;
        const t_whatsapp_waba_id = getAuthDetailDb?.whatsapp_waba_id;

        const payload = {};

        payload.waba_id = t_whatsapp_waba_id ? t_whatsapp_waba_id : whatsapp_waba_id;

        // Media handling
        if (isValid(template_name)) {
            payload.template_name = template_name
        }

        if (isValid(language_code)) {
            payload.language_code = language_code
        }

        if (isValid(name)) {
            payload.name = name
        }

        if (isValid(fileName)) {
            payload.fileName = fileName;
        }

        if (isValid(media_url)) {
            payload.media_url = media_url;
        }

        if (isValid(recipient_type)) {
            payload.recipient_type = recipient_type;
        }
        if (isValid(recipient_file_url)) {
            payload.recipient_file_url = recipient_file_url;
        }
        if (isValid(contact_numbers)) {
            payload.contact_numbers = contact_numbers;
        }

        if (isValid(variables_mapping)) {
            payload.variables_mapping = variables_mapping;
        }

        if (isValid(description)) {
            payload.description = description;
        }

        if (isValid(scheduled_at)) {
            payload.scheduled_at = scheduled_at;
        }

        if (isValid(is_scheduled)) {
            payload.is_scheduled = is_scheduled;
        }

        payload.is_published = true;

        const response = await axios.post(
            "/campaigns",
            payload,
            {
                headers: {
                    "Accept": "application/json",
                    "X-API-Key": `${t_whatsapp_api_key ? t_whatsapp_api_key : whatsapp_api_key}`,
                },
            }
        );

        console.log("responsesdfsdf", response)

        if (response.status == 404 || response.status == 400 || response.status == 500) {
            return resError({
                ack_msg: response.data?.error || response.data?.message || "Error Occured",
                developer_msg: "error occured when sending campaign",
            });
        } else if (response.status == 200 || response.status == 201) {
            return resSuccess({
                ack_msg: response.data?.message || "campaign sent successfully.",
                data: response?.data
            });
        }
    } catch (error) {
        console.log("sendCampaign error", error);
        return resError({
            ack_msg: error?.message,
            developer_msg: "error occured when sending campaign",
        });
    }
}