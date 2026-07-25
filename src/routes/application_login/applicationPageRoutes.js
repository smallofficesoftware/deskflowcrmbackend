import { getCouponWiseDetails, planDetailGet } from "../../controllers/application_login/applicationPageController.js";
export default (app) => {
  app.post("/getPlanDetail", planDetailGet);
  app.post("/get-coupon-code", getCouponWiseDetails);
};
