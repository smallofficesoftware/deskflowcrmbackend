// Process Attendance skips days before an employee's joining date. A login saved
// without one comes back from MySQL as the zero date (0000-00-00), which is an
// invalid date: formatting it gives the text "Invalid date", and every real date
// sorts before that text, so every day was skipped and the employee never got
// any attendance processed. A missing or invalid joining date means "no limit".
import moment from "moment";

export function toJoinDateIso(value) {
    if (!value) return null;
    const date = moment(value);
    return date.isValid() ? date.format("YYYY-MM-DD") : null;
}
