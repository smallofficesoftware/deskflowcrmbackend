import fs from "fs-extra";
import path from "path";
import sharp from "sharp";
import { categoryModel } from "../../models/product_settings/categoryModel.js";
import { CATEGORY_IMG_LINK_EXTENDED } from "../../utils/appConstants.js";
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";

// One image per category (not a gallery like product_images - a category
// tile needs exactly one picture), for the ecommerce storefront (23-10-2026,
// see migration 20261023120000's own comment - categories had no image
// column at all before this). Same webp+thumbnail conversion as
// productImageServices.js's generateWebpVariants - duplicated here rather
// than factored into a shared helper, matching this codebase's own existing
// convention of small per-feature image handlers (the same open-qty stock
// query is independently duplicated 3x already; see P4's own research notes).

const CATEGORY_IMAGES_ROOT = () => path.join(process.cwd(), "media-folder", "category-images");

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

/** POST /get-category-image { category_id } - mirrors getProductImages'
 * pre-built-URL shape so the CRM's category edit form can preview the
 * current image the same way ProductPhotosSection does for products. */
export const getCategoryImage = async (req) => {
  try {
    const { category_id } = req.body;
    if (!category_id) return resBadRequest({ developer_msg: "category_id is required" });

    const companyId = req.user?.companyId;
    if (!companyId) return resBadRequest({ ack_msg: "Company not found" });

    const CategoryModel = categoryModel(req.tenantDB);
    const category = await CategoryModel.findOne({
      where: { id: category_id, company_masters_id: companyId, isDelete: 0 },
      attributes: ["image_path", "webp_path", "thumbnail_path"],
      raw: true,
    });
    if (!category) return resError({ ack_msg: "Category not found" });

    return resSuccess({
      data: {
        item: {
          image_url: category.image_path ? CATEGORY_IMG_LINK_EXTENDED + category.image_path : null,
          webp_url: category.webp_path ? CATEGORY_IMG_LINK_EXTENDED + category.webp_path : null,
          thumbnail_url: category.thumbnail_path ? CATEGORY_IMG_LINK_EXTENDED + category.thumbnail_path : null,
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const uploadCategoryImage = async (req) => {
  try {
    const { category_id } = req.body;
    const file = req.file;
    if (!category_id) return resBadRequest({ developer_msg: "category_id is required" });
    if (!file) return resBadRequest({ developer_msg: "image file is required" });

    // req.user.companyId (set by tenantMiddleware) is the correct, already-
    // resolved company for this authenticated request - NOT re-derived via
    // getCompanyByLoginId(a_application_login_id), which productImageServices.js
    // uses but which resolves incorrectly for at least one real company in
    // this dataset (confirmed live: company 67's own a_application_login_id
    // resolves via that helper to company 692 instead). Not touching that
    // existing file - just not repeating its mistake here.
    const companyId = req.user?.companyId;
    if (!companyId) return resBadRequest({ ack_msg: "Company not found" });

    const CategoryModel = categoryModel(req.tenantDB);
    const category = await CategoryModel.findOne({ where: { id: category_id, company_masters_id: companyId, isDelete: 0 } });
    if (!category) return resError({ ack_msg: "Category not found" });

    const companyFolder = path.join(CATEGORY_IMAGES_ROOT(), companyId.toString());
    await fs.mkdirp(companyFolder);

    const fileName = path.basename(file.path);
    await fs.move(file.path, path.join(companyFolder, fileName), { overwrite: true });

    const { webpName, thumbName } = await generateWebpVariants(companyFolder, fileName);

    // One image per category - remove the old set of files before pointing at the new one.
    const root = CATEGORY_IMAGES_ROOT();
    for (const p of [category.image_path, category.webp_path, category.thumbnail_path]) {
      if (p) await fs.remove(path.join(root, p)).catch(() => {});
    }

    await category.update({
      image_path: `${companyId}/${fileName}`,
      webp_path: `${companyId}/${webpName}`,
      thumbnail_path: `${companyId}/${thumbName}`,
    });

    return resSuccess({
      ack_msg: "Category image uploaded",
      data: {
        item: {
          image_url: CATEGORY_IMG_LINK_EXTENDED + category.image_path,
          webp_url: CATEGORY_IMG_LINK_EXTENDED + category.webp_path,
          thumbnail_url: CATEGORY_IMG_LINK_EXTENDED + category.thumbnail_path,
        },
      },
    });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};

export const deleteCategoryImage = async (req) => {
  try {
    const { category_id } = req.body;
    if (!category_id) return resBadRequest({ developer_msg: "category_id is required" });

    const companyId = req.user?.companyId;
    if (!companyId) return resBadRequest({ ack_msg: "Company not found" });

    const CategoryModel = categoryModel(req.tenantDB);
    const category = await CategoryModel.findOne({ where: { id: category_id, company_masters_id: companyId, isDelete: 0 } });
    if (!category) return resError({ ack_msg: "Category not found" });

    const root = CATEGORY_IMAGES_ROOT();
    for (const p of [category.image_path, category.webp_path, category.thumbnail_path]) {
      if (p) await fs.remove(path.join(root, p)).catch(() => {});
    }

    await category.update({ image_path: null, webp_path: null, thumbnail_path: null });
    return resSuccess({ ack_msg: "Category image removed" });
  } catch (error) {
    return resError({ developer_msg: `error ${error}` });
  }
};
