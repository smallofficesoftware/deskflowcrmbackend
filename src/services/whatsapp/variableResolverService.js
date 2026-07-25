// ============================================================
// backend/services/variableResolverService.js
// Resolves {{N}} placeholder values from DB / internal APIs
// ============================================================

/* import { BACKEND_OF_SMALL_OFFICE_CRM_END_POINT } from "../../utils/appConstants.js"; */
import { accAttFetch, accWvFetch, cmpWvFetch, conWvFetch, ordAttFetch, ordWvFetch, tskWbFetch } from "./variableSystemService.js";

/* // Base URL for internal API calls — set in environment
const INTERNAL_API_BASE = BACKEND_OF_SMALL_OFFICE_CRM_END_POINT; */

/**
 * Variable definitions — mirrors frontend VARIABLE_DEFINITIONS.
 * Backend is the source of truth for resolution.
 */
const BODY_VARIABLE_DEFINITIONS = [
    {
        key: "voucher_customer_name",
        contexts: [
            {
                module: "carts",
                endpoint: "/ord-wvfetch/:orderId/customer",
                params: ["orderId"],
                fetchType: "customer",
                valueField: "voucher_customer_name",
                method: (req) => ordWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "acc-wvfetch/:orderId/customer",
                params: ["acc_id"],
                fetchType: "customer",
                valueField: "customer_name",
                method: (req) => accWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                fetchType: null,
                valueField: "customer_name",
                method: (req) => conWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                fetchType: null,
                valueField: "customer_name",
                method: (req) => conWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId/customer",
                params: ["tskId"],
                fetchType: "customer",
                valueField: "customer_name",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    {
        key: "customer_mobile_number",
        label: "Customer Mobile Number",
        dataType: "string",
        contexts: [
            {
                module: "carts",
                endpoint: "ord-wvfetch/:orderId/customer",
                params: ["orderId"],
                fetchType: "customer",
                valueField: "customer_mobile_number",
                method: (req) => ordWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "acc-wvfetch/:acc_id/customer",
                params: ["acc_id"],
                fetchType: "customer",
                valueField: "customer_mobile_number",
                method: (req) => accWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                valueField: "customer_mobile_number",
                method: (req) => conWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                valueField: "customer_mobile_number",
                method: (req) => conWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId/customer",
                params: ["tskId"],
                fetchType: "customer",
                valueField: "customer_mobile_number",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    {
        key: "customer_company_name",
        label: "Customer Company Name",
        dataType: "string",
        contexts: [
            {
                module: "carts",
                endpoint: "ord-wvfetch/:orderId/customer",
                params: ["orderId"],
                fetchType: "customer",
                valueField: "customer_company_name",
                method: (req) => ordWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "acc-wvfetch/:acc_id/customer",
                params: ["acc_id"],
                fetchType: "customer",
                valueField: "customer_company_name",
                method: (req) => accWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                valueField: "customer_company_name",
                method: (req) => conWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                valueField: "customer_company_name",
                method: (req) => conWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId/customer",
                params: ["tskId"],
                fetchType: "customer",
                valueField: "customer_company_name",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    {
        key: "customer_email_address",
        label: "Customer Email Address",
        dataType: "string",
        contexts: [
            {
                module: "carts",
                endpoint: "ord-wvfetch/:orderId/customer",
                params: ["orderId"],
                fetchType: "customer",
                valueField: "customer_email_address",
                method: (req) => ordWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "acc-wvfetch/:acc_id/customer",
                params: ["acc_id"],
                fetchType: "customer",
                valueField: "customer_email_address",
                method: (req) => accWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                valueField: "customer_email_address",
                method: (req) => conWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "con-wvfetch/:customerId",
                params: ["customerId"],
                valueField: "customer_email_address",
                method: (req) => conWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId/customer",
                params: ["tskId"],
                fetchType: "customer",
                valueField: "customer_email_address",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    {
        key: "payment_type",
        contexts: [
            {
                module: "account_transaction",
                endpoint: "/acc-wvfetch/:acc_id",
                params: ["acc_id"],
                fetchType: null,
                valueField: "payment_type",
                method: (req) => accWvFetch(req)
            },
        ],
    },
    {
        key: "payment_by",
        contexts: [
            {
                module: "account_transaction",
                endpoint: "/acc-wvfetch/:acc_id",
                params: ["acc_id"],
                fetchType: null,
                valueField: "payment_by",
                method: (req) => accWvFetch(req)
            },
        ],
    },
    {
        key: "payment_date",
        contexts: [
            {
                module: "account_transaction",
                endpoint: "/acc-wvfetch/:acc_id",
                params: ["acc_id"],
                fetchType: null,
                valueField: "payment_date",
                method: (req) => accWvFetch(req)
            },
        ],
    },
    {
        key: "account_amount",
        contexts: [
            {
                module: "account_transaction",
                endpoint: "/acc-wvfetch/:acc_id",
                params: ["acc_id"],
                fetchType: null,
                valueField: "account_amount",
                method: (req) => accWvFetch(req)
            },
        ],
    },
    {
        key: "voucher_type",
        contexts: [
            {
                module: "carts",
                endpoint: "/ord-wvfetch/:orderId",
                params: ["orderId"],
                fetchType: null,
                valueField: "voucher_type",
                method: (req) => ordWvFetch(req)
            },
        ],
    },
    {
        key: "voucher_number",
        contexts: [
            {
                module: "carts",
                endpoint: "/ord-wvfetch/:orderId",
                params: ["orderId"],
                fetchType: null,
                valueField: "voucher_number",
                method: (req) => ordWvFetch(req)
            },
        ],
    },
    {
        key: "voucher_date",
        contexts: [
            {
                module: "carts",
                endpoint: "/ord-wvfetch/:orderId",
                params: ["orderId"],
                fetchType: null,
                valueField: "voucher_date",
                method: (req) => ordWvFetch(req)
            },
        ],
    },
    {
        key: "voucher_amount",
        contexts: [
            {
                module: "carts",
                endpoint: "/ord-wvfetch/:orderId",
                params: ["orderId"],
                fetchType: null,
                valueField: "voucher_amount",
                method: (req) => ordWvFetch(req)
            },
        ],
    },

    // Company
    {
        key: "company_name",
        label: "Company Name",
        dataType: "string",
        contexts: [
            {
                module: "carts",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_name",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_name",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_name",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_name",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_name",
                method: (req) => cmpWvFetch(req)
            },
        ],
    },

    {
        key: "company_mobile_number",
        label: "Company Mobile Number",
        dataType: "string",
        contexts: [
            {
                module: "carts",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_mobile_number",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_mobile_number",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_mobile_number",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_mobile_number",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_mobile_number",
                method: (req) => cmpWvFetch(req)
            },
        ],
    },
    {
        key: "company_email_address",
        label: "Company Email Address",
        dataType: "string",
        contexts: [
            {
                module: "carts",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_email_address",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "account_transaction",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_email_address",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "customer_acc_transaction",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_email_address",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "auto_contact_assignment",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_email_address",
                method: (req) => cmpWvFetch(req)
            },
            {
                module: "task_whatsapp_send",
                endpoint: "cmp-wvfetch/:appId",
                params: ["appId"],
                fetchType: null,
                valueField: "company_email_address",
                method: (req) => cmpWvFetch(req)
            },
        ],
    },

    // Task 
    {
        key: "task_no",
        label: "Task No",
        dataType: "string",
        contexts: [
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId",
                params: ["tskId"],
                fetchType: null,
                valueField: "task_no",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    {
        key: "task_title",
        label: "Task Title",
        dataType: "string",
        contexts: [
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId",
                params: ["tskId"],
                fetchType: null,
                valueField: "task_title",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    // {
    //     key: "task_description",
    //     label: "Task Description",
    //     dataType: "string",
    //     contexts: [
    //         {
    //             module: "task_whatsapp_send",
    //             endpoint: "tsk-wvfetch/:tskId",
    //             params: ["tskId"],
    //             fetchType: null,
    //             valueField: "task_description",
    //             method: (req) => tskWbFetch(req)
    //         },
    //     ],
    // },

    {
        key: "task_status",
        label: "Task Status",
        dataType: "string",
        contexts: [
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId/status",
                params: ["tskId"],
                fetchType: "status",
                valueField: "task_status",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    {
        key: "task_priority",
        label: "Task Priority",
        dataType: "string",
        contexts: [
            {
                module: "task_whatsapp_send",
                endpoint: "tsk-wvfetch/:tskId",
                params: ["tskId"],
                fetchType: null,
                valueField: "task_priority",
                method: (req) => tskWbFetch(req)
            },
        ],
    },

    // 
];

// ── Attachment variable definitions (NEW) ─────────────────────
// Each entry resolves to a publicly accessible URL for media upload to WhatsApp.
// Add new attachment variables here matching frontend variableDefinitions.ts

const ATTACHMENT_VARIABLE_DEFINITIONS = [
    {
        key: "voucher_pdf",
        // Returns a PDF download URL for the order
        contexts: [
            {
                module: "carts",
                endpoint: "/ord-wvfetch/:orderId/pdf",
                params: ["orderId"],
                fetchType: 'pdf',
                valueField: "voucher_pdf_url",
                method: (req) => ordAttFetch(req)
            },
        ],
    },
    {
        key: "account_receipt_pdf",
        // Returns an image URL for the order
        contexts: [
            {
                module: "account_transaction",
                endpoint: "acc-wvfetch/:acc_id/pdf",
                params: ["acc_id"],
                fetchType: 'pdf',
                valueField: "account_receipt_pdf_url",
                method: (req) => accAttFetch(req)
            },
        ],
    },
    {
        key: "account_ledger_pdf",
        // Returns a PDF URL for account statement
        contexts: [
            {
                module: "customer_acc_transaction",
                endpoint: "/acc-wvfetch/:customerId/ledpdf",
                params: ["customerId"],
                fetchType: 'ledpdf',
                valueField: "account_ledger_pdf_url",
                method: (req) => accAttFetch(req)
            },
        ],
    },
    // Add more attachment variables here
];

// ── All definitions combined (for lookup) ────────────────────
const ALL_DEFINITIONS = [...BODY_VARIABLE_DEFINITIONS, ...ATTACHMENT_VARIABLE_DEFINITIONS];

// ── Helpers ──────────────────────────────────────────────────

const normalizeModule = (module) => {
    const commonPrefixes = ["carts", "account_transaction", "auto_contact_assignment"];
    for (const prefix of commonPrefixes) {
        if (module === prefix || module.startsWith(prefix + "_")) return prefix;
    }
    return module;
};

const getNestedValue = (obj, path) =>
    path.split(".").reduce((cur, key) => cur?.[key], obj);

const resolveVariable = async (
    req,
    variableKey,
    module,
    contextParams,
    fetchCache
) => {

    const varDef = ALL_DEFINITIONS.find(
        (v) => v.key === variableKey
    );

    if (!varDef) {
        return "";
    }

    const normalizedModule = normalizeModule(module);

    const context = varDef.contexts.find(
        (ctx) => ctx.module === normalizedModule
    );

    if (!context) {
        return "";
    }

    const cacheKey = JSON.stringify({
        module: normalizedModule,
        params: context.params.reduce((acc, p) => {
            acc[p] = contextParams[p];
            return acc;
        }, {}),
        fetchType: context.fetchType || "",
    });

    try {

        /**
         * IMPORTANT:
         * store promise immediately
         */
        if (!fetchCache.has(cacheKey)) {

            const fetchPromise = (async () => {

                const tempReq = {
                    ...req,
                    params: {
                        ...(req.params || {}),
                    },
                };

                context.params.forEach((p) => {
                    tempReq.params[p] = contextParams[p];
                });

                if (context.fetchType) {
                    tempReq.params.fetchType = context.fetchType;
                }

                const data = await context.method(tempReq);
                return Array.isArray(data)
                    ? data[0]
                    : data;

            })();

            fetchCache.set(cacheKey, fetchPromise);
        }

        /**
         * all callers await same promise
         */
        const row = await fetchCache.get(cacheKey);

        return String(
            getNestedValue(row ?? {}, context.valueField) ?? ""
        );

    } catch (err) {

        console.error(err);

        return "";
    }
};

// ── Main export ───────────────────────────────────────────────

/**
 * Resolve all variable mappings into concrete values.
 *
 * @param {Object} variableMappings
 * @param {string} module
 * @param {Object} contextParams
 * @returns {Object}
 */
export const resolveVariableMappings = async (
    req,
    variableMappings,
    module,
    contextParams,
) => {

    const entries = Object.entries(JSON.parse(variableMappings));

    const fetchCache = new Map();

    const resolved = await Promise.all(
        entries.map(async ([placeholder, variableKey]) => {

            const value = await resolveVariable(
                req,
                variableKey,
                module,
                contextParams,
                fetchCache
            );

            return [placeholder, value];
        }),
    );

    return Object.fromEntries(resolved);
};

/**
 * Resolve a single variable value from internal API.
 * Returns empty string on any failure — never throws.
 */
const resolveSingleVariable = async (req, variableKey, module, contextParams, definitions = ALL_DEFINITIONS) => {
    const normalizedModule = normalizeModule(module);
    const varDef = definitions.find((v) => v.key === variableKey);

    if (!varDef) {
        console.warn(`[variableResolver] Unknown variable key: ${variableKey}`);
        return "";
    }

    const context = varDef.contexts.find((ctx) => ctx.module === normalizedModule);
    if (!context) {
        console.warn(`[variableResolver] No context for ${variableKey} in ${normalizedModule}`);
        return "";
    }

    const missing = context.params.filter((p) => !contextParams[p]);
    if (missing.length) {
        console.warn(`[variableResolver] Missing params for ${variableKey}: ${missing.join(", ")}`);
        return "";
    }

    try {

        const tempReq = {
            ...req,
            params: {
                ...(req.params || {}),
            },
        };

        context.params.forEach((p) => {
            tempReq.params[p] = contextParams[p];
        });

        if (context.fetchType) {
            tempReq.params.fetchType = context.fetchType;
        }

        const data = await context.method(tempReq);
        const row = Array.isArray(data)
            ? data[0]
            : data;

        return String(
            getNestedValue(row ?? {}, context.valueField) ?? ""
        );

    } catch (err) {
        console.error(`[variableResolver] Failed ${variableKey} :`, err.message);
        return "";
    }
};

// ── Exported: Resolve attachment variable (NEW) ───────────────

/**
 * Resolve an attachment variable key to a media URL.
 *
 * Used by sendViaSavedConfig when the template has IMAGE/DOCUMENT/VIDEO header.
 *
 * @param {string} attachmentVariableKey  e.g. "order_pdf_url"
 * @param {string} module                 e.g. "carts_42"
 * @param {Object} contextParams          e.g. { orderId: 42 }
 * @returns {string}  Resolved URL, or "" on failure
 */
export const resolveAttachmentVariable = async (req, attachmentVariableKey, module, contextParams) => {
    if (!attachmentVariableKey) return "";
    return resolveSingleVariable(req, attachmentVariableKey, module, contextParams, ATTACHMENT_VARIABLE_DEFINITIONS);
};

/**
 * Validate that all required params for a mapping set are present.
 * Returns array of missing param descriptions.
 */
export const validateResolutionParams = (variableMappings, module, contextParams) => {
    const normalizedModule = normalizeModule(module);
    const issues = [];

    for (const [placeholder, variableKey] of Object.entries(JSON.parse(variableMappings))) {
        const varDef = ALL_DEFINITIONS.find((v) => v.key === variableKey);
        if (!varDef) {
            issues.push(`Unknown variable "${variableKey}" for placeholder {{${placeholder}}}`);
            continue;
        }
        const context = varDef.contexts.find((ctx) => ctx.module === normalizedModule);
        if (!context) {
            issues.push(`Variable "${variableKey}" not available for module "${normalizedModule}"`);
            continue;
        }
        const missing = context.params.filter((p) => !contextParams[p]);
        if (missing.length) {
            issues.push(`Placeholder {{${placeholder}}} needs params: ${missing.join(", ")}`);
        }
    }

    return issues;
};