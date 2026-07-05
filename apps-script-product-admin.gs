const PRODUCT_SHEET_ID = "1-_Tv649zg_o9ABnKAE7_xbFYIAdxJILD5S1JjHMlE90";
const PRODUCT_SHEET_NAME = "MUWA後台";
const LEGACY_PRODUCT_SHEET_NAME = "MUWA 商品資料表";
const ORDER_SHEET_NAME = "MUWA 訂單資料表";
const WISHLIST_SHEET_NAME = "MUWA 商品許願池收件表";
const PRODUCT_IMAGE_FOLDER_NAME = "MUWA 商品圖片";
const WISHLIST_IMAGE_FOLDER_NAME = "MUWA 許願池圖片";
const ADMIN_USER = "muwa.to.sales";
const ADMIN_KEY = "cindy31127";

function doGet(e) {
  const action = e.parameter.action || "admin";
  if (action === "products") {
    return outputProducts_(e);
  }
  if (action === "createOrder") {
    return outputOrderResult_(e);
  }

  return HtmlService
    .createTemplateFromFile("product-admin")
    .evaluate()
    .setTitle("MUWA 商品管理後台")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const action = e.parameter.action || "";
  const token = e.parameter.token || "";

  if (action === "createOrder") {
    try {
      const payload = JSON.parse(e.parameter.payload || "{}");
      const result = createOrder_(payload);
      return outputPostMessage_(Object.assign({ ok: true, token }, result));
    } catch (error) {
      return outputPostMessage_({
        ok: false,
        token,
        message: error && error.message ? error.message : "訂單建立失敗，請稍後再試。",
      });
    }
  }

  if (action === "wishlist") {
    try {
      const result = createWishlist_(e.parameter);
      return outputPostMessage_(Object.assign({ ok: true, token }, result));
    } catch (error) {
      return outputPostMessage_({
        ok: false,
        token,
        message: error && error.message ? error.message : "許願送出失敗，請稍後再試。",
      });
    }
  }

  return outputPostMessage_({ ok: false, token, message: "未知的送出動作。" });
}

function outputOrderResult_(e) {
  const token = e.parameter.token || "";
  const callback = e.parameter.callback || "";

  try {
    const payload = JSON.parse(e.parameter.payload || "{}");
    const result = createOrder_(payload);
    return outputCallback_(callback, Object.assign({ ok: true, token }, result));
  } catch (error) {
    return outputCallback_(callback, {
      ok: false,
      token,
      message: error && error.message ? error.message : "訂單建立失敗，請稍後再試。",
    });
  }
}

function getProducts() {
  return readProducts_();
}

function setupWorkbook() {
  getProductSheet_();
  getOrderSheet_();
  getWishlistSheet_();
  return { ok: true };
}

function saveProduct(payload) {
  assertAdmin_(payload.adminUser, payload.adminKey);

  const sheet = getProductSheet_();
  const now = new Date();
  const id = payload.id || `MUWA-${Date.now()}`;
  const imageUrls = saveProductImages_(payload, id);
  const rowValues = [
    id,
    payload.status || "草稿",
    payload.name || "",
    payload.category || "全部",
    normalizePrice_(payload.price),
    payload.description || "",
    imageUrls.join(" || "),
    payload.link || "",
    Number(payload.sort || 999),
    payload.createdAt || now,
    now,
    payload.detailDescription || "",
    payload.shippingInfo || "",
    payload.reviewInfo || "",
    payload.imagePosition || "50% 50%",
    payload.imageScale || "1",
    payload.purchaseOptions || "",
  ];

  const existingRow = findProductRow_(sheet, id);
  if (existingRow) {
    sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
    return { ok: true, id, imageUrls, updated: true };
  }

  sheet.appendRow(rowValues);

  return { ok: true, id, imageUrls };
}

function deleteProduct(id, adminKey) {
  assertAdmin_(ADMIN_USER, adminKey);

  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getValues();
  for (let row = values.length - 1; row >= 1; row -= 1) {
    if (String(values[row][0]) === String(id)) {
      sheet.deleteRow(row + 1);
      return { ok: true };
    }
  }
  return { ok: false, message: "找不到商品" };
}

