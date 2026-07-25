import { pageright, tenentupdate } from "../../controllers/configuration/updateTenentController.js";

export default (app) => {
  app.post("/updateTenent", tenentupdate);
  app.post("/pagerights/:companyIds", pageright);
  app.post("/pagerights", pageright);
};
