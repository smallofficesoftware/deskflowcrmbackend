export const statusLogsMessageConfig = {
    contact_masters: {
        title: "The customer",
        modelPath: "activities/contactModel",
        model: "contactModel",
        fields: ["person_name", "company_name", "mobile_number"],
        formatEntity: (record) =>
            `${record.person_name || ""} (${record.mobile_number || ""}) ${(" from " + record.company_name || "")}`,
    },
    inquiries: {
        title: "Inquiry",
        modelPath: "activities/inquiryModel",
        model: "inquiryModel",
        fields: false,
        formatEntity: (record) =>
            `#${record.reference_id || ""}`,
    },
    carts: {
        title: {
            1: "Quotation",
            2: "Sales Order",
            3: "Sales Invoice",
            4: "Purchase Invoice",
            5: "Purchase Order",
            6: "Return Sales Invoice",
            7: "Return Purchase Invoice",
            8: "Inward",
            9: "Dispatch"
        },
        modelPath: "activities/cartsModel",
        model: "cartModel",
        fields: ["cart_number"],
        formatEntity: (record) =>
            `${record.cart_number || ""}`,
    },
    task_managements: {
        title: "Task",
        modelPath: "activities/taskManagementModel",
        model: "taskManagementModel",
        fields: false,
        formatEntity: (record) =>
            `#${record.reference_id || ""}`,
    },
};
