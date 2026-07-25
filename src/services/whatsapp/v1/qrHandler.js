import { fetchConnectedSessions, sendToWhatsApp } from "./whatsappService.js";

export const sendsSalesPdfV1Qr = async ({
    numbers,
    sessionName,
    fileUrl,
    title,
    axios
}) => {
    return sendToWhatsApp({
        numbers,
        sessionName,
        type: "document",
        mediaUrls: fileUrl,
        documentFileName: `${title}.pdf`,
        mimetype: "application/pdf",
        axios
    });
};

export const sendsTaskV1Qr = async ({
    numbers,
    sessionName,
    fileUrl,
    caption,
    text,
    axios
}) => {
    return sendToWhatsApp({
        numbers,
        sessionName,
        type: "document",
        mediaUrls: fileUrl,
        caption,
        text,
        axios
    });
};

export const fetchConnectedCompanies = async (req) => {
    return fetchConnectedSessions(req);
};

export const sendsContactV1Qr = async ({
    numbers,
    sessionName,
    text,
    axios
}) => {
    return sendToWhatsApp({
        numbers,
        sessionName,
        text,
        axios
    });
};

