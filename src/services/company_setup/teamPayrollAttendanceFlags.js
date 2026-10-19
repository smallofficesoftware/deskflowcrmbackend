import { employeePayrollModel } from "../../models/hr/employeePayrollModel.js";

// The compulsory-attendance flags live on employee_payrolls (single source of
// truth; the web Edit Team Member screen writes there and onLoad reads from
// there). The login rows returned by the team list still carry a legacy copy of
// these columns on a_application_logins that is no longer kept up to date, so a
// member whose flags were set on the payroll record showed up as "not
// compulsory" in the app's Team List / Add Attendance screens.
//
// Overlays the payroll values onto the team list items. A member with no payroll
// row gets 0, the same as onLoad treats a missing row. If the payroll lookup
// fails the items are returned untouched so the list still loads.
export const applyPayrollAttendanceFlags = async (req, items) => {
  if (!Array.isArray(items) || items.length === 0) return items;

  try {
    const payrolls = await employeePayrollModel(req.tenantDB).findAll({
      where: {
        a_application_login_id: items.map((item) => item.id),
        isDelete: 0,
      },
      attributes: [
        "a_application_login_id",
        "compulsary_attendance",
        "compulsary_attendance_image",
        "compulsary_gps_app_use",
      ],
      raw: true,
    });

    const payrollByLoginId = new Map(
      payrolls.map((payroll) => [Number(payroll.a_application_login_id), payroll])
    );

    return items.map((item) => {
      const payroll = payrollByLoginId.get(Number(item.id));
      return {
        ...item,
        compulsary_attendance: payroll?.compulsary_attendance == 1 ? 1 : 0,
        compulsary_attendance_image: payroll?.compulsary_attendance_image == 1 ? 1 : 0,
        compulsary_gps_app_use: payroll?.compulsary_gps_app_use == 1 ? 1 : 0,
      };
    });
  } catch (e) {
    console.error("ERROR IN applyPayrollAttendanceFlags:", e);
    return items;
  }
};
