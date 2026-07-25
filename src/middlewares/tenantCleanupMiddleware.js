export const tenantCleanupMiddleware = (req, res, next) => {
    if (!res || typeof res.on !== "function") {
        return next();
    }

    let closed = false;

    const cleanup = async (reason) => {
        if (closed) return;
        closed = true;

        const sequelize = req.tenantDB;
        const { tenantId, companyId } = req; // assuming you attach earlier

        if (!sequelize || typeof sequelize.close !== "function") {
            console.log(
                `[tenantCleanup] No valid sequelize instance | tenantId=${tenantId}, companyId=${companyId}`
            );
            return;
        }

        try {
            await sequelize.close();
            console.log(
                `[tenantCleanup] Connection closed | reason=${reason} | tenantId=${tenantId}`
            );
        } catch (err) {
            console.log(
                `[tenantCleanup] Error closing DB | tenantId=${tenantId}, companyId=${companyId} | ${err?.stack || err}`
            );
        }
    };

    // Attach listeners once per request
    res.on("finish", () => cleanup("finish")); // normal response
    res.on("close", () => cleanup("close"));   // client disconnected
    res.on("error", () => cleanup("error"));   // stream error

    next();
};