import { productImageModel } from "../../models/product_settings/productImageModel.js";

// Products keep their photos in product_images (one is primary). The
// create-product-images migration copied every old products.product_img into it,
// so documents and order screens show the primary photo from here.

/**
 * Map of product id -> original image path relative to media-folder/product-images
 * ("<companyId>/<file>"), primary photo first, then display order. Products with no
 * photo are absent from the map. The original is used, not the webp copy, because
 * pdf-lib embeds only PNG/JPEG.
 */
export const getPrimaryImagePaths = async (tenantDB, productIds) => {
  const ids = [...new Set((productIds || []).filter((id) => id != null))];
  const paths = new Map();
  if (ids.length === 0) return paths;
  const rows = await productImageModel(tenantDB).findAll({
    where: { product_id: ids, isDelete: 0 },
    attributes: ["product_id", "image_path"],
    order: [["is_primary", "DESC"], ["display_order", "ASC"], ["id", "ASC"]],
    raw: true,
  });
  for (const row of rows) {
    if (row.image_path && !paths.has(row.product_id)) paths.set(row.product_id, row.image_path);
  }
  return paths;
};
