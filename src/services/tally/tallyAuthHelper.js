// Shared by every Tally mapping service - these endpoints are reachable by TWO
// different callers (plans/2026-10-08-marketplace-tally-plan.txt Q6: "Connector
// local UI and CRM web UI both read/write tally_mappings through the same API"):
//   - the CRM web app, with a real user session (authenticateToken ->
//     req.user.companyId)
//   - the connector's own local UI, which has no user login at all, only its
//     connector key (checkConnectorKey -> req.connectorKeyRow.company_masters_id)
// Resolve whichever one is present rather than duplicating every service function.
export const resolveCompanyId = (req) => req.user?.companyId ?? req.connectorKeyRow?.company_masters_id ?? null;
