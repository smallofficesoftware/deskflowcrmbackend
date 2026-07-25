import { decryptRequestForMultipart } from "../../middlewares/payloadSecurity.js";
import {
  contactMessagePinUpin,
  createAttachment,
  getAllContactMessageHistory,
  getAllContactMessageHistoryDemo,
  mailSendToMessageHistory
} from "../../services/activities/contactMessageHistoryService.js";
import callServiceMethod from "../baseController.js";

export const allContactsMessageHistory = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllContactMessageHistory(req),
    "getAllContactMessageHistory"
  );
};

export const allContactsMessageHistoryDemo = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getAllContactMessageHistoryDemo(req),
    "getAllContactMessageHistory"
  );
};

export const addAttachment = async (req, res) => {
  decryptRequestForMultipart(req);
  await callServiceMethod(req, res, createAttachment(req), "addAttachment");
};

export const sendMailMessageHistory = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    mailSendToMessageHistory(req),
    "sendMailMessageHistory"
  );
};

export const pinUnpinContactMessage = async (req, res) => {
  await callServiceMethod(req, res, contactMessagePinUpin(req), "contactMessagePinUpin");
};


export const contactPinUpin = async (req) => {
  const { request_flag, contact_master_id, a_application_login_id } = req.body;

  // request_flag 1 =====> Pin Contact;
  // request_flag 2 =====> UnPin Contact;

  if (!contact_master_id) {
    return resError({
      ack_msg: "Contact Id is Required",
      developer_msg: "Contact Id is Required",
    });
  }

  const ContactModels = contactModel(req.tenantDB);

  if (request_flag === 1) {
    try {
      // Pin Contact: Add application ID to the comma-separated string
      const contact = await ContactModels.findOne({
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (!contact) {
        return resError({
          ack_msg: "Contact not found",
          developer_msg: "Contact not found or has been deleted",
        });
      }

      let pinnedIds = [];
      // remove 0 when contact pinned
      if (contact.is_pin_by_a_application_login_id) {
        pinnedIds = contact.is_pin_by_a_application_login_id
          .split(",")
          .filter((id) => id && id !== "0"); // Remove 0 from pinned IDs
      }

      // Add ID if not already present
      if (!pinnedIds.includes(a_application_login_id)) {
        pinnedIds.push(a_application_login_id);
      } else {
        return {
          success: true,
          ack_msg: "Contact already pinned by this application",
          data: pinnedIds,
        };
      }

      const updateData = {
        is_pin_by_a_application_login_id:
          pinnedIds.length > 0 ? pinnedIds.join(",") : "0",
        is_pin: pinnedIds.length > 0 ? 1 : 0,
      };

      const [affectedRows] = await ContactModels.update(updateData, {
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (affectedRows === 0) {
        return resError({
          ack_msg: "Failed to pin contact",
          developer_msg: "No rows were updated in the database",
        });
      }

      return resSuccess({
        ack: 1,
        ack_msg: "Contact pinned successfully",
        data: { pinnedIds },
      });
    } catch (error) {
      return resError({
        ack: 0,
        ack_msg: "Something went wrong while pinning contact",
        developer_msg: error.message,
      });
    }
  } else {
    try {
      // Unpin Contact: Remove application ID from the comma-separated string
      const contact = await ContactModels.findOne({
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (!contact) {
        return resError({
          ack_msg: "Contact not found",
          developer_msg: "Contact not found or has been deleted",
        });
      }

      let pinnedIds = [];
      if (contact.is_pin_by_a_application_login_id) {
        pinnedIds = contact.is_pin_by_a_application_login_id
          .split(",")
          .filter((id) => id && id !== "0"); // Remove 0 from pinned IDs
      }

      // Remove ID if present
      if (pinnedIds.includes(a_application_login_id)) {
        pinnedIds = pinnedIds.filter((id) => id !== a_application_login_id);
      } else {
        logger.info(`Application ID ${a_application_login_id} not pinned`);
      }

      const updateData = {
        is_pin_by_a_application_login_id:
          pinnedIds.length > 0 ? pinnedIds.join(",") : "0",
        is_pin: pinnedIds.length > 0 ? 1 : 0,
      };

      const [affectedRows] = await ContactModels.update(updateData, {
        where: {
          id: contact_master_id,
          isDelete: 0,
        },
      });

      if (affectedRows === 0) {
        return resError({
          ack_msg: "Failed to unpin contact",
          developer_msg: "No rows were updated in the database",
        });
      }

      return resSuccess({
        ack: 1,
        ack_msg: "Contact unpinned successfully",
        data: { pinnedIds },
      });
    } catch (error) {
      logger.error("Error in unpinning contact:", error);
      return resError({
        ack: 0,
        ack_msg: "Something went wrong while unpinning contact",
        developer_msg: error.message,
      });
    }
  }
};