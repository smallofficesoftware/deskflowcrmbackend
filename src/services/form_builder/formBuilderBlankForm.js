// The blank printout of a form (plan item O9): one line per field, with an
// empty line or tick boxes to fill in by hand. Pure module — used by the PDF
// generator (pdfmeEngine/formSubmissionGenerate.js) and unit-tested in
// formBuilderBlankForm.test.js.

export const BLANK_TABLE_ROWS = 5;

const LINE = "______________________________";
const SHORT_LINE = "____________";

const box = (label) => `[  ] ${label}`;

function optionsLine(options) {
  return (Array.isArray(options) ? options : []).map(box).join("     ");
}

function nameOf(field) {
  return field.label || field.key;
}

// One printed line (or block of lines) for a field, or null for a field that
// prints nothing on its own (a repeater prints as a table below the details).
export function blankLineFor(field) {
  const name = nameOf(field);
  switch (field.type) {
    case "section-header":
      return `\n${String(name).toUpperCase()}`;
    case "instruction": {
      const text = field.content ? String(field.content).replace(/<[^>]*>/g, "").trim() : "";
      return text || null;
    }
    case "repeater":
      return null;
    case "signature":
      return `${name}: ${LINE}`;
    case "image":
      return `${name}: (attach a photo)`;
    case "file":
      return `${name}: (attach a file)`;
    case "dropdown":
    case "radio":
    case "multi-select":
      return `${name}: ${optionsLine(field.options) || LINE}`;
    case "checkbox":
    case "switch":
      return `${name}: ${box("Yes")}     ${box("No")}`;
    case "date":
      return `${name}: ____ / ____ / ________`;
    case "datetime":
      return `${name}: ____ / ____ / ________    ____ : ____`;
    case "time":
      return `${name}: ____ : ____`;
    case "rating": {
      const max = Number(field.max) > 0 ? Number(field.max) : 5;
      return `${name}: ${Array.from({ length: max }, (_, i) => `(${i + 1})`).join(" ")}`;
    }
    case "currency":
      return `${name}: ₹ ${SHORT_LINE}`;
    case "percentage":
      return `${name}: ${SHORT_LINE} %`;
    case "location":
      return `${name}: (record the location)`;
    case "barcode":
      return `${name}: ${LINE}`;
    case "auto-number":
      return `${name}: (numbered automatically)`;
    case "calculation":
      return `${name}: (worked out automatically)`;
    case "textarea":
    case "address":
      return `${name}: ${LINE}\n${LINE}${LINE}`;
    case "question-table": {
      const questions = Array.isArray(field.questions) ? field.questions : [];
      const columns = Array.isArray(field.answer_columns) && field.answer_columns.length ? field.answer_columns : [{ key: "answer", type: "yes_no" }];
      const main = columns[0];
      const choices = { yes_no: ["Yes", "No"], yes_no_na: ["Yes", "No", "N/A"], pass_fail: ["Pass", "Fail"] }[main.type];
      const extras = columns.slice(1).map((c) => `${c.label || c.key}: ${SHORT_LINE}`).join("   ");
      const rows = questions.map((q, i) => {
        const answer = choices ? choices.map(box).join("   ") : main.type === "checkbox" ? box("Done") : SHORT_LINE;
        return `${i + 1}. ${q.text || ""}   ${answer}${extras ? `   ${extras}` : ""}`;
      });
      return `${name}:\n${rows.join("\n")}`;
    }
    default:
      return `${name}: ${LINE}`;
  }
}
