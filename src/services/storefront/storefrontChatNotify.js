import { QueryTypes } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";

// A storefront customer wrote in the in-store chat: show their CRM contact as unread again (the contact list
// bolds unread rows) and push a notification, with its own notification_modual so the CRM plays a different sound.
// Best effort - never throws, so a notification problem can never fail the customer's message.

/** Back to "unread for everyone": the read list is cleared, same state the CRM's own "mark as unread" sets. */
const markContactUnread = (db, companyId, contactId) =>
  db.query(
    `UPDATE contact_masters SET is_unread = 1, is_read_by_a_application_login_id = NULL WHERE id = :contactId AND company_masters_id = :companyId`,
    { replacements: { contactId, companyId } }
  );

export const onStorefrontCustomerMessage = async (db, companyId, contactId, text) => {
  try {
    await markContactUnread(db, companyId, contactId);

    const [contact] = await db.query(
      `SELECT person_name, company_name, assinged_to_work_a_application_id, a_application_login_id FROM contact_masters WHERE id = :contactId AND company_masters_id = :companyId`,
      { replacements: { contactId, companyId }, type: QueryTypes.SELECT }
    );
    if (!contact) return;

    // The team members assigned to this contact; if nobody is, the person who owns the contact.
    const assigned = String(contact.assinged_to_work_a_application_id || "")
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => id > 0);
    const recipientIds = assigned.length ? assigned : [Number(contact.a_application_login_id)].filter((id) => id > 0);
    if (!recipientIds.length) return;

    const members = await loginModel.findAll({
      where: { id: recipientIds, isDelete: 0 },
      attributes: ["id", "web_refresh_token", "android_refresh_token", "ios_refresh_token"],
    });
    const tokens = [
      ...new Set(
        members
          .flatMap((m) => [m.web_refresh_token, m.android_refresh_token, m.ios_refresh_token])
          .filter((t) => t && String(t).trim() !== "")
      ),
    ];
    if (!tokens.length) return;

    const who = contact.person_name || contact.company_name || "A customer";
    await sendMultipleNotification({
      deviceTokens: tokens,
      title: `${who} sent a message on the storefront`,
      body: String(text).slice(0, 120),
      notification_modual: "storefront_chat",
    });
  } catch (error) {
    console.error("storefront chat: customer-message notify failed", error);
  }
};
