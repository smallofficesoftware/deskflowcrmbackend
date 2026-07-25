import { createOrderByOnlineStore, getAllPriceLists, getProductCategory, getProducts } from "../../controllers/online-store/onlineStoreController.js";

export default (app) => {
    app.post("/create-order-by-online-store/:qrcode", createOrderByOnlineStore);
    app.post('/get-all-product-categories/:qrCode', getProductCategory);
    app.post('/get-all-products/:qrCode', getProducts);
    app.post('/get-all-pricelists/:qrCode', getAllPriceLists);
};
