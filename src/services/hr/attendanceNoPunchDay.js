// Process Attendance used to write no row for a working day with no punch, no leave,
// and no week off or holiday. That day then showed blank on the slip and was not counted
// as absent (ticket #2888: 30 days, 27.5 payable, one day unexplained). A day like that
// is an absent day, so it gets a row and calcDayStatus gives it the Absent status.
// Without payroll there is no status to give it, so those days stay skipped.
export function shouldSkipDay({ payroll, records, leave_list, isWeekOffDay, isHolidayDay }) {
    return !payroll && records.length <= 0 && leave_list.length <= 0 && !isWeekOffDay && !isHolidayDay;
}
