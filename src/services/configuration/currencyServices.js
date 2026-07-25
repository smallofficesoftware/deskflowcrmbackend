import currencyModel from "../../models/configuration/currencyModel.js";
import { resError, resSuccess } from "../../utils/sharedFunctions.js";

export const getAllCurrency = async (req) => {
  try {
    const currency = await currencyModel.findAll({
        where:{
            isDelete:0
        }
    });
    
    // return currency
    if (currency)
      return resSuccess({
        ack_msg: "Currency Get Successfully",
        data: { item: currency },
      });
    else {
      return resError({
        ack_msg: "No company",
        developer_msg: "Data not found",
      });
    }
  } catch (error) {
    logger.error(error);
  }
};
