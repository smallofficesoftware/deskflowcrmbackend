/**
 * Migration Name: fix-socket-connections-id-autoincrement
 * Database Type: MASTER
 * Created: 26/08/2026
 *
 * 20251025072452-add-comments-in-socket-connections.js changed the `id`
 * column via changeColumn() without restating autoIncrement/primaryKey -
 * MySQL's MODIFY COLUMN replaces the whole column definition, so that
 * migration silently dropped id's AUTO_INCREMENT and PRIMARY KEY. Backfill
 * any NULL ids left behind by that gap before restoring the constraint.
 */

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.sequelize.query(`
    SET @rn := COALESCE((SELECT MAX(id) FROM socket_connections), 0);
  `);
  await queryInterface.sequelize.query(`
    UPDATE socket_connections
    SET id = (@rn := @rn + 1)
    WHERE id IS NULL
    ORDER BY updated_date;
  `);
  await queryInterface.sequelize.query(`
    ALTER TABLE socket_connections
    MODIFY id INT(11) NOT NULL AUTO_INCREMENT,
    ADD PRIMARY KEY (id);
  `);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE socket_connections
    DROP PRIMARY KEY,
    MODIFY id INT(11) DEFAULT NULL;
  `);
};
