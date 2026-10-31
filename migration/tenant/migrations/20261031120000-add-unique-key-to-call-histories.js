/**
 * Migration Name: add-unique-key-to-call-histories
 * Database Type: TENANT
 * Created: 31/10/2026
 *
 * The mobile app could upload the same call twice (overlapping syncs / retries), and the
 * check-then-insert in createCall is racy across server processes. This adds a DB-level
 * unique key so a call (login + type + number + start time + duration) can exist only once.
 *
 * Existing duplicates would make the index fail, so before creating it the extra copies
 * (everything except the lowest id of each group) are copied into
 * `call_histories_duplicates_backup` and then deleted. Nothing else references call_histories
 * by foreign key.
 */

const TABLE = "call_histories";
const BACKUP = "call_histories_duplicates_backup";
const INDEX = "ux_call_histories_call";

const indexExists = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table
        AND INDEX_NAME = :index`,
    { replacements: { table: TABLE, index: INDEX } },
  );
  return Number(rows[0]?.c) > 0;
};

export const up = async (queryInterface) => {
  if (await indexExists(queryInterface)) return;

  const q = (sql) => queryInterface.sequelize.query(sql);

  // Rows that are not the first copy of their (login, type, number, time, duration) group.
  const duplicateIds = `
    SELECT id FROM (
      SELECT c.id
        FROM \`${TABLE}\` c
        JOIN (
          SELECT MIN(id) AS keep_id, a_application_login_id, call_type, mobile_number, call_date_time, duration
            FROM \`${TABLE}\`
           GROUP BY a_application_login_id, call_type, mobile_number, call_date_time, duration
        ) k
          ON k.a_application_login_id <=> c.a_application_login_id
         AND k.call_type <=> c.call_type
         AND k.mobile_number <=> c.mobile_number
         AND k.call_date_time <=> c.call_date_time
         AND k.duration <=> c.duration
       WHERE c.id <> k.keep_id
    ) d`;

  await q(`CREATE TABLE IF NOT EXISTS \`${BACKUP}\` LIKE \`${TABLE}\``);
  // The backup must not inherit the unique key we are about to add (it is created before it,
  // but a re-run after a partial failure could otherwise copy it).
  await q(`INSERT IGNORE INTO \`${BACKUP}\` SELECT * FROM \`${TABLE}\` WHERE id IN (${duplicateIds})`);
  await q(`DELETE FROM \`${TABLE}\` WHERE id IN (${duplicateIds})`);

  await q(
    `ALTER TABLE \`${TABLE}\`
       ADD UNIQUE KEY \`${INDEX}\`
         (\`a_application_login_id\`, \`call_type\`, \`mobile_number\`(32), \`call_date_time\`, \`duration\`(16))`,
  );
};

export const down = async (queryInterface) => {
  if (await indexExists(queryInterface)) {
    await queryInterface.sequelize.query(`ALTER TABLE \`${TABLE}\` DROP INDEX \`${INDEX}\``);
  }
};
