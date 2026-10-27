/**
 * Migration Name: add-price-list-rates-application-page
 * Database Type: MASTER
 *
 * Price List Rates report (current rates + rate change history). Its own application page so
 * Team Rights lists it by name and it can be granted separately from Price List Management.
 * `modual_name` is what Team Rights shows, so it equals the page name like every other page.
 *
 * id 202 - next after Ecommerce Storefront (201) in the local master DB. The admin panel and
 * other environments number a_application_pages differently, so re-verify
 * (SELECT MAX(id) FROM a_application_pages) on demo / live before running this. If 202 is
 * already used by another page this migration stops instead of silently skipping.
 */

const PRICE_LIST_RATES_PAGE_ID = 202;
const PAGE_SLUG = "price_list_rates";

export const up = async (queryInterface) => {
  const [existingPage] = await queryInterface.sequelize.query(
    `SELECT id FROM \`a_application_pages\` WHERE \`page_slug\` = '${PAGE_SLUG}' LIMIT 1`
  );
  if (existingPage.length === 0) {
    const [idTaken] = await queryInterface.sequelize.query(
      `SELECT page_slug FROM \`a_application_pages\` WHERE \`id\` = ${PRICE_LIST_RATES_PAGE_ID} LIMIT 1`
    );
    if (idTaken.length > 0) {
      throw new Error(
        `a_application_pages id ${PRICE_LIST_RATES_PAGE_ID} is already used by '${idTaken[0].page_slug}'. Pick the next free id and update PAGE_ID.PRICE_LIST_RATES in the frontend and backend enums to match.`
      );
    }
    await queryInterface.sequelize.query(
      `INSERT INTO \`a_application_pages\` (\`id\`, \`page_name\`, \`modual_name\`, \`page_slug\`, \`description\`, \`type\`, \`display_order\`, \`isPublic\`, \`isRights\`, \`created_date_time\`, \`s_timestemp\`, \`isDelete\`, \`isActive\`) VALUES (${PRICE_LIST_RATES_PAGE_ID}, 'Price List Rates', 'Price List Rates', '${PAGE_SLUG}', 'Current rate of every product in each price list and the history of rate changes', '0', '0', '0', '1', NOW(), UNIX_TIMESTAMP(), '0', '1');`
    );
  }

  await queryInterface.sequelize.query(
    "INSERT INTO `plan_vs_pages` (`plan_id`, `page_id`, `data_limit`, `extra_information`, `created_date_time`, `s_timestemp`, `isDelete`, `isActive`) " +
      "SELECT pm.`id`, p.`id`, '0', '', NOW(), current_timestamp(), '0', '1' " +
      `FROM \`plan_masters\` pm JOIN \`a_application_pages\` p ON p.\`page_slug\` = '${PAGE_SLUG}' ` +
      "WHERE pm.`isDelete` = 0 AND NOT EXISTS (SELECT 1 FROM `plan_vs_pages` x WHERE x.`plan_id` = pm.`id` AND x.`page_id` = p.`id`)"
  );
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `DELETE FROM \`plan_vs_pages\` WHERE \`page_id\` IN (SELECT \`id\` FROM \`a_application_pages\` WHERE \`page_slug\` = '${PAGE_SLUG}')`
  );
  await queryInterface.sequelize.query(`DELETE FROM \`a_application_pages\` WHERE \`page_slug\` = '${PAGE_SLUG}'`);
};
