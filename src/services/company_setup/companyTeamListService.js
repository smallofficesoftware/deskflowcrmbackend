import { Op } from "sequelize";
import loginModel from "../../models/application_login/loginModel.js";
import { resBadRequest } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";
import { getByIdTeam } from "./companyVsApplicationLoginService.js";

// My Company > Team List only (ticket #2529). /my-team is shared by many
// pickers and filters that need the whole roster, so it is left alone; this
// wraps it and narrows the result for the one screen that should be restricted.
// Owner (company_flag 1) sees everyone, exactly as /my-team returns. Anyone
// else sees themself plus the logins whose reporting_member points at them.
export const getCompanyTeamList = async (req) => {
  try {
    // Who is asking: the id in the body, else the logged-in user from the
    // token. A call without a_application_login_id used to make this NaN and
    // fail with "Unknown column 'NaN' in 'WHERE'".
    const me = Number(req.body?.a_application_login_id) || Number(req.user?.id);
    if (!me) return resBadRequest({ ack_msg: "Login id not found" });

    const response = await getByIdTeam(req);
    const items = response?.data?.item;
    if (response?.ack !== 1 || !Array.isArray(items)) return response;

    const requester = await getCompanyByLoginId(me);
    if (Number(requester?.company_flag) === 1) return response;

    const directReports = await loginModel.findAll({
      where: {
        isDelete: "0",
        reporting_member: me,
        id: { [Op.in]: items.map((item) => item.id) },
      },
      attributes: ["id"],
      raw: true,
    });
    const visibleIds = new Set([me, ...directReports.map((report) => Number(report.id))]);

    return { ...response, data: { ...response.data, item: items.filter((item) => visibleIds.has(Number(item.id))) } };
  } catch (e) {
    console.error("ERROR IN getCompanyTeamList:", e);
    return resBadRequest({ developer_msg: e });
  }
};
