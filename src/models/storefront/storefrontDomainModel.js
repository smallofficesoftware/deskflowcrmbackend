import { DATE, INTEGER, STRING, TINYINT } from "sequelize";
import sequelize from "../../config/sequelize.js";

// MASTER DB. Custom domain -> company lookup for the ecommerce storefront
// (see migration 20261026100000-create-storefront-domains.js).
const storefrontDomainModel = sequelize.define("storefront_domains", {
  id: { type: INTEGER, autoIncrement: true, primaryKey: true },
  company_masters_id: { type: INTEGER },
  a_application_login_id: { type: INTEGER },
  domain: { type: STRING(255) },
  verification_token: { type: STRING(64) },
  verified_at: { type: DATE },
  isDelete: { type: TINYINT },
}, { timestamps: false });

export default storefrontDomainModel;
