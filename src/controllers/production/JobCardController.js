import { assignLabelToJobCard, assignStatusToJobCard, assignTeamMemberToJob, deleteJobCard, deleteProductionEntry, fetchProductionEntryDetail, fetchProductionList, fetchWarehouseStockBatch, jobCardsDetails, jobCardsFetch, jobCardsSave, printBom, submitUnifiedProductionEntry, updateJobCardQty } from "../../services/production/JobCardServices.js";
import callServiceMethod from "../baseController.js";

export const jobCardsFetchProvider = async (req, res) => {
    await callServiceMethod(req, res, jobCardsFetch(req), "jobCardsFetchProvider");
};
export const jobCardsDetailsProvider = async (req, res) => {
    await callServiceMethod(req, res, jobCardsDetails(req), "jobCardsDetailsProvider");
}
export const jobCardsSaveProvider = async (req, res) => {
    await callServiceMethod(req, res, jobCardsSave(req), "jobCardsSaveProvider");
}
export const printBomProvider = async (req, res) => {
    await callServiceMethod(req, res, printBom(req), "printBomProvider");
}

export const jobCardDeleteProvider = async (req, res) => {
    await callServiceMethod(req, res, deleteJobCard(req), "jobCardDeleteProvider");
}

export const productionEntryProvider = async (req, res) => {
    await callServiceMethod(req, res, submitUnifiedProductionEntry(req), "productionEntryProvider");
}

export const jobCardsFetchProductionListProvider = async (req, res) => {
    await callServiceMethod(req, res, fetchProductionList(req), "jobCardsFetchProductionListProvider");
}

export const deleteProductionEntryProvider = async (req, res) => {
    await callServiceMethod(req, res, deleteProductionEntry(req), "deleteProductionEntryProvider");
}

export const fetchWarehouseStockBatchProvider = async (req, res) => {
    await callServiceMethod(req, res, fetchWarehouseStockBatch(req), "fetchWarehouseStockBatchProvider");
}

export const assignTeamToJob = async (req, res) => {
    await callServiceMethod(req, res, assignTeamMemberToJob(req), "assignTeamMemberToJob");
}

export const assignLabelToJob = async (req, res) => {
    await callServiceMethod(req, res, assignLabelToJobCard(req), "assignLabelToJobCard");
}

export const assignStatusToJob = async (req, res) => {
    await callServiceMethod(req, res, assignStatusToJobCard(req), "assignStatusToJobCard");
}

export const updateJobCardQtyProvider = async (req, res) => {
    await callServiceMethod(req, res, updateJobCardQty(req), "updateJobCardQtyProvider");
}

export const fetchProductionEntryDetailProvider = async (req, res) => {
    await callServiceMethod(req, res, fetchProductionEntryDetail(req), "fetchProductionEntryDetailProvider");
}