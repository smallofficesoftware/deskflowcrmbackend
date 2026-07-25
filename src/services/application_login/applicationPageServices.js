import moment from "moment";
import applicationPagesModel from "../../models/application_login/applicationPagesModel.js";
import couponMasterModel from "../../models/application_login/couponMasterModel.js";
import companyModel from "../../models/company_setup/companyModel.js";
import planMasterModel from "../../models/configuration/planMasterModel.js";
import planVsPageModel from "../../models/configuration/planVsPageModel.js";

import companyVsPlansModel from "../../models/configuration/companyVsPlanModel.js";
import {
  compareDate,
  resBadRequest,
  resError,
  resSuccess,
} from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

// export const getPlanDetailFinal = async (req, res) => {
//   const { } = req.body;

//   try {
//     const resultPlanMaster = await planMasterModel.findAll({
//       where: { isDelete: 0 },
//       attributes: ["id", "plan_name", "plan_amount", "months", "trail_days"],
//     });
//     const planIdMap =
//       resultPlanMaster &&
//       resultPlanMaster.reduce((acc, plan) => {
//         acc[plan.id] = {
//           plan_id: plan.id,
//           plan_name: plan.plan_name,
//           plan_amount: plan.plan_amount,
//           months: plan.months,
//           trail_days: plan.trail_days,
//           plan_pages: [],
//         };
//         return acc;
//       }, {});

//     if (!resultPlanMaster.length) {
//       return resError({
//         developer_msg: "error",
//       });
//     }
//     const resultAppLoginRights = await planVsPageModel.findAll({
//       where: { isDelete: 0, plan_id: Object.keys(planIdMap) },
//       attributes: ["plan_id", "page_id", "data_limit"],
//     });
//     const pageIds = [
//       ...new Set(resultAppLoginRights.map(({ page_id }) => page_id)),
//     ];


//     if (!resultAppLoginRights.length) {
//       return resError({
//         developer_msg: "error",
//       });
//     }
//     const resultApplicationPage = await applicationPagesModel.findAll({
//       where: { isDelete: 0, id: pageIds },
//       attributes: ["id", "page_name"],
//     });
//     const pageMap =
//       resultApplicationPage &&
//       resultApplicationPage.reduce((acc, page) => {
//         acc[page.id] = page.page_name;
//         return acc;
//       }, {});

//     const allData = resultApplicationPage.map((item) => item.dataValues);
//     resultAppLoginRights.forEach(({ plan_id, page_id, data_limit }) => {
//       if (planIdMap[plan_id] && pageMap[page_id]) {
//         planIdMap[plan_id].plan_pages.push({
//           page_name: pageMap[page_id],
//           dataLimit: data_limit,
//           allData,
//         });
//       }
//     });
//     const finalResult = Object.values(planIdMap);

//     if (resultApplicationPage) {
//       return resSuccess({
//         data: { item: finalResult },
//       });
//     } else {
//       return resError({
//         developer_msg: "error",
//       });
//     }
//   } catch (error) {
//     resBadRequest({ developer_msg: `e ${error}` });
//   }
// };

export const getPlanDetail = async (req, res) => {
  const { a_application_login_id } = req.body;

  try {
    let isRenewal = 0;
    let getAllCompanyDetail
    let findCompanyId = await getCompanyByLoginId(a_application_login_id);

    if (findCompanyId !== null || findCompanyId !== undefined) {
      getAllCompanyDetail = await companyModel.findOne({
        where: {
          id: findCompanyId.company_masters_id,
          isDelete: "0",
        },
        attributes: ["plan_expiry_date"],
      });
    }
    if (!getAllCompanyDetail.dataValues.plan_expiry_date == '' || !getAllCompanyDetail.dataValues.plan_expiry_date == '0000-00-00') {

      const getdate = compareDate(
        getAllCompanyDetail.dataValues.plan_expiry_date
      );
      // console.log("getdate", getdate);

      if (getdate == 1) {
        isRenewal = 1;
      } else {
        isRenewal = 0;
      }
    }


    const [resultPlanMaster, resultAppLoginRights, resultApplicationPage] =
      await Promise.all([
        planMasterModel.findAll({
          where: { isDelete: 0 },
          attributes: [
            "id",
            "plan_name",
            "plan_amount",
            "months",
            "trail_days",
            "actual_amount",
            "monthly_plan_amount",
          ],
          raw: true,
        }),
        planVsPageModel.findAll({
          where: { isDelete: 0 },
          attributes: ["plan_id", "page_id", "data_limit", "extra_information"],
          raw: true,
        }),
        applicationPagesModel.findAll({
          where: { isDelete: 0, isPublic: 1 },
          attributes: ["id", "page_name"],
          raw: true,
        }),
      ]);
    const pageMap = {};
    for (let i = 0; i < resultApplicationPage.length; i++) {
      const { id, page_name } = resultApplicationPage[i];
      pageMap[id] = page_name;
    }
    const planMap = {};
    for (let i = 0; i < resultPlanMaster.length; i++) {
      const plan = resultPlanMaster[i];
      planMap[plan.id] = {
        plan_id: plan.id,
        plan_name: plan.plan_name,
        plan_amount: plan.plan_amount,
        actual_amount: plan.actual_amount,
        monthly_plan_amount: plan.monthly_plan_amount,
        months: plan.months,
        trail_days: plan.trail_days,
        isRenewal: isRenewal,
        plan_pages: [],
      };
    }
    const planPageMap = {};
    for (let i = 0; i < resultAppLoginRights.length; i++) {
      const { plan_id, page_id, data_limit } = resultAppLoginRights[i];
      if (!planPageMap[plan_id]) {
        planPageMap[plan_id] = {};
      }
      planPageMap[plan_id][page_id] = {
        dataLimit: data_limit,
        extra_information: resultAppLoginRights[i].extra_information, // ✅ ADD
        is_allow: 1,
        page_id: page_id
      };
    }
    for (const planId in planMap) {
      for (const pageId in pageMap) {
        planMap[planId].plan_pages.push({
          page_name: pageMap[pageId],
          dataLimit: planPageMap[planId]?.[pageId]?.dataLimit,
          extra_information: planPageMap[planId]?.[pageId]?.extra_information,
          page_id: pageId,
          is_allow: planPageMap[planId]?.[pageId] ? 1 : 0,
        });
      }
    }
    const finalResult = Object.values(planMap);

    if (resultApplicationPage) {
      return resSuccess({
        data: { item: finalResult },
      });
    } else {
      return resError({
        developer_msg: "error",
      });
    }
  } catch (error) {
    resBadRequest({ developer_msg: `e ${error}` });
  }
};