function outputProducts_(e) {
  const products = readProducts_().filter((item) => item.status === "上架");
  const callback = e.parameter.callback;
  const body = JSON.stringify({ products });

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${body});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function readProducts_() {
  const sheet = getProductSheet_();
  const values = sheet.getDataRange().getValues();
  const rows = values.slice(1);

  return rows
    .filter((row) => row[0] || row[2])
    .map((row) => ({
      id: String(row[0] || ""),
      status: String(row[1] || ""),
      name: String(row[2] || ""),
      category: String(row[3] || "全部"),
      price: normalizePrice_(row[4]),
      description: String(row[5] || ""),
      image: normalizeImageUrl_(String(row[6] || "").split(" || ")[0] || ""),
      images: String(row[6] || "")
        .split(" || ")
        .map((url) => normalizeImageUrl_(url))
        .filter(Boolean),
      link: String(row[7] || ""),
      sort: Number(row[8] || 999),
      detailDescription: String(row[11] || ""),
      shippingInfo: String(row[12] || ""),
      reviewInfo: String(row[13] || ""),
      imagePosition: String(row[14] || "50% 50%"),
      imageScale: String(row[15] || "1"),
      purchaseOptions: String(row[16] || ""),
    }))
    .sort((a, b) => a.sort - b.sort);
}

function createOrder_(payload) {
  const sheet = getOrderSheet_();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const customerName = String(payload.customerName || "").trim();
  const customerPhone = String(payload.customerPhone || "").trim();
  const customerEmail = String(payload.customerEmail || "").trim();
  const shippingMethod = String(payload.shippingMethod || "").trim();
  const transferLast5 = String(payload.transferLast5 || "").trim();

  if (!customerName || !customerPhone || !customerEmail) {
    throw new Error("請完整填寫姓名、手機與電子信箱。");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
    throw new Error("電子信箱格式不正確。");
  }
  if (!/^\d{5}$/.test(transferLast5)) {
    throw new Error("轉帳帳戶末 5 碼需為 5 位數字。");
  }
  if (!items.length) {
    throw new Error("訂單沒有商品，請先加入商品。");
  }

  const isHome = shippingMethod === "home";
  const homeAddress = String(payload.homeAddress || "").trim();
  const storeChain = String(payload.storeChain || "").trim();
  const storeName = String(payload.storeName || "").trim();
  const storeCode = String(payload.storeCode || "").trim();

  if (isHome && !homeAddress) {
    throw new Error("請填寫宅配地址。");
  }
  if (!isHome && (!storeChain || !storeName || !storeCode)) {
    throw new Error("請完整填寫店到店門市資訊。");
  }

  const normalizedItems = items.map((item) => ({
    productName: String(item.productName || "").trim(),
    optionName: String(item.optionName || "").trim(),
    price: Number(item.price || 0),
    qty: Number(item.qty || 0),
    subtotal: Number(item.subtotal || 0),
  })).filter((item) => item.productName && item.optionName && item.price > 0 && item.qty > 0);

  if (!normalizedItems.length) {
    throw new Error("訂單沒有有效商品，請重新確認購物車。");
  }

  const itemSubtotal = normalizedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shippingFee = Number(payload.shippingFee || 0);
  const total = itemSubtotal + shippingFee;
  const orderId = generateOrderId_(sheet);
  const itemsText = normalizedItems
    .map((item) => `${item.productName}｜${item.optionName} x ${item.qty}，小計 NT$${item.price * item.qty}`)
    .join("\n");

  sheet.appendRow([
    new Date(),
    orderId,
    "待對帳",
    customerName,
    customerPhone,
    customerEmail,
    isHome ? "宅配" : `${storeChain} 店到店`,
    shippingFee,
    homeAddress,
    storeChain,
    storeName,
    storeCode,
    transferLast5,
    itemsText,
    itemSubtotal,
    total,
    "",
    "",
  ]);

  return { orderId, total, shippingFee, itemSubtotal };
}

