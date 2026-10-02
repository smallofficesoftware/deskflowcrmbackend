// Late-in and early-out are measured against the employee's scheduled shift
// (daily_in_time / daily_out_time on Employee Payroll). A shift time that was
// never set is stored as "00:00:00" (or blank), and measuring against midnight
// made every arrival look hours late: with the late-in penalty on, the penalty
// then wiped out the hours actually worked and the employee got no pay.
// A shift time of "00:00:00" or blank therefore means "no schedule set".
export function hasShiftTime(value) {
    if (value === null || value === undefined) return false;
    const text = String(value).trim();
    if (!text) return false;
    return !/^0{1,2}(:0{1,2}){0,2}$/.test(text);
}
