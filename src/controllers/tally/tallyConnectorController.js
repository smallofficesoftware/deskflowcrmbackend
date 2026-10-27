import { getNextJob, issueConnectorKey, postJobResult, revokeConnectorKey } from "../../services/tally/tallyConnectorService.js";
import callServiceMethod from "../baseController.js";

export const tallyGetNextJobProvider = async (req, res) => {
  await callServiceMethod(req, res, getNextJob(req), "tallyGetNextJob");
};

export const tallyPostJobResultProvider = async (req, res) => {
  await callServiceMethod(req, res, postJobResult(req), "tallyPostJobResult");
};

export const tallyIssueConnectorKeyProvider = async (req, res) => {
  await callServiceMethod(req, res, issueConnectorKey(req), "tallyIssueConnectorKey");
};

export const tallyRevokeConnectorKeyProvider = async (req, res) => {
  await callServiceMethod(req, res, revokeConnectorKey(req), "tallyRevokeConnectorKey");
};
