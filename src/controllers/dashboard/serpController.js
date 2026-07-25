import { getSerpAccountDetailData, getSerpCountriesData, getSerpSearchResultProvider, insertGlobalSearchContact } from "../../services/dashboard/serpServices.js";
import callServiceMethod from "../baseController.js";

export const getSerpSearch = async (req, res) => {
  await callServiceMethod(
    req,
    res,
    getSerpSearchResultProvider(req),
    "getSerpSearch"
  );
};

export const addGlobalSearched = async (req, res) => {
  await callServiceMethod(req, res, insertGlobalSearchContact(req), "addGlobalSearched");
};

export const getSerpAccountDetails = async (req, res) => {
  await callServiceMethod(req, res, getSerpAccountDetailData(req), "getSerpAccountDetails");
}

export const getSerpCountries = async (req, res) => {
  await callServiceMethod(req, res, getSerpCountriesData(req), "getSerpCountries");
}