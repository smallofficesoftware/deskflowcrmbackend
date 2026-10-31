import { productImageModel } from "../../models/product_settings/productImageModel.js";
import { productModel } from "../../models/product_settings/productModel.js";

// Products keep their photos in product_images (one is primary). The
// create-product-images migration copied every old products.product_img into it,
// so documents and order screens show the primary photo from here.

/**
 * Makes `imagePath` the product's primary photo. Used by the create/update product
 * endpoints, which the mobile app still uses to upload a photo: without this the
 * file would only land in products.product_img and no document would show it.
 * An existing primary row is pointed at the new file (its webp/thumbnail copies
 * belong to the old file, so they are cleared); otherwise a primary row is added.
 */
export const setPrimaryImagePath = async (tenantDB, { productId, companyId, imagePath }) => {
  if (!productId || !imagePath) return;
  const ProductImage = productImageModel(tenantDB);
  const primary = await ProductImage.findOne({ where: { product_id: productId, is_primary: 1, isDelete: 0 } });
  if (primary) {
    await primary.update({ image_path: imagePath, webp_path: null, thumbnail_path: null });
  } else {
    await ProductImage.create({ company_masters_id: companyId, product_id: productId, image_path: imagePath, display_order: 0, is_primary: 1 });
  }
};

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
  // A variant with no photo of its own shows its parent product's primary photo.
  const missing = ids.filter((id) => !paths.has(id));
  if (missing.length > 0) {
    const variants = await productModel(tenantDB).findAll({
      where: { id: missing, isDelete: 0 },
      attributes: ["id", "parent_product_id"],
      raw: true,
    });
    const parentOf = new Map(variants.filter((v) => v.parent_product_id).map((v) => [v.id, v.parent_product_id]));
    if (parentOf.size > 0) {
      const parentPaths = await getPrimaryImagePaths(tenantDB, [...parentOf.values()]);
      for (const [variantId, parentId] of parentOf) {
        if (parentPaths.has(parentId)) paths.set(variantId, parentPaths.get(parentId));
      }
    }
  }
  return paths;
};