function createWishlist_(payload) {
  const sheet = getWishlistSheet_();
  const wishTitle = String(payload.wishTitle || "").trim();
  const wishDetail = String(payload.wishDetail || "").trim();
  const imageName = String(payload.imageName || "").trim();
  const imageData = String(payload.imageData || "").trim();

  if (!wishTitle && !wishDetail) {
    throw new Error("請填寫想許願的商品或情境。");
  }

  const imageUrl = imageData ? saveWishlistImage_(imageData, imageName || `muwa-wish-${Date.now()}.png`) : "";

  sheet.appendRow([
    new Date(),
    wishTitle,
    wishDetail,
    imageName,
    imageUrl,
    "新許願",
    "",
  ]);

  return { imageUrl };
}

function generateOrderId_(sheet) {
  const values = sheet.getDataRange().getValues();
  const used = {};
  values.slice(1).forEach((row) => {
    if (row[1]) used[String(row[1])] = true;
  });

  for (let i = 0; i < 200; i += 1) {
    const code = `OR${Math.floor(Math.random() * 100000).toString().padStart(5, "0")}`;
    if (!used[code]) return code;
  }

  throw new Error("訂單編號產生失敗，請重新送出一次。");
}

function markOrderPaid(orderId, adminKey) {
  assertAdmin_(ADMIN_USER, adminKey);

  const sheet = getOrderSheet_();
  const values = sheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row += 1) {
    if (String(values[row][1]) === String(orderId)) {
      sheet.getRange(row + 1, 3).setValue("對帳成功");
      sheet.getRange(row + 1, 19).setValue(new Date());
      sheet.getRange(row + 1, 20).setValue("已寄送");
      sendPaidEmail_(values[row]);
      return { ok: true };
    }
  }

  throw new Error("找不到訂單。");
}

function sendPaidOrderEmails() {
  const sheet = getOrderSheet_();
  const values = sheet.getDataRange().getValues();
  let sent = 0;

  for (let row = 1; row < values.length; row += 1) {
    const status = String(values[row][2] || "").trim();
    const notificationStatus = String(values[row][19] || "").trim();
    if (status !== "對帳成功" || notificationStatus === "已寄送") continue;

    sendPaidEmail_(values[row]);
    if (!values[row][18]) sheet.getRange(row + 1, 19).setValue(new Date());
    sheet.getRange(row + 1, 20).setValue("已寄送");
    sent += 1;
  }

  return { ok: true, sent };
}

function sendPaidEmail_(row) {
  const orderId = String(row[1] || "");
  const name = String(row[3] || "");
  const email = String(row[5] || "");
  const total = Number(row[17] || 0);
  if (!email) return;

  GmailApp.sendEmail(
    email,
    `MUWA 訂單 ${orderId} 對帳成功`,
    `${name} 您好：\n\nMUWA 已確認收到訂單 ${orderId} 的款項。\n訂單金額：NT$${total.toLocaleString("zh-TW")}\n\n接下來我們會依照訂單資訊安排出貨，謝謝你讓 MUWA 參與你的日常。\n\nMUWA`,
    { name: "MUWA" }
  );
}

function saveProductImages_(payload, id) {
  const existingImages = Array.isArray(payload.existingImages)
    ? payload.existingImages.map((url) => normalizeImageUrl_(url)).filter(Boolean)
    : [];
  const imagesData = Array.isArray(payload.imagesData)
    ? payload.imagesData
    : payload.imageData
      ? [payload.imageData]
      : [];
  const imageNames = Array.isArray(payload.imageNames) ? payload.imageNames : [];

  if (!imagesData.length) {
    if (existingImages.length) return existingImages;
    return payload.imageUrl ? [normalizeImageUrl_(payload.imageUrl)] : [];
  }

  const newImages = imagesData
    .map((imageData, index) => saveImage_(imageData, imageNames[index] || `${id}-${index + 1}.png`))
    .filter(Boolean);

  return existingImages.concat(newImages);
}

