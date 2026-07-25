import { sendsContactV1Qr, sendsSalesPdfV1Qr, sendsTaskV1Qr } from "./v1/qrHandler.js";
import { fetchTemplateV2Cloude, fetchWABAConfigDetailsTeamV2Cloude, fetchWABAConfigDetailsV2Cloude, sendCampaignMessageV2Cloude, sendsContactV2Cloude, sendsSalesPdfV2Cloude, sendsTaskV2Cloude, sendTemplateMessageV2Cloude } from "./v2/cloudHandler.js";
import { sendsContactV2Qr, sendsSalesPdfV2Qr, sendsTaskV2Qr } from "./v2/qrHandler.js";

export const WHATSAPP_SEND_SALES_PDF_HANDLER = {
    1: { // QR
        1: sendsSalesPdfV1Qr,
        2: sendsSalesPdfV2Qr
    },
    2: { // CLOUDE
        2: sendsSalesPdfV2Cloude
    }
};

export const WHATSAPP_SEND_TASK_HANDLER = {
    1: { // QR
        1: sendsTaskV1Qr,
        2: sendsTaskV2Qr
    },
    2: { // CLOUDE
        2: sendsTaskV2Cloude
    }
};

export const WHATSAPP_SEND_CONTACT_ASSIGNMENT = {
    1: {
        1: sendsContactV1Qr,
        2: sendsContactV2Qr,
    },
    2: {
        2: sendsContactV2Cloude
    }
};

export const WHATSAPP_FETCH_TEMPLATE_HANDLER = {
    2: { // CLOUDE
        2: fetchTemplateV2Cloude
    }
};

export const WHATSAPP_FETCH_WABA_CONFIG_DETAILS = {
    2: { // CLOUDE
        2: fetchWABAConfigDetailsV2Cloude
    }
};

export const WHATSAPP_FETCH_WABA_CONFIG_DETAILS_TEAM = {
    2: { // CLOUDE
        2: fetchWABAConfigDetailsTeamV2Cloude
    }
};

export const WHATSAPP_SEND_TEMPLATE_HANDLER = {
    2: { // CLOUDE
        2: sendTemplateMessageV2Cloude
    }
}

export const WHATSAPP_SEND_CAMPAIGN_HANDLER = {
    2: { // CLOUDE
        2: sendCampaignMessageV2Cloude
    }
}