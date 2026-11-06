import { getApiAccessIps } from "../../services/api-access/apiAccessIpService.js";
import callServiceMethod from "../baseController.js";

// Read-only: the allow-list is edited from the superadmin adminpanel, never from the customer's CRM.
export const apiAccessIpsGetProvider = async (req, res) => {
  await callServiceMethod(req, res, getApiAccessIps(req), "apiAccessIpsGetProvider");
};
