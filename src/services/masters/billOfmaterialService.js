import { Op, Sequelize } from "sequelize";
import { getUserRights } from '../../helpers/rightsHelper.js';
import loginModel from "../../models/application_login/loginModel.js";
import { billOfMaterialsModel } from "../../models/masters/billOfMaterialsModel.js";
import { productBillOfMaterialModel } from "../../models/product_settings/productBillOfMaterialModel.js";
import { productModel } from "../../models/product_settings/productModel.js";
import { PAGE_ID } from '../../utils/AppEnumeration.js';
import logger from '../../utils/logger.js';
import { resBadRequest, resError, resSuccess } from "../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../commonServices.js";




export const getBillOfMaterials = async (req, res) => {
    try {
        const { a_application_login_id, searchTerm } = req.body;

        if (!a_application_login_id) {
            return resError({
                ack_msg: "Missing required parameter",
                developer_msg: "a_application_login_id is required",
            });
        }

        // Step 1: Get Company Information
        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        if (!findCompanyId?.company_masters_id) {
            return resError({
                ack_msg: "Company not found",
                developer_msg: "No company found for the provided login ID",
            });
        }

        const companyId = findCompanyId.company_masters_id;

        // Step 2: Check User Rights
        const { showAllData, showPersonalData } = await getUserRights({
            company_masters_id: companyId,
            a_application_login_id,
            page_id: PAGE_ID.BILL_OF_MATERIALS,
            tenentId: req.tenantDB
        });

        const billOfMaterialsModelInstance = productBillOfMaterialModel(req.tenantDB);

        // Step 3: Build Where Condition with Rights Logic
        const whereCondition = {
            isDelete: 0,
        };

        if (findCompanyId.company_flag == 1 ||
            (findCompanyId.company_flag === 2 && showAllData)) {
            whereCondition.company_masters_id = companyId;
        }
        else if (findCompanyId.company_flag == 2 && showPersonalData) {
            whereCondition.company_masters_id = companyId;
            whereCondition.a_application_login_id = a_application_login_id;
        }
        else {
            whereCondition.company_masters_id = companyId;
            whereCondition.a_application_login_id = a_application_login_id;
        }

        // Optional Search
        if (searchTerm && searchTerm.trim() !== '') {
            const term = `%${searchTerm.trim()}%`;
            whereCondition[Op.or] = [
                { bom_name: { [Op.like]: term } },
            ];
        }

        // Step 4: Fetch Bill of Materials
        const materialList = await billOfMaterialsModelInstance.findAll({
            where: whereCondition,
            order: [['id', 'DESC']],
        });

        if (!materialList || materialList.length === 0) {
            return resError({
                ack_msg: "No Bill of Materials found",
                developer_msg: "Data not found",
            });
        }

        // Step 5: Get all unique product_ids from the list
        const productIds = [...new Set(
            materialList
                .map(m => m.product_id)
                .filter(id => id != null && id !== '')
        )];

        let productMap = new Map();

        // Step 6: Fetch product names in one query (if any product_ids exist)
        if (productIds.length > 0) {
            const productModelInstance = productModel(req.tenantDB);

            const products = await productModelInstance.findAll({
                where: {
                    id: productIds,
                    isDelete: 0,
                    company_masters_id: companyId   // security: same company
                },
                attributes: ['id', 'product_name', 'product_code'],
                raw: true
            });

            productMap = new Map(
                products.map(p => [p.id, {
                    product_name: p.product_name,
                    product_code: p.product_code
                }])
            );
        }

        // Step 7: Get Active Team for createdByName
        const activeTeamList = await loginModel.findAll({
            where: {
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT a_application_login_id 
                        FROM company_vs_application_logins 
                        WHERE isDelete = 0 
                        AND company_masters_id = ${companyId}
                    )`)
                },
                isDelete: 0
            },
            attributes: ["id", "username"],
            raw: true
        });

        const activeTeamMap = new Map(
            activeTeamList.map(user => [Number(user.id), user.username])
        );

        // Step 8: Format the final response
        const formattedMaterialList = materialList.map(material => {
            const rawMaterial = material.toJSON ? material.toJSON() : material;

            const productInfo = productMap.get(Number(rawMaterial.product_id)) || {};

            const createdByName = activeTeamMap.get(
                Number(rawMaterial.a_application_login_id)
            ) || "Unknown";

            return {
                ...rawMaterial,
                createdByName,
                product_name: productInfo.product_name || "N/A",
                product_code: productInfo.product_code || null,
            };
        });

        return resSuccess({
            ack_msg: "Materials fetched successfully",
            data: {
                item: formattedMaterialList
            },
        });

    } catch (error) {
        logger.error('Error in getBillOfMaterials:', error);
        return resBadRequest({
            developer_msg: `Error: ${error.message || error}`,
        });
    }
};

export const createBillOfMaterials = async (req) => {
    try {
        const { bill_of_materials_name, bill_of_materials_color, a_application_login_id } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);
        console.log("aaaaaaaaaaaaa", findCompanyId);

        if (!findCompanyId) {
            return resBadRequest({
                ack_msg: "Company not found",
            });
        }

        const billOfMaterialsModelInstance = billOfMaterialsModel(req.tenantDB);
        console.log("billOfMaterialsModelInstance", billOfMaterialsModelInstance);

        // ✅ Duplicate Check
        const duplicateCheck = await billOfMaterialsModelInstance.findOne({
            where: {
                bill_of_materials_name: bill_of_materials_name,
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0
            }
        });

        if (duplicateCheck) {
            return resError({
                ack_msg: "Name already available",
            });
        }

        const billOfMaterialsWare = {
            a_application_login_id: findCompanyId.a_application_login_id,
            company_masters_id: findCompanyId.company_masters_id,
            bill_of_materials_name: bill_of_materials_name,
            bill_of_materials_color: bill_of_materials_color
        };

        console.log("ccccccccccccccccccccc", billOfMaterialsWare);

        const createBillOfmaterials = await billOfMaterialsModelInstance.create(
            billOfMaterialsWare
        );

        if (createBillOfmaterials)
            return resSuccess({
                ack_msg: "Materials Add Successfully",
                data: { item: createBillOfmaterials.bill_of_materials_name },
            });
        else {
            return resError({
                ack_msg: "Materials Add To Failed",
                developer_msg: "Materials Add To Failed",
            });
        }

    } catch (error) {
        console.error("Error:", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: error.message || error,
        });
    }
};




export const updateBillOfMaterials = async (req) => {
    try {
        const {
            editMaterialsId,
            bill_of_materials_name,
            bill_of_materials_color,
            a_application_login_id
        } = req.body;

        const findCompanyId = await getCompanyByLoginId(a_application_login_id);

        if (!findCompanyId) {
            return resBadRequest({
                ack_msg: "Company not found",
            });
        }

        const billOfMaterialsModelInstance = billOfMaterialsModel(req.tenantDB);

        // Check record exists
        const existingRecord = await billOfMaterialsModelInstance.findOne({
            where: {
                id: editMaterialsId,
                company_masters_id: findCompanyId.company_masters_id,
                isDelete: 0
            }
        });

        if (!existingRecord) {
            return resError({
                ack_msg: "Material not found",
            });
        }

        const duplicateCheck = await billOfMaterialsModelInstance.findOne({
            where: {
                bill_of_materials_name: bill_of_materials_name,
                company_masters_id: findCompanyId.company_masters_id,
                id: { [Op.ne]: editMaterialsId },
                isDelete: 0
            }
        });

        if (duplicateCheck) {
            return resError({
                ack_msg: "Name already available",
            });
        }

        // Update
        await billOfMaterialsModelInstance.update(
            {
                bill_of_materials_name,
                bill_of_materials_color
            },
            {
                where: {
                    id: editMaterialsId
                }
            }
        );

        return resSuccess({
            ack_msg: "Materials Updated Successfully",
            data: { item: bill_of_materials_name },
        });

    } catch (error) {
        console.error("Error:", error);
        return resBadRequest({
            ack_msg: "UNKNOWN_ERROR_TRY_AGAIN",
            developer_msg: error.message || error,
        });
    }
};


export const deleteBillOfMaterials = async (req) => {
    const { a_application_login_id, materials_id } = req.body;

    if (!a_application_login_id || !materials_id) {
        return resError({
            ack_msg: "Application login ID and category ID are required",
        });
    }

    const findCompanyId = await getCompanyByLoginId(a_application_login_id);
    if (!findCompanyId || !findCompanyId.company_masters_id) {
        return resError({
            ack_msg: "Invalid application login ID",
        });
    }

    const billOfMaterialsModelInstance = billOfMaterialsModel(req.tenantDB);

    let billOfMaterialsIds = [];

    if (Array.isArray(materials_id)) {
        billOfMaterialsIds = materials_id
            .map(id => Number(id))
            .filter(id => !isNaN(id));
    } else if (typeof materials_id === "string" && materials_id.includes(",")) {
        billOfMaterialsIds = materials_id
            .split(",")
            .map(id => Number(id))
            .filter(id => !isNaN(id));
    } else {
        billOfMaterialsIds = [Number(materials_id)]
            .filter(id => !isNaN(id));
    }

    if (billOfMaterialsIds.length === 0) {
        return resError({
            ack_msg: "Invalid category ID format",
        });
    }



    const [rowsUpdated] = await billOfMaterialsModelInstance.update(
        {
            isDelete: 1,
        },
        {
            where: {
                isDelete: 0,
                id: { [Op.in]: billOfMaterialsIds },
            },
        }
    );

    if (rowsUpdated === 0) {
        return resError({
            ack_msg: "No Materials found or already deleted",
        });
    }

    return resSuccess({
        ack_msg: billOfMaterialsIds.length > 1 ? "Materials Deleted Successfully" : "Materials Deleted Successfully",
        data: { item: rowsUpdated },
    });
};