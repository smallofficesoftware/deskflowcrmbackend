import { BACKEND_OF_WPPCONNECT, ENCRYPT_WHATSAPP_RESPONSE, WP_V2_URL } from "../../utils/appConstants.js";
import { createWhatsAppAxios } from "../../utils/whatsappAxiosFactory.js";

export const WHATSAPP_AXIOS = {
    1: { // QR
        1: createWhatsAppAxios({
            baseURL: BACKEND_OF_WPPCONNECT,
            encryptEnabled: ENCRYPT_WHATSAPP_RESPONSE,
        }),
        2: createWhatsAppAxios({
            baseURL: WP_V2_URL,
            encryptEnabled: false,
        }),
    },

    2: { // CLOUDE
        1: createWhatsAppAxios({
            baseURL: WP_V2_URL,
            encryptEnabled: false,
        }),
        2: createWhatsAppAxios({
            baseURL: WP_V2_URL,
            encryptEnabled: false,
        }),
    },
};