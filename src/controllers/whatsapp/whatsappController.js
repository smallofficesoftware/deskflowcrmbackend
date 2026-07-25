import { accWvFetch, ordWvFetch, whatsappTemplateConfigDelete, whatsappTemplateConfigGet } from "../../services/whatsapp/variableSystemService.js";
import { sendContactAllAccountPdfWhatsapp, sendSalesPdfWhatsapp, sendSingleAccountPdfWhatsapp, waCloudHook, wconfigFlag } from "../../services/whatsapp/whatsappService.js";
import callServiceMethod from "../baseController.js";

export const sendSalesPdfWhatsappProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendSalesPdfWhatsapp(req),
        "sendSalesPdfWhatsappProvider"
    );
};

export const sendContactAllAccountPdfWhatsappProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendContactAllAccountPdfWhatsapp(req),
        "sendContactAllAccountPdfWhatsappProvider"
    );
};

export const sendSingleAccountPdfWhatsappProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendSingleAccountPdfWhatsapp(req),
        "sendSingleAccountPdfWhatsappProvider"
    );
};

export const ordWvFetchProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        ordWvFetch(req),
        "ordWvFetchProvider"
    );
};

export const accWvFetchProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        accWvFetch(req),
        "accWvFetchProvider"
    );
};

export const wconfigFlagProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        wconfigFlag(req),
        "wconfigFlagProvider"
    );
};


// For Whatsapp Template
export const getwhatsappTemplateConfig = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        whatsappTemplateConfigGet(req, res),
        "whatsappTemplateConfigGet"
    );
};

export const deletewhatsappTemplateConfig = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        whatsappTemplateConfigDelete(req, res),
        "whatsappTemplateConfigDelete"
    );
};

export const waCloudHookProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        waCloudHook(req, res),
        "waCloudHookProvider"
    );
};