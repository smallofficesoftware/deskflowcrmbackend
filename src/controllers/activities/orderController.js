import {
  actionAccessibilityMethod,
  covertOrderSystem,
  deleteMultipleOrder,
  fetchLastParty,
  fetchSeriesLastNumber,
  fetchShippingLabelPrint,
  getorderattachment,
  orderattachment,
  orderById,
  orderByMultipleId,
  orderCreate,
  orderDelete,
  orderList,
  orderStatusUpdateScriptMethod,
  orderTotal,
  orderUpdate,
  pdfOrder,
  updateOrderAttachments,
  voiceOrderToCart
} from "../../services/activities/orderServices.js";
import callServiceMethod from "../baseController.js";

export const createOrder = async (req, res) => {
  await callServiceMethod(req, res, orderCreate(req, res), "createOrder");
};
export const listOrder = async (req, res) => {
  await callServiceMethod(req, res, orderList(req, res), "orderList");
};
export const getOrderById = async (req, res) => {
  await callServiceMethod(req, res, orderById(req, res), "orderById");
};
export const getOrderByMutipleId = async (req, res) => {
  await callServiceMethod(req, res, orderByMultipleId(req, res), "orderById");
};
export const updateOrder = async (req, res) => {
  await callServiceMethod(req, res, orderUpdate(req, res), "orderById");
};
export const deleteOrder = async (req, res) => {
  await callServiceMethod(req, res, orderDelete(req, res), "orderById");
};
export const totalOrder = async (req, res) => {
  await callServiceMethod(req, res, orderTotal(req, res), "totalOrder");
};
export const convertSystemOrder = async (req, res) => {
  await callServiceMethod(req, res, covertOrderSystem(req, res), "convertSystemOrder");
};
export const orderPdf = async (req, res) => {
  await callServiceMethod(req, res, pdfOrder(req, res), "orderPdf")
}
export const orderAttachment = async (req, res) => {
  await callServiceMethod(req, res, orderattachment(req, res), "orderattachment")
}

export const getOrderAttachment = async (req, res) => {
  await callServiceMethod(req, res, getorderattachment(req, res), "getorderattachment")
}

export const updateOrderAttachment = async (req, res) => {
  await callServiceMethod(req, res, updateOrderAttachments(req, res), "updateOrderAttachment")
}

export const actionAccessibility = async (req, res) => {
  await callServiceMethod(req, res, actionAccessibilityMethod(req, res), "actionAccessibility")
}

export const orderStatusUpdateScript = async (req, res) => {
  await callServiceMethod(req, res, orderStatusUpdateScriptMethod(req, res), "orderStatusUpdateScript")
}

export const voiceOrderGenerator = async (req, res) => {
  await callServiceMethod(req, res, voiceOrderToCart(req, res), "orderStatusUpdateScript")
}

export const fetchLastPartyCN = async (req, res) => {
  await callServiceMethod(req, res, fetchLastParty(req, res), "fetchLastPartyCN")
}


export const shippingLabelPrint = async (req, res) => {
  await callServiceMethod(req, res, fetchShippingLabelPrint(req, res), "fetchShippingLabelPrint")
}
export const getSeriesLastNumber = async (req, res) => {
  await callServiceMethod(req, res, fetchSeriesLastNumber(req, res), "fetchSeriesLastNumber")
}

export const multipleDeleteOrder = async (req, res) => {
  await callServiceMethod(req, res, deleteMultipleOrder(req, res), "deleteMultipleOrder")
}