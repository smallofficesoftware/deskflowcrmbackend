import { generate } from "@pdfme/generator";
import * as plugins from "@pdfme/schemas";
import { loadFonts } from "./fonts.js";
import {
  applyConditionalVisibility,
  applyTokenSubstitution,
  fillMissingInputsFromContent,
  resolveDataSources,
} from "./orderInputMapper.js";
import { buildTaskDueListTemplate, TASK_TABLE_COLUMNS } from "./taskDueListTemplate.js";

const fontMap = loadFonts();
const pluginMap = { text: plugins.text, table: plugins.table };

// companyData: same shape generateDueTaskPdfandSendMail (taskManagementServices.js)
// already fetches for the EJS path (id/company_name/address/company_contact/
// company_email/gst_number). teamWiseTaskList: same [{team_name, tasks:[...]}]
// shape that function builds.
export async function generateTaskDueListPdf({ companyData, teamWiseTaskList }) {
  const template = buildTaskDueListTemplate();

  // Same conditional-join logic as dueTaskListViewV1.ejs's header block
  // (only show a line/separator when the underlying value is actually set) —
  // now split into companyName/companyAddress/companyContactLine/
  // companyGSTIN, one per field, matching accountStatementGenerate.js's own
  // convention exactly (companyGSTIN's "GSTIN: " prefix baked into the
  // value itself, since there's no separate label field to carry it).
  const companyName = String(companyData?.company_name || "").toUpperCase();
  const companyAddress = companyData?.address || "";
  const companyContactLine = [
    companyData?.company_contact ? `Mo. ${companyData.company_contact}` : null,
    companyData?.company_email || null,
  ]
    .filter(Boolean)
    .join(" | ");
  const companyGSTIN = companyData?.gst_number ? `GSTIN: ${companyData.gst_number}` : "";

  const rows = [];
  (teamWiseTaskList || []).forEach((team) => {
    (team.tasks || []).forEach((tx, idx) => {
      rows.push(
        TASK_TABLE_COLUMNS.map((c) => {
          switch (c.key) {
            case "no":
              return String(idx + 1);
            case "team":
              return team.team_name ?? "";
            case "taskNo":
              return String(tx.id ?? "");
            case "title":
              return [tx.task_title, tx.task_remark].filter(Boolean).join("\n");
            case "status":
              return tx.status_name ?? "";
            case "assignedTo":
              return tx.assinged_to_names ?? "";
            case "date":
              return `Start ${tx.task_fromdate ?? ""}\nEnd ${tx.task_enddate ?? ""}`;
            case "dueDays":
              return String(tx.due_days ?? "");
            default:
              return "";
          }
        }),
      );
    });
  });

  const rawInputs = {
    companyName,
    companyAddress,
    companyContactLine,
    companyGSTIN,
    hasTasks: rows.length ? "1" : "",
    taskTable: JSON.stringify(rows),
    noDataText: "No due task found",
  };

  let resolvedInputs = resolveDataSources(template, rawInputs);
  resolvedInputs = fillMissingInputsFromContent(template, resolvedInputs);
  resolvedInputs = applyTokenSubstitution(template, resolvedInputs);
  const visibleTemplate = applyConditionalVisibility(template, resolvedInputs);

  const pdfBytes = await generate({ template: visibleTemplate, inputs: [resolvedInputs], plugins: pluginMap, options: { font: fontMap } });
  return Buffer.from(pdfBytes);
}
