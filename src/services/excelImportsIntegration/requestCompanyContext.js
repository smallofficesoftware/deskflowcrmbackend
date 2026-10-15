// tenantMiddleware runs the request inside a context that carries the ACTIVE company
// (the verified session company), and getCompanyByLoginId() reads it from there. Upload
// routes (multer, after tenantMiddleware) lose that context, so getCompanyByLoginId() fell
// back to the login's most recent company. For a login mapped to several companies
// (workspaces) that is the wrong one: the contact rights were looked up for another company,
// the visibility filter matched nothing and every row said "Contact ID not found".
//
// This puts the same context back, from the same verified source (req.user.companyId), when
// it is missing. When the context is intact (normal JSON requests) it changes nothing.
import { requestContext } from "../../config/context.js";

export function runInRequestCompany(req, fn) {
    if (requestContext.getStore()?.companyId) return fn();

    const companyId = Number(req.user?.companyId);
    const loginId = req.user?.id ?? req.user?.a_application_login_id;
    if (!companyId || !loginId || !req.tenantDB) return fn();

    return requestContext.run(
        {
            tenantDB: req.tenantDB,
            models: req.models,
            companyId,
            tenantId: loginId,
            a_application_login_id: loginId,
        },
        fn,
    );
}
