import { authenticateToken } from "../../middlewares/auth.js";
import callServiceMethod from "../../controllers/baseController.js";
import { getInvoiceEntrySeries, saveInvoiceEntrySeries } from "../../services/activities/invoiceEntrySeries.js";

export default (app) => {
  app.post(
    "/invoiceEntrySeriesGet",
    authenticateToken,
    (req, res) => callServiceMethod(req, res, getInvoiceEntrySeries(req), "invoiceEntrySeriesGet")
  );
  app.post(
    "/invoiceEntrySeriesSave",
    authenticateToken,
    (req, res) => callServiceMethod(req, res, saveInvoiceEntrySeries(req), "invoiceEntrySeriesSave")
  );
};
