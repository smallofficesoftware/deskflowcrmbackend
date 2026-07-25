import { sendWhatsappTemplateViaBackend, whatsappTemplateConfigs, whatsappTemplateConfigsUpdate } from "../../services/whatsapp/variableSystemService.js";
import { fetchWhatsappTemplate, fetchWhatsappWABAConfig, fetchWhatsappWABAConfigTeam, sendTemplateMessage, whatsappTemplateUploadAttachment } from "../../services/whatsapp/whatsappService.js";
import callServiceMethod from "../baseController.js";

export const whatsappTemplateConfigsUpdateProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        whatsappTemplateConfigsUpdate(req, res),
        "whatsappTemplateConfigsUpdateProvider"
    );
};

export const fetchWhatsappTemplateProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchWhatsappTemplate(req),
        "fetchWhatsappTemplateProvider"
    );
};

export const fetchWhatsappWABAConfigDetails = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchWhatsappWABAConfig(req),
        "fetchWhatsappWABAConfigDetails"
    );
};

export const fetchWhatsappWABAConfigDetailsTeam = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchWhatsappWABAConfigTeam(req),
        "fetchWhatsappWABAConfigDetailsTeam"
    );
};

export const whatsappTemplateConfigsProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        whatsappTemplateConfigs(req, res),
        "whatsappTemplateConfigsProvider"
    );
};

export const sendViaSavedConfig = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendWhatsappTemplateViaBackend(req),
        "sendViaSavedConfig"
    );
};

export const sendWhatsappTemplateProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        sendTemplateMessage(req),
        "sendWhatsappTemplateProvider"
    );
};

export const whatsappTemplateUploadAttachmentProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        whatsappTemplateUploadAttachment(req),
        "whatsappTemplateUploadAttachmentProvider"
    );
};