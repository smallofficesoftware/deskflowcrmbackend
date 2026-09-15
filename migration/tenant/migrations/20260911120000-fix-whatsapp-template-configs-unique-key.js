/**
 * Migration Name: fix-whatsapp-template-configs-unique-key
 * Database Type: TENANT
 *
 * Bug: whatsappTemplateConfigsUpdate (variableSystemService.js) upserts on
 * the model's unique index, which used to be (module, template_id,
 * user_id) — user_id being whichever a_application_login_id happened to be
 * on the request. Every screen that READS this table back
 * (whatsappTemplateConfigs/whatsappTemplateConfigGet for display,
 * sendWhatsappTemplateViaBackend for actually sending) queries by module
 * (+ template_id) alone, with no user_id filter and no ordering. So any
 * edit whose user_id didn't exactly match the row that was last saved
 * (a different admin, or the id just not being sent that time) inserted a
 * NEW row instead of updating the old one — the edit silently "didn't
 * save" because the read path kept returning the stale first-found row.
 * Deleting the config wiped every duplicate for that module, so the next
 * save was the only row left and started showing up correctly again,
 * until the next edit quietly created another duplicate.
 *
 * Fix: the unique key becomes (module, template_id) — dropping user_id
 * from it, matching how every read path already treats this as a
 * module+template-scoped config, not a per-user one. user_id stays as a
 * plain column (who last saved it), just not part of the uniqueness.
 * Before narrowing the index, any duplicate (module, template_id) rows
 * left over from the bug are collapsed to the most recently updated one
 * (ties broken by highest id) — otherwise adding the new unique index
 * would fail outright wherever duplicates already exist.
 */

const OLD_INDEX = "unique_module_template_user";
const NEW_INDEX = "unique_module_template";

export const up = async (queryInterface) => {
  // Collapse any (module, template_id) duplicates down to one row (the
  // most recently updated) before the new unique index can be added.
  await queryInterface.sequelize.query(`
    DELETE t1 FROM whatsapp_template_configs t1
    INNER JOIN whatsapp_template_configs t2
      ON t1.module = t2.module
      AND t1.template_id = t2.template_id
      AND (t1.updated_at < t2.updated_at OR (t1.updated_at = t2.updated_at AND t1.id < t2.id))
  `);

  const indexes = await queryInterface.showIndex("whatsapp_template_configs");
  if (indexes.some((i) => i.name === OLD_INDEX)) {
    await queryInterface.removeIndex("whatsapp_template_configs", OLD_INDEX);
  }
  if (!indexes.some((i) => i.name === NEW_INDEX)) {
    await queryInterface.addIndex("whatsapp_template_configs", ["module", "template_id"], {
      unique: true,
      name: NEW_INDEX,
    });
  }
};

export const down = async (queryInterface) => {
  // Duplicate rows collapsed by `up` are not restorable — this only
  // reverts the index shape, not the cleanup.
  const indexes = await queryInterface.showIndex("whatsapp_template_configs");
  if (indexes.some((i) => i.name === NEW_INDEX)) {
    await queryInterface.removeIndex("whatsapp_template_configs", NEW_INDEX);
  }
  if (!indexes.some((i) => i.name === OLD_INDEX)) {
    await queryInterface.addIndex("whatsapp_template_configs", ["module", "template_id", "user_id"], {
      unique: true,
      name: OLD_INDEX,
    });
  }
};
