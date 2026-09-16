/**
 * Migration Name: remove-document-designer-blanket-feature-flag
 * Database Type: MASTER
 * Created: 16/09/2026
 *
 * document_designer was a single blanket company_feature_flags row gating
 * every pdfme doc type at once. Replaced by one row per doc type (e.g.
 * quotation_document_designer, salesOrder_document_designer,
 * shippingLabel_document_designer, ...) so a company can enable just one
 * type. No code reads the "document_designer" key anymore — deletes the
 * now-orphaned rows. Companies that had it on need the specific new keys
 * turned on again from the admin panel.
 */

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(
    "DELETE FROM `company_feature_flags` WHERE `feature_key` = 'document_designer'"
  );
};

export const down = async () => {
  // Irreversible — which companies had it enabled is not recoverable once deleted.
};
