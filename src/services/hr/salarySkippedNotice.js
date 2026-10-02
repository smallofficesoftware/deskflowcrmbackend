// Salary Process skips an employee who has no Employee Payroll row (their salary
// cannot be calculated without one). That used to happen silently, so the employee
// just never appeared in the Salary Register. This builds the result the run
// returns so the user is told who was skipped and why.

const MAX_NAMES_IN_MESSAGE = 10;

export const SALARY_SUCCESS_MESSAGE = "salary calculation success";

// skipped: [{ id, name }]. With nobody skipped the message stays exactly as before.
export function buildSalaryProcessResult(processedCount, skipped = []) {
    if (!skipped.length) {
        return { ack_msg: SALARY_SUCCESS_MESSAGE, data: { processed_count: processedCount, skipped_employees: [] } };
    }

    const label = (e) => (e.name ? e.name : `Employee #${e.id}`);
    const shown = skipped.slice(0, MAX_NAMES_IN_MESSAGE).map(label).join(", ");
    const more = skipped.length > MAX_NAMES_IN_MESSAGE ? ` and ${skipped.length - MAX_NAMES_IN_MESSAGE} more` : "";

    return {
        ack_msg:
            `Salary calculated for ${processedCount} employee${processedCount === 1 ? "" : "s"}. ` +
            `${skipped.length} skipped because Employee Payroll is not set up: ${shown}${more}. ` +
            "Set up their Employee Payroll, then run Salary Process again.",
        data: {
            processed_count: processedCount,
            skipped_employees: skipped.map((e) => ({ id: e.id, name: e.name || "" })),
        },
    };
}
