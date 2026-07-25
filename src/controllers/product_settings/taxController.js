import { taxAdd, taxGet, taxUpdate } from "../../services/product_settings/taxServices.js";
import callServiceMethod from "../baseController.js";

export const addTax = async (req, res) => {
    await callServiceMethod(req, res, taxAdd(req), "taxAdd");
};

export const getTax = async (req, res) => {
    await callServiceMethod(req, res, taxGet(req), "taxGet");
};

export const updateTax = async (req, res) => {
    await callServiceMethod(req, res, taxUpdate(req), "taxUpdate");
};