import {
  verifyActivationCode,
  verifyActivationCodeCompany,
} from "../../controllers/configuration/activationCodeMasterController.js";
import { authenticateToken } from "../../middlewares/auth.js";
export default (app) => {
  app.post("/verifyActivationCode", verifyActivationCode);
  app.post("/verifyActivationCodeCompany", verifyActivationCodeCompany);
};
