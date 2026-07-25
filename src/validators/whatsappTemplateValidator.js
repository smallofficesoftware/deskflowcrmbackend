// ============================================================
// backend/validators/whatsappTemplateValidator.js
// Request validation — used in routes before controllers
// ============================================================

// ── Save Config Validator ────────────────────────────────────

export const validateSaveConfig = (body) => {
    const errors = [];

    if (!body.module || typeof body.module !== "string") {
        errors.push("module is required and must be a string");
    }
    if (!body.displayModule || typeof body.displayModule !== "string") {
        errors.push("displayModule is required and must be a string");
    }
    if (!body.templateId || typeof body.templateId !== "string") {
        errors.push("templateId is required and must be a string");
    }
    if (!body.templateName || typeof body.templateName !== "string") {
        errors.push("templateName is required and must be a string");
    }
    if (!body.whx_a_application_login_id) {
        errors.push("whx_a_application_login_id is required");
    }
    if (
        !body.variableMappings ||
        typeof body.variableMappings !== "object" ||
        Array.isArray(body.variableMappings)
    ) {
        errors.push("variableMappings must be an object");
    }

    return errors;
};

// ── Send Template Validator ───────────────────────────────────

export const validateSendTemplate = (body) => {
    const errors = [];

    if (!body.whx_a_application_login_id) {
        errors.push("whx_a_application_login_id is required");
    }
    if (!body.template || typeof body.template !== "object") {
        errors.push("template object is required");
    } else {
        if (!body.template.id) errors.push("template.id is required");
        if (!body.template.name) errors.push("template.name is required");
        if (!Array.isArray(body.template.components)) {
            errors.push("template.components must be an array");
        }
    }
    if (!body.receiverClue || typeof body.receiverClue !== "object") {
        errors.push("receiverClue is required (contains target context params)");
    }
    if (body.variables === undefined || body.variables === null) {
        errors.push("variables map is required");
    }

    return errors;
};

// ── Send via Saved Config Validator ──────────────────────────

export const validateSendViaSavedConfig = (body) => {
    const errors = [];

    if (!body.whx_a_application_login_id) {
        errors.push("whx_a_application_login_id is required");
    }
    if (!body.module || typeof body.module !== "string") {
        errors.push("module is required");
    }
    if (!body.contextParams || typeof body.contextParams !== "object") {
        errors.push("contextParams is required for resolving variables");
    }

    return errors;
};