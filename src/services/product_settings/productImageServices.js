import fs from "fs-extra";
import path from "path";
import sharp from "sharp";
import { productImageModel } from "../../models/product_settings/productImageModel.js";
import { PRODUCT_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";

// Multiple photos per product/variant - plans/2026-10-20-product-variant-ui-and-field-scoping-plan.txt,
// Phase 2. product_id is always the row's OWN id (Simple product's own id, or a
// variant's own id - never the parent's), same convention as every other per-variant
// field already built in Part A.

const PRODUCT_IMAGES_ROOT = () => path.join(process.cwd(), "media-folder", "product-images");

/** Converts an already-moved original into a WebP full-size + WebP thumbnail,
 * alongside it in the same company folder. Mirrors productServices.js's existing
 * move-into-company-folder step - this only adds the sharp conversion on top. */
const generateWebpVariants = async (companyFolder, fileName) => {
  const parsed = path.parse(fileName);
  const webpName = `${parsed.name}.webp`;
  const thumbName = `${parsed.name}-thumb.webp`;
  const srcPath = path.join(companyFolder, fileName);

  await sharp(srcPath).webp({ quality: 82 }).toFile(path.join(companyFolder, webpName));
  await sharp(srcPath)
    .resize({ width: 300, height: 300, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(path.join(companyFolder, thumbName));

  return { webpName, thumbName };
};

export const getProductImages = async (req) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return resBadRequest({ developer_msg: "product_id is required" });

    const ProductImageModel = productImageModel(req.tenantDB);
    const images = await ProductImageModel.findAll({
      where: { product_id, isDelete: 0 },
      order: [["display_order", "ASC"], ["id", "ASC"]],
      raw: true,
    });

    const withUrls = images.map((img) => ({
      ...img,
      image_url: img.image_path ? PRODUCT_IMG_LINK_EXTENDED + img.image_path : null,
      webp_url: img.webp_path ? PRODUCT_IMG_LINK_EXTENDED + img.webp_path : null,
      thumbnail_url: img.thumbnail_path ? PRODUCT_IMG_LINK_EXTENDED + img.thumbnail_path : null,
    }));

    return resSuccess({ data: { item: withUrls } });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const uploadProductImage = async (req) => {
  try {
    const { a_application_login_id, product_id } = req.body;
    const file = req.file;
    if (!product_id) return resBadRequest({ developer_msg: "product_id is required" });
    if (!file) return resBadRequest({ developer_msg: "image file is required" });

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId?.company_masters_id) {
      return resBadRequest({ ack_msg: "Company not found" });
    }
    const companyId = findCompanyId.company_masters_id;

    const companyFolder = path.join(PRODUCT_IMAGES_ROOT(), companyId.toString());
    await fs.mkdirp(companyFolder);

    const fileName = path.basename(file.path);
    await fs.move(file.path, path.join(companyFolder, fileName), { overwrite: true });

    const { webpName, thumbName } = await generateWebpVariants(companyFolder, fileName);

    const ProductImageModel = productImageModel(req.tenantDB);

    const existingCount = await ProductImageModel.count({
      where: { product_id, isDelete: 0 },
    });

    const created = await ProductImageModel.create({
      company_masters_id: companyId,
      product_id,
      image_path: `${companyId}/${fileName}`,
      webp_path: `${companyId}/${webpName}`,
      thumbnail_path: `${companyId}/${thumbName}`,
      display_order: existingCount,
      is_primary: existingCount === 0 ? 1 : 0, // first photo for this product becomes primary automatically
    });

    return resSuccess({
      ack_msg: "Photo uploaded",
      data: {
        item: {
          ...created.toJSON(),
          image_url: PRODUCT_IMG_LINK_EXTENDED + created.image_path,
          webp_url: PRODUCT_IMG_LINK_EXTENDED + created.webp_path,
          thumbnail_url: PRODUCT_IMG_LINK_EXTENDED + created.thumbnail_path,
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const deleteProductImage = async (req) => {
  try {
    const { id } = req.body;
    if (!id) return resBadRequest({ developer_msg: "id is required" });

    const ProductImageModel = productImageModel(req.tenantDB);
    const image = await ProductImageModel.findOne({ where: { id, isDelete: 0 } });
    if (!image) return resError({ ack_msg: "Photo not found" });

    const root = PRODUCT_IMAGES_ROOT();
    for (const p of [image.image_path, image.webp_path, image.thumbnail_path]) {
      if (p) await fs.remove(path.join(root, p)).catch(() => {});
    }

    await ProductImageModel.update({ isDelete: 1 }, { where: { id } });

    // If the deleted photo was primary, promote the next-oldest remaining one.
    if (image.is_primary) {
      const next = await ProductImageModel.findOne({
        where: { product_id: image.product_id, isDelete: 0 },
        order: [["display_order", "ASC"], ["id", "ASC"]],
      });
      if (next) await ProductImageModel.update({ is_primary: 1 }, { where: { id: next.id } });
    }

    return resSuccess({ ack_msg: "Photo deleted" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const setPrimaryProductImage = async (req) => {
  try {
    const { id, product_id } = req.body;
    if (!id || !product_id) {
      return resBadRequest({ developer_msg: "id and product_id are required" });
    }

    const ProductImageModel = productImageModel(req.tenantDB);
    await ProductImageModel.update({ is_primary: 0 }, { where: { product_id, isDelete: 0 } });
    await ProductImageModel.update({ is_primary: 1 }, { where: { id } });

    return resSuccess({ ack_msg: "Primary photo updated" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

/** Simple up/down reorder (plan Q1 - no drag-and-drop for v1): caller sends the
 * product's photo ids in their new full order; display_order is just each id's index. */
export const reorderProductImages = async (req) => {
  try {
    const { ordered_ids } = req.body;
    if (!Array.isArray(ordered_ids) || !ordered_ids.length) {
      return resBadRequest({ developer_msg: "ordered_ids[] is required" });
    }

    const ProductImageModel = productImageModel(req.tenantDB);
    await Promise.all(
      ordered_ids.map((id, index) =>
        ProductImageModel.update({ display_order: index }, { where: { id } })
      )
    );

    return resSuccess({ ack_msg: "Order updated" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};
