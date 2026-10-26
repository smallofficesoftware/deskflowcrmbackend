// Miracle's Account / Product Ledger reports take a list of columns (rptfield). When Miracle
// stops accepting one of them (it did with `lastactiondt`, which the guide lists as a filter
// only) the whole call fails with E0006 and the sync screen is dead for every company.
// postLedger drops exactly the columns Miracle names and retries once, so a column we never
// needed cannot take a sync down again.

const NOT_EXPECTED = /Not expected:\s*(.+?)\.?\s*$/i;

/**
 * Column names Miracle refused, from an E0006 message such as
 * "Invalid value(s) in 'rptfield'. Not expected: lastactiondt, foo." Empty when the message
 * is not of that form.
 */
export const rejectedFieldsFromMessage = (message) => {
    const match = NOT_EXPECTED.exec(String(message || ""));
    if (!match) return [];
    return match[1]
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
};

/**
 * api.post(endpoint, payload), and when Miracle answers E0006 for some rptfield columns, the
 * same call once more without them. Returns the axios response of the call that counts; a
 * retried one carries `droppedFields` so the caller can tell.
 */
export const postLedger = async (api, endpoint, payload) => {
    const response = await api.post(endpoint, payload);
    const data = response?.data;
    if (!data?.IsError || data.ErrorCode !== "E0006" || !Array.isArray(payload?.rptfield)) {
        return response;
    }

    const rejected = new Set(rejectedFieldsFromMessage(data.Message).map((f) => f.toLowerCase()));
    const kept = payload.rptfield.filter((f) => !rejected.has(String(f).toLowerCase()));
    // Nothing to drop, or nothing would be left to ask for: let the caller show Miracle's message.
    if (kept.length === payload.rptfield.length || kept.length === 0) return response;

    const dropped = payload.rptfield.filter((f) => rejected.has(String(f).toLowerCase()));
    console.warn(`[miracle] ${endpoint}: Miracle rejected rptfield ${dropped.join(", ")}; retrying without.`);
    const retry = await api.post(endpoint, { ...payload, rptfield: kept });
    retry.droppedFields = dropped;
    return retry;
};
