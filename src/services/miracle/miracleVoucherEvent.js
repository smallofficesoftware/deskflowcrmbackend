// A bill that arrives from Miracle through the voucher webhook is a normal document for
// Automations: a flow on "Document created" / "Document updated" (for example one that calls
// an outside URL) must run for it just as it does for a bill made inside Deskflow.

/** Automation trigger for a synced voucher: created the first time it is seen, updated on a re-sync. */
export const voucherAutomationEvent = (created) => (created ? "cart.created" : "cart.updated");
