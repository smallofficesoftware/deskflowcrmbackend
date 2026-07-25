// ============================================================
// backend/services/whatsappSenderService.js
// Wraps your existing Axios-based WhatsApp sending API
// ============================================================

import axios from "axios";

const WA_API_BASE = process.env.WA_API_BASE ?? "https://graph.facebook.com/v18.0";
const WA_PHONE_ID = process.env.WA_PHONE_NUMBER_ID;
const WA_TOKEN = process.env.WA_ACCESS_TOKEN;

/**
 * Build the Meta-compatible template message payload.
 *
 * @param {string} to              Recipient phone number (international, no +)
 * @param {Object} template        Full template object from frontend
 * @param {Object} resolvedVars    { "1": "Ramesh", "2": "Cash", ... }
 * @returns {Object}               Meta API request body
 */
const buildTemplatePayload = (to, template, resolvedVars) => {
    // Build body parameter components from resolved variables
    const bodyParams = Object.keys(resolvedVars)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => ({
            type: "text",
            text: resolvedVars[key] ?? "",
        }));

    const components = [];
    if (bodyParams.length > 0) {
        components.push({ type: "body", parameters: bodyParams });
    }

    return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
            name: template.name,
            language: {
                code: template.language ?? "en_US",
            },
            components,
        },
    };
};

/**
 * Send a WhatsApp template message via your existing API layer.
 * Delegates to the internal endpoint you already have.
 */
export const sendTemplateViaInternalApi = async (internalApiClient, payload) => {
    // `internalApiClient` is your existing axios instance
    const response = await internalApiClient.post("send-whatsapp-template", payload);

    if (response.data?.ack !== 200 && response.data?.ack !== "200") {
        throw new Error(response.data?.ack_msg ?? "WhatsApp send failed");
    }

    return response.data;
};

/**
 * (Optional) Send directly via Meta Graph API if bypassing internal layer.
 */
export const sendDirectToMeta = async (to, template, resolvedVars) => {
    if (!WA_PHONE_ID || !WA_TOKEN) {
        throw new Error("WA_PHONE_NUMBER_ID and WA_ACCESS_TOKEN must be configured");
    }

    const payload = buildTemplatePayload(to, template, resolvedVars);

    const { data } = await axios.post(
        `${WA_API_BASE}/${WA_PHONE_ID}/messages`,
        payload,
        {
            headers: {
                Authorization: `Bearer ${WA_TOKEN}`,
                "Content-Type": "application/json",
            },
        },
    );

    return data;
};