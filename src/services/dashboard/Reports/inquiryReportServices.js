import moment from "moment";
import { Op, Sequelize } from "sequelize";
import { getUserRights } from "../../../helpers/rightsHelper.js";
import { contactModel } from "../../../models/activities/contactModel.js";
import { inquiryModel } from "../../../models/activities/inquiryModel.js";
import loginModel from "../../../models/application_login/loginModel.js";
import { labelModel } from "../../../models/masters/labelModel.js";
import { sourceTypesModel } from "../../../models/masters/sourceTypeMode.js";
import { stagestatusModel } from "../../../models/masters/stagestatusModel.js";
import { customFieldFormModel } from "../../../models/other_settings/customFieldFormModel.js";
import { categoryModel } from "../../../models/product_settings/categoryModel.js";
import { productModel } from "../../../models/product_settings/productModel.js";
import { PAGE_ID } from "../../../utils/AppEnumeration.js";
import { resError, resSuccess } from "../../../utils/sharedFunctions.js";
import { getCompanyByLoginId } from "../../commonServices.js";

export const inquiryReport = async (req) => {
  try {
    const {
      selected_dates,
      selectedLabels,
      selectedSourceTypes,
      selectedStageStatus,
      selectedTeamMembers,
      selectedDemography,
      selectedProduct,
      selectedCategory,
      selectedContactId,
      ul,
      ll,
      referenceWiseContact
    } = req.body;
    const globalSearch = req.body.globalSearch?.trim() || "";
    const startDate = moment(selected_dates[0]).startOf('day').format('YYYY-MM-DD');
    const endDate = moment(selected_dates[1]).endOf('day').format('YYYY-MM-DD');


    const offset = ul;
    const limit = ll;
    const findCompanyId = await getCompanyByLoginId(
      req.body.a_application_login_id
    );


    if (!Array.isArray(selected_dates) || selected_dates.length !== 2) {
      return resError({
        ack_msg: "Invalid Input",
        developer_msg: "selected_dates must be an array of two valid YYYY-MM-DD dates",
      });
    }
    const parsedDates = selected_dates.map(date => {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return null;
      }
      return parsed.toISOString().split('T')[0];
    });

    if (parsedDates.some(date => date === null)) {
      return resError({
        ack_msg: "Invalid Input",
        developer_msg: "selected_dates must contain valid dates in YYYY-MM-DD or ISO format",
      });
    }

    let fullTextSearchConditionForInquiry = {};
    if (globalSearch) {
      const cartColumns = Object.keys(inquiryModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = inquiryModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const like = `%${globalSearch}%`;
      const orConditions = cartColumns.map(col => ({
        [col]: { [Op.like]: like }
      }));

      fullTextSearchConditionForInquiry = { [Op.or]: orConditions };
    }

    let fullTextSearchConditionForContact = {};
    if (globalSearch) {
      const cartColumns = Object.keys(contactModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = contactModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const like = `%${globalSearch}%`;
      const orConditions = cartColumns.map(col => ({
        [col]: { [Op.like]: like }
      }));

      fullTextSearchConditionForContact = { [Op.or]: orConditions };
    }

    let fullTextSearchConditionForProduct = {};
    if (globalSearch) {
      const cartColumns = Object.keys(productModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = productModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const like = `%${globalSearch}%`;
      const orConditions = cartColumns.map(col => ({
        [col]: { [Op.like]: like }
      }));

      fullTextSearchConditionForProduct = { [Op.or]: orConditions };
    }

    let fullTextSearchConditionForCategory = {};
    if (globalSearch) {
      const cartColumns = Object.keys(categoryModel(req.tenantDB).rawAttributes)
        .filter(col => {
          const attr = categoryModel(req.tenantDB).rawAttributes[col];
          return ['STRING', 'TEXT', 'CHAR', 'VARCHAR'].includes(attr.type.key);
        });

      const like = `%${globalSearch}%`;
      const orConditions = cartColumns.map(col => ({
        [col]: { [Op.like]: like }
      }));

      fullTextSearchConditionForCategory = { [Op.or]: orConditions };
    }


    const start = new Date(selected_dates[0]);
    start.setHours(0, 0, 0, 0);

    const end = new Date(selected_dates[1]);
    end.setHours(23, 59, 59, 999);

    let whereClause = {}

    if (Array.isArray(selectedLabels) && selectedLabels.length > 0) {
      const validLabels = selectedLabels
        .map(label => {
          const num = parseInt(label, 10);
          return isNaN(num) ? null : num;
        })
        .filter(label => label !== null);

      if (validLabels.length === 0) {
        return resError({
          ack_msg: "Invalid Input",
          developer_msg: "selectedLabels contains no valid numeric values",
        });
      }
      const findInSetConditions = validLabels
        .map(label => `FIND_IN_SET(${label}, label_id)`)
        .join(" AND ");

      const andConditions = [...(whereClause[Op.and] || [])];
      andConditions.push(Sequelize.literal(`(${findInSetConditions})`));
      whereClause[Op.and] = andConditions;
    }

    if (Array.isArray(selectedStageStatus) && selectedStageStatus.length > 0) {
      const validStageStatus = selectedStageStatus
        .map(status => parseInt(status, 10))
        .filter(status => !isNaN(status));

      if (validStageStatus.length == 0) {
        return resError({
          ack_msg: "Invalid Input",
          developer_msg: "selectedStageStatus must contain exactly one valid number",
        });
      }

      const findInSetConditions = validStageStatus
        .map(label => `FIND_IN_SET(${label}, contact_status)`)
        .join(" AND ");

      const andConditions = [...(whereClause[Op.and] || [])];
      andConditions.push(Sequelize.literal(`(${findInSetConditions})`));
      whereClause[Op.and] = andConditions;

      // whereClause.contact_status = { [Op.eq]: validStageStatus[0] };
    }

    if (Array.isArray(selectedSourceTypes) && selectedSourceTypes.length > 0) {
      const validSourceTypes = selectedSourceTypes
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));

      if (validSourceTypes.length === 0) {
        return resError({
          ack_msg: "Invalid Input",
          developer_msg: "selectedSourceTypes contains no valid IDs",
        });
      }

      whereClause.source_type_id = { [Op.in]: validSourceTypes };
    }

    if (selectedTeamMembers?.length > 0) {
      whereClause[Op.and] = whereClause[Op.and] || [];

      whereClause[Op.and].push({
        [Op.or]: [
          {
            a_application_login_id: {
              [Op.in]: selectedTeamMembers,
            },
          },
          ...selectedTeamMembers.map((memberId) =>
            Sequelize.where(
              Sequelize.fn(
                "FIND_IN_SET",
                memberId,
                Sequelize.col("inquiry_assigned_team_member")
              ),
              {
                [Op.gt]: 0,
              }
            )
          ),
        ],
      });
    }


    const a_application_id_rights = req.body.a_application_login_id;
    const { showAllData, showPersonalData } = await getUserRights({
      company_masters_id: findCompanyId.company_masters_id,
      a_application_login_id: a_application_id_rights,
      page_id: PAGE_ID.ALLINQUIRY_REPORT,
      tenentId: req.tenantDB
    });
    if (showAllData) {
      whereClause = {
        ...whereClause,
        company_masters_id: findCompanyId.company_masters_id,
      };
    }
    else if (showPersonalData) {
      whereClause[Op.and] = whereClause[Op.and] || [];

      whereClause[Op.and].push({
        [Op.or]: [
          {
            a_application_login_id:
              req.body.a_application_login_id,
          },
          Sequelize.where(
            Sequelize.fn(
              "FIND_IN_SET",
              req.body.a_application_login_id,
              Sequelize.col("inquiry_assigned_team_member")
            ),
            {
              [Op.gt]: 0,
            }
          ),
        ],
      });
    }

    let whereForContact = {}

    if (Array.isArray(selectedDemography)) {

      if (selectedDemography[0] != null && selectedDemography[0] !== '') {
        const countryId = parseInt(selectedDemography[0], 10);
        if (!isNaN(countryId)) whereForContact["country"] = countryId;
      }

      if (selectedDemography[1] != null && selectedDemography[1] !== '') {
        const stateId = parseInt(selectedDemography[1], 10);
        if (!isNaN(stateId)) whereForContact["state"] = stateId;
      }

      if (selectedDemography[2] != null && selectedDemography[2] !== '') {
        const cityId = parseInt(selectedDemography[2], 10);
        if (!isNaN(cityId)) whereForContact["city"] = cityId;
      }

      if (selectedDemography[3] != null && selectedDemography[3] !== '') {
        const areaId = parseInt(selectedDemography[3], 10);
        if (!isNaN(areaId)) whereForContact["area"] = areaId;
      }
    }

    const whereForProduct = {}
    const whereForcategory = {}
    if (selectedProduct) {

      whereClause[Op.and] = [
        Sequelize.literal(`FIND_IN_SET('${selectedProduct}',product_id)`)
      ];
    }
    if (selectedCategory) {

      whereClause[Op.and] = [
        Sequelize.literal(`FIND_IN_SET('${selectedCategory}',category_id)`)
      ];
    }
    if (selectedContactId && referenceWiseContact == 1) {

      whereClause.contact_master_id = selectedContactId;

    } else if (selectedContactId && referenceWiseContact == 2) {

      const Contact = contactModel(req.tenantDB);

      const findreffrancewiseContact = await Contact.findAll({
        where: {
          referance_contact: selectedContactId,
          isDelete: 0,
        },
        attributes: ["id"],
        raw: true,
      });

      const contactIds = findreffrancewiseContact.map(
        (item) => item.id
      );

      whereClause.contact_master_id = {
        [Op.in]: contactIds,
      };
    }


    const inquiryModels = await inquiryModel(req.tenantDB);

    console.log("-----Inquiry queiry get-----")
    const inquires = await inquiryModels.findAll({
      where: {
        ...fullTextSearchConditionForInquiry,
        ...whereClause,
        isDelete: 0,
        [Op.and]: [
          ...(whereClause[Op.and] || []),
          Sequelize.literal(`DATE(create_date_time) >= '${startDate}'`),
          Sequelize.literal(`DATE(create_date_time) <= '${endDate}'`),
        ],
      },
      offset,
      limit
    });

    const contactModels = await contactModel(req.tenantDB);
    const contacts = await contactModels.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        ...whereForContact,
        ...fullTextSearchConditionForContact,

      },
      attributes: ["id", "person_name", "mobile_number", "company_name"],
    });

    const categoryModels = await categoryModel(req.tenantDB);
    const categories = await categoryModels.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        // ...fullTextSearchConditionForCategory,

        // ...whereForcategory,
      },
      attributes: ["id", "category_name"],
    });

    const productModels = await productModel(req.tenantDB);
    const products = await productModels.findAll({
      where: {
        company_masters_id: findCompanyId.company_masters_id,
        isDelete: 0,
        // ...fullTextSearchConditionForProduct,

        // ...whereForProduct,
      },
      attributes: ["id", "product_name"],
    });

    const sourceModels = await sourceTypesModel(req.tenantDB);
    const sources = await sourceModels.findAll({
      where: {
        isDelete: 0,
      },
      attributes: ["id", "source_name", "color"],
    });

    const statusModels = await stagestatusModel(req.tenantDB);
    const status = await statusModels.findAll({
      where: {
        isDelete: 0,
      },
      attributes: ["id", "name", "color"],
    });

    const labelModels = await labelModel(req.tenantDB);
    const labels = await labelModels.findAll({
      where: {
        isDelete: 0,
      },
      attributes: ["id", "lable_name", "color"],
    });

    const loginUsers = await loginModel.findAll({
      where: {
        isDelete: 0,
      },
      attributes: ["id", "username"],
    });

    const getCustomFormFeild = customFieldFormModel(req.tenantDB);

    const CustomFormFeilds = await getCustomFormFeild.findAll({
      where: {
        form_type: 2,
        isDelete: 0,
        report_print_or_not: 1,
        data_type: { [Op.ne]: 11 },
        data_type: { [Op.ne]: 12 },
      },
    });

    const result = inquires.map((inquiry) => {
      const matchedContact = contacts.find(
        (contact) => contact.id === inquiry.contact_master_id
      );
      const matchedCategory = categories.find(
        (categories) => categories.id === inquiry.category_id
      );
      const matchedProduct = products.find(
        (products) => products.id === inquiry.product_id
      );
      const matchedSource = sources.find(
        (sources) => sources.id === inquiry.source_type_id
      );
      const matchedStatus = status.find(
        (status) => status.id === inquiry.contact_status
      );
      const labelIds = inquiry.label_id
        ? inquiry.label_id.split(',').map(id => id.trim()).filter(id => id && !isNaN(id))
        : [];
      const matchedLabels = labels.filter(label =>
        labelIds.includes(label.id.toString())
      );
      // const matchedCreatedBy = loginUsers.find(
      //   (user) => user.id === inquiry.a_application_login_id
      // );
      const activeTeamMap = new Map(
        loginUsers.map((user) => [
          Number(user.id),
          user.username,
        ])
      );

      const created_by_name =
        activeTeamMap.get(Number(inquiry.a_application_login_id)) || "";

      let assignedNameList = [];
      let firstAssignedName = "";

      if (
        inquiry.inquiry_assigned_team_member &&
        inquiry.inquiry_assigned_team_member.trim() !== ""
      ) {
        const assignedIds = inquiry.inquiry_assigned_team_member
          .split(",")
          .map((id) => Number(id.trim()))
          .filter(Boolean);

        assignedNameList = assignedIds
          .map((id) => activeTeamMap.get(id))
          .filter(Boolean);

        firstAssignedName =
          assignedNameList.length > 0
            ? assignedNameList[0]
            : "";
      }

      // const createORassignName =
      //   firstAssignedName
      //     ? `Assign to: ${firstAssignedName}`
      //     : `Created by: ${created_by_name}`;

      const assined_team_person =
        assignedNameList.length > 0
          ? `Assign to: ${assignedNameList.join(", ")}`
          : "";

      return {
        ...inquiry.dataValues,
        customForm: CustomFormFeilds,
        inquiry_id: `#${inquiry.id}`,
        category_name: matchedCategory ? matchedCategory.category_name : "-",
        product_id: matchedProduct ? matchedProduct.product_name : "-",
        source_type_id: matchedSource ? matchedSource.source_name : "-",
        source_colour: matchedSource ? matchedSource.color : "-",
        status_name: matchedStatus ? matchedStatus.name : "-",
        status_colour: matchedStatus ? matchedStatus.color : "-",
        label_name: matchedLabels.map(l => ({
          name: l.lable_name,
          color: l.color,

        })),

        // label_colour: matchedLabel ? matchedLabel.color : "-",
        qty: inquiry.qty,
        description: inquiry.description,
        person_name: matchedContact
          ? `${matchedContact.company_name} (${matchedContact.person_name})`
          : null,

        mobile_number: matchedContact ? matchedContact.mobile_number : null,
        created_by_name,
        assined_team_person
      };
    });

    return resSuccess({
      data: { items: result },
      ack_msg: "Inquiry Data with Contact Details Found Successfully",
      developer_msg: "Success",
    });
  } catch (e) {
    return resError({
      ack_msg: "Error Found Please Try Again",
      developer_msg: `${e}`,
    });
  }
};
