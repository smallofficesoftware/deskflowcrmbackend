export const MODULE_KEYS = [
    "contact",
    "product",
    "invoice",
    "purchase_invoice",
    "return_sales_invoice",
    "return_purchase_invoice",
    "quotation",
    "order",
    "purchase_order",
    "dispatch",
    "inward",
    "account_transaction"
];

export const createDefaultModuleRights = () => ({
    add: true,
    update: true,
    delete: true
});

export const DEFAULT_MIRACLE_RIGHTS = {
    sync_miracle: {
        enabled: true,
        contact: createDefaultModuleRights(),
        product: createDefaultModuleRights(),
        invoice: createDefaultModuleRights(),
        purchase_invoice: createDefaultModuleRights(),
        return_sales_invoice: createDefaultModuleRights(),
        return_purchase_invoice: createDefaultModuleRights(),
        quotation: createDefaultModuleRights(),
        order: createDefaultModuleRights(),
        purchase_order: createDefaultModuleRights(),
        dispatch: createDefaultModuleRights(),
        inward: createDefaultModuleRights(),
        account_transaction: createDefaultModuleRights()
    },
    webhook: {
        enabled: true,
        contact: createDefaultModuleRights(),
        product: createDefaultModuleRights(),
        invoice: createDefaultModuleRights(),
        purchase_invoice: createDefaultModuleRights(),
        return_sales_invoice: createDefaultModuleRights(),
        return_purchase_invoice: createDefaultModuleRights(),
        quotation: createDefaultModuleRights(),
        order: createDefaultModuleRights(),
        purchase_order: createDefaultModuleRights(),
        dispatch: createDefaultModuleRights(),
        inward: createDefaultModuleRights(),
        account_transaction: createDefaultModuleRights()
    }
};

/**
 * Safely parses rights_config JSON from DB with null-safe deep fallback to defaults.
 */
export function parseMiracleRights(rawConfig) {
    if (!rawConfig) {
        return JSON.parse(JSON.stringify(DEFAULT_MIRACLE_RIGHTS));
    }

    let parsed = rawConfig;
    if (typeof rawConfig === "string") {
        try {
            parsed = JSON.parse(rawConfig);
        } catch (e) {
            return JSON.parse(JSON.stringify(DEFAULT_MIRACLE_RIGHTS));
        }
    }

    if (typeof parsed !== "object" || parsed === null) {
        return JSON.parse(JSON.stringify(DEFAULT_MIRACLE_RIGHTS));
    }

    const defaults = JSON.parse(JSON.stringify(DEFAULT_MIRACLE_RIGHTS));

    const result = {
        sync_miracle: {
            enabled: parsed.sync_miracle?.enabled ?? defaults.sync_miracle.enabled,
        },
        webhook: {
            enabled: parsed.webhook?.enabled ?? defaults.webhook.enabled,
        }
    };

    MODULE_KEYS.forEach((mod) => {
        result.sync_miracle[mod] = {
            add: Boolean(parsed.sync_miracle?.[mod]?.add ?? defaults.sync_miracle[mod].add),
            update: Boolean(parsed.sync_miracle?.[mod]?.update ?? defaults.sync_miracle[mod].update),
            delete: Boolean(parsed.sync_miracle?.[mod]?.delete ?? defaults.sync_miracle[mod].delete),
        };

        result.webhook[mod] = {
            add: Boolean(parsed.webhook?.[mod]?.add ?? defaults.webhook[mod].add),
            update: Boolean(parsed.webhook?.[mod]?.update ?? defaults.webhook[mod].update),
            delete: Boolean(parsed.webhook?.[mod]?.delete ?? defaults.webhook[mod].delete),
        };
    });

    return result;
}

/**
 * Removes HTML tags, converts HTML line breaks (<br>, </p>, </div>, </li>) to real newlines,
 * decodes HTML entities, and formats clean plain text for Miracle API payloads.
 */
export function cleanHtmlText(htmlStr) {
    if (!htmlStr || typeof htmlStr !== "string") {
        return "";
    }

    let cleaned = htmlStr;

    // Convert line-breaking HTML tags to newlines
    cleaned = cleaned.replace(/<br\s*[\/]?>/gi, "\n");
    cleaned = cleaned.replace(/<\/p\s*>/gi, "\n");
    cleaned = cleaned.replace(/<\/div\s*>/gi, "\n");
    cleaned = cleaned.replace(/<\/tr\s*>/gi, "\n");
    cleaned = cleaned.replace(/<\/li\s*>/gi, "\n");

    // Strip all remaining HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, "");

    // Decode HTML entities
    cleaned = cleaned
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&cent;/gi, "¢")
        .replace(/&pound;/gi, "£")
        .replace(/&yen;/gi, "¥")
        .replace(/&euro;/gi, "€")
        .replace(/&copy;/gi, "©")
        .replace(/&reg;/gi, "®");

    // Normalize multiple newlines and trim whitespace
    cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\n\s*\n/g, "\n").trim();

    return cleaned;
}

