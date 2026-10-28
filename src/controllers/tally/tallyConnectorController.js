import { getConnectorInfo, getConnectorUpdateInfo, streamConnector, streamConnectorUpdate } from "../../services/tally/tallyConnectorDownloadService.js";
import { getNextJob, issueConnectorKey, postJobResult, revokeConnectorKey } from "../../services/tally/tallyConnectorService.js";
import callServiceMethod from "../baseController.js";

export const tallyGetNextJobProvider = async (req, res) => {
  await callServiceMethod(req, res, getNextJob(req), "tallyGetNextJob");
};

export const tallyPostJobResultProvider = async (req, res) => {
  await callServiceMethod(req, res, postJobResult(req), "tallyPostJobResult");
};

export const tallyConnectorInfoProvider = async (req, res) => {
  await callServiceMethod(req, res, getConnectorInfo(req), "tallyConnectorInfo");
};

// Streams a file, so it answers on `res` directly instead of going through callServiceMethod.
export const tallyConnectorDownloadProvider = (req, res) => streamConnector(req, res);

export const tallyIssueConnectorKeyProvider = async (req, res) => {
  await callServiceMethod(req, res, issueConnectorKey(req), "tallyIssueConnectorKey");
};

export const tallyRevokeConnectorKeyProvider = async (req, res) => {
  await callServiceMethod(req, res, revokeConnectorKey(req), "tallyRevokeConnectorKey");
};
export const tallyConnectorUpdateInfoProvider = (req, res) => callServiceMethod(req, res, getConnectorUpdateInfo(req), "getConnectorUpdateInfo");
export const tallyConnectorUpdateDownloadProvider = (req, res) => streamConnectorUpdate(req, res);
