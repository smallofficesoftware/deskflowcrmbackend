import {
  actionAccessibility,
  convertSystemOrder,
  createOrder,
  deleteOrder,
  fetchLastPartyCN,
  getOrderAttachment,
  getOrderById,
  getOrderByMutipleId,
  getSeriesLastNumber,
  listOrder,
  multipleDeleteOrder,
  orderAttachment,
  orderPdf,
  orderStatusUpdateScript,
  shippingLabelPrint,
  updateOrder,
  updateOrderAttachment,
  voiceOrderGenerator
} from "../../controllers/activities/orderController.js";
import { authenticateToken } from "../../middlewares/auth.js";
import { orderAttachmentUpload } from "../../middlewares/multer.js";
import { tenantMiddleware } from "../../middlewares/tenantMiddleware.js";

export default (app) => {
  app.post("/createOrder", authenticateToken, tenantMiddleware, createOrder);
  app.post("/listOrder", authenticateToken, tenantMiddleware, listOrder);
  app.post("/orderById", authenticateToken, tenantMiddleware, getOrderById);
  app.post("/orderByMultipleId", authenticateToken, tenantMiddleware, getOrderByMutipleId);

  app.post("/updateOrder", authenticateToken, tenantMiddleware, updateOrder);
  app.post("/deleteOrder", authenticateToken, tenantMiddleware, deleteOrder);
  app.post("/covertOrderSystem", authenticateToken, tenantMiddleware, convertSystemOrder);
  app.post("/order-pdf", authenticateToken, tenantMiddleware, orderPdf)

  app.post("/orderAttachment", authenticateToken, tenantMiddleware, orderAttachmentUpload.array("images"), orderAttachment);

  app.post("/getorderAttachment", authenticateToken, tenantMiddleware, getOrderAttachment)

  app.post("/updateorderAttachment", authenticateToken, tenantMiddleware, updateOrderAttachment)
  app.post("/action-accessibility", authenticateToken, tenantMiddleware, actionAccessibility)
  app.post("/status-update-script", orderStatusUpdateScript)
  app.post("/voiceToOrder", authenticateToken, tenantMiddleware, voiceOrderGenerator)
  app.post("/last-fetch-party-detail", authenticateToken, tenantMiddleware, fetchLastPartyCN)
  app.post("/shipping-label-pdf", authenticateToken, tenantMiddleware, shippingLabelPrint)
  app.post("/getSeriesLastNumber", authenticateToken, tenantMiddleware, getSeriesLastNumber)
  app.post("/multiple-delete-order", authenticateToken, tenantMiddleware, multipleDeleteOrder)

};