export const getCouponWisePlanDetail = async (req, res) => {
  const { company_id, coupon_code, duration, plan_id } = req.body;

  try {
    const currentDate = moment().format("YYYY-MM-DD HH:mm:ss");

    // Validate Coupon
    const getCouponCode = await couponMasterModel.findOne({
      where: {
        isDelete: "0",
        isActive: "1",
        coupon_code: coupon_code,
      },
      attributes: [
        "id",
        "coupon_discount_percentage",
        "coupon_expire_date",
        "max_use_count",
        "plan_id",
      ],
    });

    if (!getCouponCode) {
      return resError({
        ack_msg: "Invalid coupon",
        developer_msg: "Coupon not found or inactive",
      });
    }

    //Check if coupon expired
    if (moment(getCouponCode.coupon_expire_date).isBefore(currentDate)) {
      return resError({
        ack_msg: "Coupon expired",
        developer_msg: "Coupon expiration date passed",
      });
    }

    //  Check max usage limitl
    const couponUsageCount = await companyVsPlansModel.count({
      where: {
        coupon_code_id: getCouponCode.id,
      },
    });


    if (
      getCouponCode.max_use_count &&
      couponUsageCount >= Number(getCouponCode.max_use_count)
    ) {
      return resError({
        ack_msg: "Coupon usage limit reached",
        developer_msg: "Coupon max use count exceeded",
      });
    }
    if (
      getCouponCode.plan_id &&
      Number(getCouponCode.plan_id) !== Number(plan_id)
    ) {
      return resError({
        ack_msg: "This coupon code is not valid for this plan",
        developer_msg: "This coupon code is not valid for this plan",
      });
    }

    //Validate plan
    const planDetail = await planMasterModel.findOne({
      where: { id: plan_id, isDelete: 0 },
      attributes: ["id", "plan_name", "plan_amount"],
    });

    if (!planDetail) {
      return resError({
        ack_msg: "Invalid plan",
        developer_msg: "Plan not found",
      });
    }

    // Plan Calculation Logic
    let effectivePlanAmount = Number(planDetail.plan_amount);

    // Agar duration 4 hai (quarterly payment of yearly plan), toh monthly rate nikaal ke 4 se multiply karenge
    if (Number(duration) === 4) {
      console.log("under");

      effectivePlanAmount = Number((planDetail.plan_amount / 12).toFixed(2)); // yearly → monthly rate
    }
    console.log("effectivePlanAmounteffectivePlanAmount", effectivePlanAmount);

    const discountPercent = Number(getCouponCode.coupon_discount_percentage);
    const totalPlanAmount = effectivePlanAmount * Number(duration);

    const baseAmount = Number((totalPlanAmount / 1.18).toFixed(2));
    const totalDiscount = Number(((baseAmount * discountPercent) / 100).toFixed(2));
    const taxableAmount = Number((baseAmount - totalDiscount).toFixed(2));
    const gstAmount = Number((taxableAmount * 0.18).toFixed(2));
    const payableAmount = Number((taxableAmount + gstAmount).toFixed(2));

    const round_payable_amt = Math.round(payableAmount);
    const round_off_amt = Number(Math.abs(payableAmount - round_payable_amt).toFixed(2));

    const getAllCompanyDetail = await companyModel.findOne({
      where: { id: company_id, isDelete: "0" },
      attributes: ["plan_expiry_date"],
    });

    return resSuccess({
      ack: 1,
      msg: "Coupon applied successfully",
      data: {
        coupon_code_id: getCouponCode.id,
        plan_id,
        plan_name: planDetail.plan_name,
        plan_amount: effectivePlanAmount,
        duration: Number(duration),
        total_plan_amount_including_gst: totalPlanAmount,
        discount_percent: discountPercent,
        total_discount: totalDiscount,
        taxable_amount: taxableAmount,
        gst_amount: gstAmount,
        payable_amount: round_payable_amt,
        round_payable_amt: round_payable_amt,
        round_off_amount: round_off_amt,
        company_plan_expiry: getAllCompanyDetail?.plan_expiry_date || null,
      },
    });
  } catch (error) {
    console.error("Error in getCouponWisePlanDetail:", error);
    return resBadRequest({
      developer_msg: `Error: ${error.message}`,
    });
  }
};




