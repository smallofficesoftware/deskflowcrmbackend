import { deativateTeamList, invitationKeyJoin, leaveCompany, myTeamList, myTeamListChainWise, planVsStatistics, removeTeamList } from "../../controllers/company_setup/companyVsApplicationLoginController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/invitation_key", invitationKeyJoin);
  app.post("/my-team", authenticateToken, tenantMiddleware, myTeamList);
  app.post("/my-team-chain-wise", authenticateToken, myTeamListChainWise);
  app.post("/my-team-remove", authenticateToken, removeTeamList);
  app.post("/my-team-deactive", authenticateToken, deativateTeamList);
  app.post("/company-leave", authenticateToken, leaveCompany);
  app.post("/get-plan-statistics", authenticateToken, tenantMiddleware, planVsStatistics);


};
