// What Salary Process tells the user after a run.
//  - skipped:  employees with no Employee Payroll row; their salary cannot be
//              calculated, so they never appeared in the Salary Register (used to be silent).
//  - warnings: employees that were calculated but need attention, each with the
//              reasons (a missing pay field, attendance days with no result).

const MAX_NAMES_IN_MESSAGE = 10;

export const SALARY_SUCCESS_MESSAGE = "salary calculation success";

const label = (e) => (e.name ? e.name : `Employee #${e.id}`);

// skipped: [{ id, name }]   warnings: [{ id, name, reasons: [string] }]
// With nothing to report the message stays exactly as before.
export function buildSalaryProcessResult(processedCount, skipped = [], warnings = []) {
    const data = {
        processed_count: processedCount,
        skipped_employees: skipped.map((e) => ({ id: e.id, name: e.name || "" })),
        warnings: warnings.map((w) => ({ id: w.id, name: w.name || "", reasons: w.reasons })),
    };

    if (!skipped.length && !warnings.length) {
        return { ack_msg: SALARY_SUCCESS_MESSAGE, data };
    }

    const parts = [`Salary calculated for ${processedCount} employee${processedCount === 1 ? "" : "s"}.`];

    if (skipped.length) {
        const shown = skipped.slice(0, MAX_NAMES_IN_MESSAGE).map(label).join(", ");
        const more = skipped.length > MAX_NAMES_IN_MESSAGE ? ` and ${skipped.length - MAX_NAMES_IN_MESSAGE} more` : "";
        parts.push(
            `${skipped.length} skipped because Employee Payroll is not set up: ${shown}${more}. ` +
            "Set up their Employee Payroll, then run Salary Process again.",
        );
    }

    if (warnings.length) {
        const shown = warnings
            .slice(0, MAX_NAMES_IN_MESSAGE)
            .map((w) => `${label(w)} (${w.reasons.join("; ")})`)
            .join(", ");
        const more = warnings.length > MAX_NAMES_IN_MESSAGE ? ` and ${warnings.length - MAX_NAMES_IN_MESSAGE} more` : "";
        parts.push(`Check: ${shown}${more}.`);
    }

    return { ack_msg: parts.join(" "), data };
}
