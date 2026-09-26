import emitToCompany from "../1socketIOServices/emitToCompany.js";
import { sendMultipleNotification } from "../company_setup/thirdPartyIntegrationService.js";
import { getSettings } from "./limits.js";
import { fetchUser, fetchUsers } from "./records.js";
import { getAutomationIo, logError } from "./runtime.js";
import { hasSmtp, sendEmailAs } from "./senders/email.js";

// In-app notifications for automations: push (web / android / ios tokens,
// same sender the CRM already uses) + a socket event the web app can show.

const tokensOf = (users) =>
  users
    .flatMap((u) => [u.web_refresh_token, u.android_refresh_token, u.ios_refresh_token])
    .filter((t) => t && String(t).trim() !== "");

/** Push + socket to a list of user ids. Returns count of users reached. */
export const notifyUsers = async (company_masters_id, userIds, { title, body, data = {} }) => {
  const users = await fetchUsers(userIds);
  const tokens = tokensOf(users);
  if (tokens.length) {
    try {
      await sendMultipleNotification({
        deviceTokens: tokens,
        title,
        body,
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")])),
        notification_modual: "automation",
      });
    } catch (e) {
      logError("notifyUsers push", e);
    }
  }
  emitToCompany(getAutomationIo(), company_masters_id, "automation-notification", {
    user_ids: users.map((u) => u.id),
    title,
    body,
    ...data,
  });
  return users.length;
};

/** Failure alert (13.11): owner + users picked in Settings. */
export const notifyFlowFailure = async (tenantDB, flow, executionId, error, paused) => {
  const settings = await getSettings(tenantDB, flow.company_masters_id);
  const ids = [...new Set([flow.created_by, ...(settings.failure_alert_user_ids || [])].filter(Boolean))];
  const title = paused ? `Automation paused: ${flow.name}` : `Automation failed: ${flow.name}`;
  const body = String(error || "Unknown error").slice(0, 200);
  await notifyUsers(flow.company_masters_id, ids, {
    title,
    body,
    data: { flow_id: flow.id, execution_id: executionId, type: "automation_failure" },
  });
  const owner = await fetchUser(flow.created_by);
  if (hasSmtp(owner) && owner.recovery_email) {
    try {
      await sendEmailAs(owner, {
        to: owner.recovery_email,
        subject: title,
        html: `<p>${title}</p><p>Run #${executionId}</p><p>${body.replace(/</g, "&lt;")}</p>`,
      });
    } catch (e) {
      logError("notifyFlowFailure email", e);
    }
  }
};
