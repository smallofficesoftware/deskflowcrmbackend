/**
 * Migration Name: add-product-remarks-to-inquiries
 * Database Type: TENANT
 *
 * Per-product remarks for the multi-product inquiry rows (Create Inquiry /
 * Contact Add's inline inquiry section). Positionally paired with the
 * comma-joined product_id / qty / category_id — remarks are free text
 * (commas, newlines) so they can't reuse the comma-join those columns use;
 * joined instead with the distinctive delimiter "||$||", e.g.
 * "remark 1||$||remark 2". LONGTEXT so a long remark on many rows never
 * truncates. NULL / "" both mean "no remarks".
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("inquiries");
  if (!table.product_remarks) {
    await queryInterface.addColumn("inquiries", "product_remarks", {
      type: Sequelize.TEXT("long"),
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn("inquiries", "product_remarks");
};
