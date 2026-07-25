import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import {
  getAllVisitMaster,
  visitMasterCreate,
  visitMasterUpdate,
} from "../../services/hr/visitTypeMasterServices.js";
import callServiceMethod from "../baseController.js";

export const allVisitTypeMaster = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllVisitMaster(req),
    "allVisitTypeMaster"
  );
};

export const createVisitTypeMaster = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, visitMasterCreate(req), "createProduct");
};
export const visitTypeMasterUpdate = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, visitMasterUpdate(req), "updateProduct");
};
