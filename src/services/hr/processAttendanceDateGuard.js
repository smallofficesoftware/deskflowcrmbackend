// Attendance for a day is only complete once the day is over, so Process
// Attendance must not run for today or any later date. The popup already limits
// the date inputs; this makes the API refuse the same thing.
import moment from "moment";
import { resError } from "../../utils/sharedFunctions.js";

const DATE_FORMAT = "YYYY-MM-DD";

export const TODAY_NOT_ALLOWED_MESSAGE =
    "Today's attendance cannot be processed. Select dates up to yesterday.";

// Returns an error response (same shape the other service errors use) when
// from_date or to_date is today or later, otherwise null. `now` is injectable for tests.
export function rejectTodayOrFutureDates(from_date, to_date, now = moment()) {
    const lastProcessable = now.clone().subtract(1, "day").format(DATE_FORMAT);

    for (const value of [from_date, to_date]) {
        if (!value) continue;
        const date = moment(value, DATE_FORMAT, true);
        if (date.isValid() && date.format(DATE_FORMAT) > lastProcessable) {
            return resError({
                ack_msg: TODAY_NOT_ALLOWED_MESSAGE,
                developer_msg: `from_date/to_date must be on or before ${lastProcessable}, got ${value}`,
            });
        }
    }
    return null;
}
