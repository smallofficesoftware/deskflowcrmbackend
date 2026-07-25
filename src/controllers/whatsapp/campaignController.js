import { campaignSender, campaignUploadMedia, generateCampaignExcel } from "../../services/whatsapp/campaignService.js";
import callServiceMethod from "../baseController.js";

export const generateCampaignExcelProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        generateCampaignExcel(req),
        "generateCampaignExcelProvider"
    );
};

export const campaignSenderProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        campaignSender(req),
        "campaignSenderProvider"
    );
};

export const campaignUploadMediaProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        campaignUploadMedia(req),
        "campaignUploadMediaProvider"
    );
};