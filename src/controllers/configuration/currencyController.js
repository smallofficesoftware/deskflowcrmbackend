import { getAllCurrency } from "../../services/configuration/currencyServices.js";
import callServiceMethod from "../baseController.js";

export const allCurrency = async(req,res)=>{
    await callServiceMethod(req,res, getAllCurrency(req), "getAllCurrency")
}