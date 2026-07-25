
import callServiceMethod from "../baseController.js";
import {getdataStatistics,getallreport } from "../../services/dashboard/statisticsServices.js"

export const getallstatisticscontact = async (req, res) => {
    await callServiceMethod(
      req,
      res,
     getdataStatistics(req),
      "addCustomFieldFrom"
    );
  };
  export const getallreportscontact = async (req, res) => {
    await callServiceMethod(
      req,
      res,
     getallreport(req),
      "addCustomFieldFrom"
    );
  };
  
  