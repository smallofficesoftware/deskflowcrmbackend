import { QueryTypes } from "sequelize";
import { resolveTemplate } from "../context.js";

// Picks who to assign to (A2.4 / A3.3 / A5.3). Own round-robin pointer per
// flow step (automation_assign_pointers) - independent of the old Auto
// Assignment screen's is_recurred pointer (plan 1.3).
//
// params.mode:
//   user         params.user_id
//   round_robin  params.user_ids [..] - next after the last one picked
//   least_load   params.user_ids [..] - fewest records of this type assigned
//                to them in the last 30 days

const LOAD_SQL = {
  contact_masters:
    "SELECT COUNT(*) AS c FROM `contact_masters` WHERE `isDelete` = 0 AND `company_masters_id` = :company " +
    "AND FIND_IN_SET(:user, `assinged_to_work_a_application_id`) AND `created_date_time` >= NOW() - INTERVAL 30 DAY",
  inquiries:
    "SELECT COUNT(*) AS c FROM `inquiries` WHERE `isDelete` = 0 AND `company_masters_id` = :company " +
    "AND FIND_IN_SET(:user, `inquiry_assigned_team_member`) AND `create_date_time` >= NOW() - INTERVAL 30 DAY",
  task_managements:
    "SELECT COUNT(*) AS c FROM `task_managements` WHERE `isDelete` = 0 AND `company_masters_id` = :company " +
    "AND FIND_IN_SET(:user, `assigned_team_member`) AND `created_date_time` >= NOW() - INTERVAL 30 DAY",
};

const idList = (v, ctx) =>
  [].concat(v || [])
    .flatMap((x) => String(resolveTemplate(x, ctx)).split(","))
    .map((x) => Number(x))
    .filter(Boolean);

export const pickAssignee = async ({ ctx, params, run, node, table }) => {
  const mode = params.mode || "user";
  if (mode === "user") {
    const id = Number(resolveTemplate(params.user_id, ctx));
    if (!id) throw new Error("Pick a team member to assign");
    return id;
  }
  const users = idList(params.user_ids, ctx);
  if (!users.length) throw new Error("Pick at least one team member");

  if (mode === "least_load") {
    const sql = LOAD_SQL[table];
    let best = users[0];
    let bestCount = Infinity;
    for (const user of users) {
      const [row] = await run.tenantDB.query(sql, {
        replacements: { company: run.company_masters_id, user: String(user) },
        type: QueryTypes.SELECT,
      });
      const c = Number(row?.c || 0);
      if (c < bestCount) {
        best = user;
        bestCount = c;
      }
    }
    return best;
  }

  // round_robin - row-locked so parallel runs don't pick the same person.
  if (run.is_test) return users[0];
  return run.tenantDB.transaction(async (t) => {
    await run.tenantDB.query(
      "INSERT IGNORE INTO `automation_assign_pointers` (`flow_id`, `node_id`, `last_user_id`) VALUES (?, ?, NULL)",
      { replacements: [run.flow.id, node.id], transaction: t }
    );
    const [ptr] = await run.tenantDB.query(
      "SELECT `last_user_id` FROM `automation_assign_pointers` WHERE `flow_id` = ? AND `node_id` = ? FOR UPDATE",
      { replacements: [run.flow.id, node.id], type: QueryTypes.SELECT, transaction: t }
    );
    const idx = users.indexOf(Number(ptr?.last_user_id));
    const next = users[(idx + 1) % users.length];
    await run.tenantDB.query(
      "UPDATE `automation_assign_pointers` SET `last_user_id` = ? WHERE `flow_id` = ? AND `node_id` = ?",
      { replacements: [next, run.flow.id, node.id], transaction: t }
    );
    return next;
  });
};
