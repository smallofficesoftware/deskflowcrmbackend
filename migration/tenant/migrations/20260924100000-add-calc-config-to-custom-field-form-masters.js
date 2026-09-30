/**
 * Migration Name: add-calc-config-to-custom-field-form-masters
 * Database Type: TENANT
 *
 * Lets a product custom field on an order line be a calculated field.
 * calc_config holds JSON: {"expr":"{products_column_number_1}*{products_column_number_2}","drives":"qty"|"amount"|null}
 * expr references other row fields by reference_column_name plus the built-ins
 * {rate}, {quantity}, {discount}; "drives" optionally makes the result the
 * line quantity or line amount. Evaluated on the frontend (create order screen).
 */

export const up = async (queryInterface, Sequelize) => {
  const table = await queryInterface.describeTable("custom_field_form_masters");
  if (!table.calc_config) {
    await queryInterface.addColumn("custom_field_form_masters", "calc_config", {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  }
};

export const down = async (queryInterface) => {
  const table = await queryInterface.describeTable("custom_field_form_masters");
  if (table.calc_config) {
    await queryInterface.removeColumn("custom_field_form_masters", "calc_config");
  }
};
