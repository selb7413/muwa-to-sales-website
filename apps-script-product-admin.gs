const PRODUCT_SHEET_ID = "1-_Tv649zg_o9ABnKAE7_xbFYIAdxJILD5S1JjHMlE90";
const PRODUCT_SHEET_NAME = "MUWA 商品資料表";
const PRODUCT_IMAGE_FOLDER_NAME = "MUWA 商品圖片";
const ADMIN_USER = "muwa.to.sales";
const ADMIN_KEY = "cindy31127";

function doGet(e) {
  const action = e.parameter.action || "admin";
  if (action === "products") {
    return outputProducts_(e);
  }

  return HtmlService
    .createTemplateFromFile("product-admin")
    .evaluate()
    .setTitle("MUWA 商品管理後台")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getProducts() {
  return readProducts_();
}

function saveProduct(payload) {
  assertAdmin_(payload.adminUser, payload.adminKey);

  const sheet = getProductSheet_();
  const now = new Date();
  const id = payload.id || `MUWA-${Date.now()}`;
  const imageUrls = saveProductImages_(payload, id);
  const rowValues = [
    id,
    payload.status || "上架",
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

function getProductSheet_() {
  return SpreadsheetApp.openById(PRODUCT_SHEET_ID).getSheetByName(PRODUCT_SHEET_NAME);
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