function saveImage_(dataUrl, fileName) {
  const folder = getImageFolder_();
  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) return "";

  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1600`;
}

function getImageFolder_() {
  const folders = DriveApp.getFoldersByName(PRODUCT_IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(PRODUCT_IMAGE_FOLDER_NAME);
}

function saveWishlistImage_(dataUrl, fileName) {
  const folder = getWishlistImageFolder_();
  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) return "";

  const mimeType = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const safeName = `${Date.now()}-${String(fileName || "muwa-wish.png").replace(/[\\/:*?"<>|]/g, "-")}`;
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return file.getUrl();
}

function getWishlistImageFolder_() {
  const folders = DriveApp.getFoldersByName(WISHLIST_IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(WISHLIST_IMAGE_FOLDER_NAME);
}

function getProductSheet_() {
  const spreadsheet = SpreadsheetApp.openById(PRODUCT_SHEET_ID);
  let sheet = spreadsheet.getSheetByName(PRODUCT_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.getSheetByName(LEGACY_PRODUCT_SHEET_NAME);
    if (sheet) sheet.setName(PRODUCT_SHEET_NAME);
  }
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PRODUCT_SHEET_NAME);
    sheet.appendRow(getProductHeaders_());
  }
  return sheet;
}

function getOrderSheet_() {
  const spreadsheet = SpreadsheetApp.openById(PRODUCT_SHEET_ID);
  let sheet = spreadsheet.getSheetByName(ORDER_SHEET_NAME);
  if (sheet) {
    removeColumnsByHeaders_(sheet, ["門市地址", "訂單 JSON"]);
    return sheet;
  }

  sheet = spreadsheet.insertSheet(ORDER_SHEET_NAME);
  sheet.appendRow(getOrderHeaders_());
  return sheet;
}

function getWishlistSheet_() {
  const spreadsheet = SpreadsheetApp.openById(PRODUCT_SHEET_ID);
  let sheet = spreadsheet.getSheetByName(WISHLIST_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(WISHLIST_SHEET_NAME);
    sheet.appendRow(getWishlistHeaders_());
  }
  removeColumnsByHeaders_(sheet, ["使用者裝置資訊", "頁面來源"]);
  return sheet;
}

function getProductHeaders_() {
  return [
    "ID",
    "狀態",
    "商品名稱",
    "分類",
    "價格",
    "短描述",
    "圖片",
    "購買連結",
    "排序",
    "建立時間",
    "更新時間",
    "商品描述",
    "送貨及付款方式",
    "顧客評價",
    "圖片位置",
    "圖片縮放",
    "購買品項",
  ];
}

function getOrderHeaders_() {
  return [
    "建立時間",
    "訂單編號",
    "狀態",
    "姓名",
    "手機",
    "電子信箱",
    "運送方式",
    "運費",
    "宅配地址",
    "超商",
    "門市名稱",
    "門市店號",
    "轉帳帳戶末5碼",
    "訂單內容",
    "商品小計",
    "應付總額",
    "對帳時間",
    "通知狀態",
  ];
}

function getWishlistHeaders_() {
  return [
    "建立時間",
    "許願商品或情境",
    "想法內容",
    "圖片檔名",
    "圖片連結",
    "狀態",
    "備註",
  ];
}

function removeColumnsByHeaders_(sheet, headersToRemove) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (let index = headers.length - 1; index >= 0; index -= 1) {
    if (headersToRemove.indexOf(String(headers[index])) >= 0) {
      sheet.deleteColumn(index + 1);
    }
  }
}

function findProductRow_(sheet, id) {
  const values = sheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row += 1) {
    if (String(values[row][0]) === String(id)) return row + 1;
  }
  return 0;
}

function normalizePrice_(price) {
  const value = String(price || "").trim();
  if (!value) return "";
  if (value.indexOf("NT$") === 0) return value;
  return `NT$ ${value}`;
}

function normalizeImageUrl_(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  const ucMatch = value.match(/[?&]id=([^&]+)/);
  if (ucMatch) {
    return `https://drive.google.com/thumbnail?id=${ucMatch[1]}&sz=w1600`;
  }

  const fileMatch = value.match(/\/d\/([^/]+)/);
  if (fileMatch) {
    return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1600`;
  }

  return value;
}

function assertAdmin_(adminUser, adminKey) {
  if (String(adminUser || "") !== ADMIN_USER || String(adminKey || "") !== ADMIN_KEY) {
    throw new Error("管理帳號或密碼錯誤。");
  }
}

function outputPostMessage_(payload) {
  const body = JSON.stringify(Object.assign({ source: "muwa-order" }, payload))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return HtmlService
    .createHtmlOutput(`<script>parent.postMessage(${body}, "*");</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function outputCallback_(callback, payload) {
  const body = JSON.stringify(Object.assign({ source: "muwa-order" }, payload))
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${body});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}
