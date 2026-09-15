import {
  getPublicFormSchemaController,
  submitPublicFormController,
  getPublicReferenceOptionsController,
} from "../../controllers/form_builder/formBuilderPublicController.js";
import { publicFormRateLimit } from "../../middlewares/publicFormRateLimit.js";
import { formBuilderUpload } from "../../middlewares/multer.js";

export default (app) => {
  // Custom Form Maker — public (no-login) routes. Zero middleware besides
  // the rate limiter on submit, same as customFieldFormRouter.js's two
  // no-auth routes (plan §2) — tenant resolved manually inside the service
  // via qrCode, not tenantMiddleware at the route layer.
  app.post("/public-form/schema", getPublicFormSchemaController);
  app.post("/public-form/reference-options", getPublicReferenceOptionsController);
  app.post("/public-form/submit", publicFormRateLimit, formBuilderUpload, submitPublicFormController);
};
