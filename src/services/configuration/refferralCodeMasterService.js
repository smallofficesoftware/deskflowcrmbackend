import refferralCodeMasterModal from "../../models/configuration/refferralCodeMasterModal.js";
import {
    resBadRequest,
    resError,
    resSuccess,
} from "../../utils/sharedFunctions.js";

export const referralCodeVerifyFromCompany = async (req) => {
  let { referral_code } = req;
    
  try {

      
    if (referral_code && referral_code !== "") {
      const referralRecord = await refferralCodeMasterModal.findOne({
        where: {
          referral_code: referral_code,
          isDelete: 0,
        },
        attributes: ["id"],
      });

        
       
      if (!referralRecord) {
        return resError({
          ack_msg: "Referral code does not match",
          developer_msg: "Invalid referral code",
        });
      }
      
      return resSuccess({
        data: { referral_code_id: referralRecord.id },
        developer_msg: "Referral code verified successfully",
      });
    }
  } catch (e) {
    console.log("Error in referralCodeVerifyFromCompany:", e);
    return resBadRequest({
      developer_msg: `Error: ${e.message}`,
    });
  }
};
