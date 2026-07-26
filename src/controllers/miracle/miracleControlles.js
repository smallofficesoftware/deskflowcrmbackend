import { bulkSyncMiracleModules, fetchAccountLedger, fetchContact, fetchMiracleProducts, generateLedger, generateMiracleToken, generateOustanding, getMiracleUnsyncedCounts, miracleConfigCreate, miracleConfigGet, processContact, processProducts, syncCaseBankPr, syncInvoice, syncProduct } from "../../services/miracle/miracleService.js";
import { webhookM } from "../../services/miracle/miracleWebhookService.js";
import callServiceMethod from "../baseController.js";

export const syncProductProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        syncProduct(req),
        "syncProductProvider"
    );
};

export const syncInvoiceProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        syncInvoice(req),
        "syncInvoiceProvider"
    );
};

export const syncCaseBankPrProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        syncCaseBankPr(req),
        "syncCaseBankPrProvider"
    );
};

export const generateLedgerProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        generateLedger(req),
        "generateLedgerProvider"
    );
};

export const generateOutstandingProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        generateOustanding(req),
        "generateOutstandingProvider"
    );
};

export const webhookProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        webhookM(req, res),
        "webhookProvider"
    );
};

export const createMiracleConfig = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        miracleConfigCreate(req, res),
        "miracleConfigCreate"
    );
};

export const getMiracleConfig = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        miracleConfigGet(req, res),
        "miracleConfigCreate"
    );
};

export const getAccountLedger = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchAccountLedger(req, res),
        "getAccountLedger"
    );
};

export const fetchProductProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchMiracleProducts(req, res),
        "fetchProductProvider"
    );
};

export const processProductProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        processProducts(req, res),
        "processProductProvider"
    );
};

export const fetchContactProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        fetchContact(req, res),
        "fetchContactProvider"
    );
};

export const processContactProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        processContact(req, res),
        "processContactProvider"
    );
};

export const generateMiracleTokenProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        generateMiracleToken(req, res),
        "generateMiracleTokenProvider"
    );
};

export const getMiracleUnsyncedCountsProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        getMiracleUnsyncedCounts(req, res),
        "getMiracleUnsyncedCountsProvider"
    );
};

export const bulkSyncMiracleModulesProvider = async (req, res) => {
    await callServiceMethod(
        req,
        res,
        bulkSyncMiracleModules(req, res),
        "bulkSyncMiracleModulesProvider"
    );
};