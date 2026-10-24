const PRODUCT_SHEET_ID = "1-_Tv649zg_o9ABnKAE7_xbFYIAdxJILD5S1JjHMlE90";
const PRODUCT_SHEET_NAME = "MUWA後台";
const LEGACY_PRODUCT_SHEET_NAME = "MUWA 商品資料表";
const ORDER_SHEET_NAME = "MUWA 訂單資料表";
const WISHLIST_SHEET_NAME = "MUWA 商品許願池收件表";
const WISH_SHOWCASE_SHEET_NAME = "MUWA 許願成功作品";
const SHIPPING_SETTINGS_SHEET_NAME = "MUWA 配送設定";
const SHIPPING_SETTINGS_PROPERTY_KEY = "MUWA_SHIPPING_SETTINGS_V1";
const PRODUCT_IMAGE_FOLDER_NAME = "MUWA 商品圖片";
const WISHLIST_IMAGE_FOLDER_NAME = "MUWA 許願池圖片";
const WISH_SHOWCASE_IMAGE_FOLDER_NAME = "MUWA 許願成功作品圖片";
const ADMIN_USER = "muwa.to.sales";
const ADMIN_KEY = "cindy31127";
const ADMIN_NOTIFICATION_EMAILS = ["selb7413@gmail.com", "c83177@gmail.com"];
const MUWA_SENDER_EMAIL = "muwa.to.sales@gmail.com";
const ORDER_NOTIFICATION_OPTIONS = ["已取消", "已付款", "已寄送"];
const ORDER_STATUS_OPTIONS = ["待對帳", "對帳成功", "已出貨", "取消"];
const DEFAULT_SHIPPING_SETTINGS = [
  { id: "home", label: "宅配", type: "home", chain: "", enabled: true, fee: 140, sort: 1 },
  { id: "7-11", label: "7-11 店到店", type: "store", chain: "7-11", enabled: true, fee: 0, sort: 2 },
  { id: "family", label: "全家店到店", type: "store", chain: "全家", enabled: true, fee: 60, sort: 3 },
  { id: "hilife", label: "萊爾富店到店", type: "store", chain: "萊爾富", enabled: true, fee: 60, sort: 4 },
];

function doGet(e) {
  const action = e.parameter.action || "admin";
  if (action === "serviceStatus") return outputServiceStatus_(e);
  if (action === "products") {
    return outputProducts_(e);
  }
  if (action === "wishShowcase") {
    return outputWishShowcase_(e);
  }
  if (action === "shippingSettings") {
    return outputShippingSettings_(e);
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

function getWishShowcases() {
  return readWishShowcases_();
}

function getShippingSettings() {
  return readShippingSettings_();
}

function setupWorkbook() {
  getProductSheet_();
  getOrderSheet_();
  getWishlistSheet_();
  getWishShowcaseSheet_();
  readShippingSettings_();
  removeLegacyShippingSettingsSheet_();
  return { ok: true };
}

function saveShippingSettings(payload) {
  assertAdmin_(payload.adminUser, payload.adminKey);

  const normalized = normalizeShippingSettings_(payload.settings, true);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    PropertiesService.getScriptProperties().setProperty(
      SHIPPING_SETTINGS_PROPERTY_KEY,
      JSON.stringify(normalized)
    );
    removeLegacyShippingSettingsSheet_();

    const savedSettings = readShippingSettings_();
    normalized.forEach((expected) => {
      const saved = savedSettings.find((item) => item.id === expected.id);
      if (!saved || Number(saved.fee) !== Number(expected.fee) || Boolean(saved.enabled) !== Boolean(expected.enabled)) {
        throw new Error(`${expected.label}儲存核對失敗，請再試一次。`);
      }
    });
    return { ok: true, settings: savedSettings, message: "配送設定已儲存並完成核對。" };
  } finally {
    lock.releaseLock();
  }
}

function setupOrderStatusDropdown() {
  applyOrderStatusDropdown_(getOrderSheet_());
  return { ok: true, message: "訂單狀態下拉選單已套用。" };
}

function normalizeProductStatus_(status) {
  if (status === "上架" || !status) return "現貨";
  if (["現貨", "補貨中", "售完"].includes(status)) return status;
  throw new Error("商品狀態請選擇補貨中、售完或現貨。");
}

function saveProduct(payload) {
  assertAdmin_(payload.adminUser, payload.adminKey);

  const sheet = getProductSheet_();
  const now = new Date();
  const id = payload.id || `MUWA-${Date.now()}`;
  const imageUrls = saveProductImages_(payload, id);
  const rowValues = [
    id,
    normalizeProductStatus_(payload.status),
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

function saveWishShowcase(payload) {
  assertAdmin_(payload.adminUser, payload.adminKey);

  const title = String(payload.title || "").trim();
  const story = String(payload.story || "").trim();
  if (!title || !story) {
    throw new Error("請填寫作品名稱與作品故事。");
  }

  const sheet = getWishShowcaseSheet_();
  const now = new Date();
  const id = String(payload.id || `WISH-${Date.now()}`);
  const existingImage = normalizeImageUrl_(payload.existingImage || "");
  const imageUrl = payload.imageData
    ? saveWishShowcaseImage_(payload.imageData, payload.imageName || `${id}.png`)
    : existingImage;
  if (!imageUrl) {
    throw new Error("請上傳作品圖片。");
  }

  const existingRow = findWishShowcaseRow_(sheet, id);
  const existingCreatedAt = existingRow
    ? sheet.getRange(existingRow, 7).getValue()
    : "";
  const rowValues = [
    id,
    payload.status === "發布" ? "發布" : "草稿",
    title,
    story,
    imageUrl,
    Number(payload.sort || 999),
    existingCreatedAt || payload.createdAt || now,
    now,
  ];
  if (existingRow) {
    sheet.getRange(existingRow, 1, 1, rowValues.length).setValues([rowValues]);
    return {
      ok: true,
      id,
      imageUrl,
      createdAt: serializeSheetDate_(rowValues[6]),
      updated: true,
    };
  }

  sheet.appendRow(rowValues);
  return {
    ok: true,
    id,
    imageUrl,
    createdAt: serializeSheetDate_(rowValues[6]),
  };
}

function deleteWishShowcase(id, adminKey) {
  assertAdmin_(ADMIN_USER, adminKey);

  const sheet = getWishShowcaseSheet_();
  const row = findWishShowcaseRow_(sheet, id);
  if (!row) return { ok: false, message: "找不到作品" };
  sheet.deleteRow(row);
  return { ok: true };
}

function outputProducts_(e) {
  const products = readProducts_()
    .filter((item) => ["上架", "現貨", "補貨中", "售完"].includes(item.status))
    .map((item) => Object.assign({}, item, { status: normalizeProductStatus_(item.status) }));
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

function outputWishShowcase_(e) {
  const items = readWishShowcases_().filter((item) => item.status === "發布");
  const callback = e.parameter.callback;
  const body = JSON.stringify({ items });

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${body});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function outputShippingSettings_(e) {
  const settings = readShippingSettings_().filter((item) => item.enabled);
  const callback = e.parameter.callback;
  const body = JSON.stringify({ settings });

  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${body});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function readShippingSettings_() {
  const properties = PropertiesService.getScriptProperties();
  const storedJson = properties.getProperty(SHIPPING_SETTINGS_PROPERTY_KEY);
  if (storedJson) {
    try {
      return normalizeShippingSettings_(JSON.parse(storedJson), false);
    } catch (error) {
      console.warn(`配送設定讀取失敗，改用預設值：${error.message}`);
    }
  }

  const settings = normalizeShippingSettings_(DEFAULT_SHIPPING_SETTINGS, false);
  properties.setProperty(SHIPPING_SETTINGS_PROPERTY_KEY, JSON.stringify(settings));
  return settings;
}

function normalizeShippingSettings_(settings, requireAll) {
  const submitted = Array.isArray(settings) ? settings : [];
  const submittedMap = submitted.reduce((map, item) => {
    map[String(item && item.id || "").trim()] = item || {};
    return map;
  }, {});

  return DEFAULT_SHIPPING_SETTINGS.map((defaultItem) => {
    const hasSubmittedItem = Object.prototype.hasOwnProperty.call(submittedMap, defaultItem.id);
    if (requireAll && !hasSubmittedItem) {
      throw new Error(`${defaultItem.label}的設定不完整，請重新載入後再試。`);
    }

    const item = hasSubmittedItem ? submittedMap[defaultItem.id] : defaultItem;
    const fee = Number(item.fee);
    if (!Number.isFinite(fee) || fee < 0) {
      throw new Error(`${defaultItem.label}的運費須為 0 或正數。`);
    }
    return Object.assign({}, defaultItem, {
      enabled: item.enabled === true || String(item.enabled).toLowerCase() === "true" || String(item.enabled) === "啟用",
      fee: Math.round(fee),
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : defaultItem.sort,
    });
  }).sort((a, b) => a.sort - b.sort);
}

function removeLegacyShippingSettingsSheet_() {
  try {
    const spreadsheet = SpreadsheetApp.openById(PRODUCT_SHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHIPPING_SETTINGS_SHEET_NAME);
    if (sheet && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(sheet);
    }
  } catch (error) {
    console.warn(`舊配送設定分頁無法自動刪除，但不影響運費儲存：${error.message}`);
  }
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

function readWishShowcases_() {
  const sheet = getWishShowcaseSheet_();
  const values = sheet.getDataRange().getValues().slice(1);

  return values
    .filter((row) => row[0] || row[2])
    .map((row) => ({
      id: String(row[0] || ""),
      status: String(row[1] || "草稿"),
      title: String(row[2] || ""),
      story: String(row[3] || ""),
      image: normalizeImageUrl_(row[4] || ""),
      sort: Number(row[5] || 999),
      createdAt: serializeSheetDate_(row[6]),
      updatedAt: serializeSheetDate_(row[7]),
    }))
    .sort((a, b) => a.sort - b.sort);
}

function serializeSheetDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value);
}

function createOrder_(payload) {
  assertMuwaSender_();
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

  // Recheck availability when placing an order, including carts opened before a status change.
  const products = readProducts_();
  items.forEach((item) => {
    const product = item.productKey
      ? products.find((product) => String(product.id || product.name) === String(item.productKey))
      : products.find((product) => product.name === item.productName);
    if (product?.status === "售完") {
      throw new Error(`「${product.name}」已售完，請從購物車移除後再結帳。`);
    }
  });

  const requestedShippingId = String(payload.shippingId || "").trim();
  const homeAddress = String(payload.homeAddress || "").trim();
  const storeChain = String(payload.storeChain || "").trim();
  const storeName = String(payload.storeName || "").trim();
  const storeCode = String(payload.storeCode || "").trim();
  const legacyShippingId = shippingMethod === "home"
    ? "home"
    : ({ "7-11": "7-11", "全家": "family", "萊爾富": "hilife" }[storeChain] || "");
  const shippingSetting = readShippingSettings_().find((item) => item.id === (requestedShippingId || legacyShippingId));

  if (!shippingSetting || !shippingSetting.enabled) {
    throw new Error("所選的配送方式目前未開放，請重新選擇。");
  }
  const isHome = shippingSetting.type === "home";
  const selectedStoreChain = isHome ? "" : shippingSetting.chain;

  if (isHome && !homeAddress) {
    throw new Error("請填寫宅配地址。");
  }
  if (!isHome && (!selectedStoreChain || !storeName || !storeCode)) {
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
  const shippingFee = Number(shippingSetting.fee || 0);
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
    shippingSetting.label,
    shippingFee,
    homeAddress,
    selectedStoreChain,
    storeName,
    storeCode,
    transferLast5,
    itemsText,
    itemSubtotal,
    total,
    "",
    "",
  ]);

  notifyOrderCreated_({
    orderId,
    customerName,
    customerPhone,
    customerEmail,
    shippingMethod: shippingSetting.label,
    shippingFee,
    homeAddress,
    storeChain: selectedStoreChain,
    storeName,
    storeCode,
    transferLast5,
    itemsText,
    itemSubtotal,
    total,
  });

  return { orderId, total, shippingFee, itemSubtotal };
}

function createWishlist_(payload) {
  assertMuwaSender_();
  const sheet = getWishlistSheet_();
  const wishTitle = String(payload.wishTitle || "").trim();
  const wishDetail = String(payload.wishDetail || "").trim();
  const wishEmail = String(payload.wishEmail || "").trim();
  const imageName = String(payload.imageName || "").trim();
  const imageData = String(payload.imageData || "").trim();

  if (!wishTitle && !wishDetail) {
    throw new Error("請填寫想許願的商品或情境。");
  }
  if (!wishEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wishEmail)) {
    throw new Error("請填寫正確的聯絡信箱。");
  }

  const imageUrl = imageData ? saveWishlistImage_(imageData, imageName || `muwa-wish-${Date.now()}.png`) : "";

  sheet.appendRow([
    new Date(),
    wishTitle,
    wishDetail,
    wishEmail,
    imageName,
    imageUrl,
    "新許願",
    "",
  ]);

  notifyWishlistCreated_({
    wishTitle,
    wishDetail,
    wishEmail,
    imageName,
    imageUrl,
  });

  return { imageUrl };
}

function notifyOrderCreated_(order) {
  const subject = `MUWA 新訂單通知 ${order.orderId}`;
  const body = [
    `有一筆新訂單：${order.orderId}`,
    "",
    `姓名：${order.customerName}`,
    `手機：${order.customerPhone}`,
    `電子信箱：${order.customerEmail}`,
    `運送方式：${order.shippingMethod}`,
    `運費：NT$${Number(order.shippingFee || 0).toLocaleString("zh-TW")}`,
    order.homeAddress ? `宅配地址：${order.homeAddress}` : "",
    order.storeChain ? `超商：${order.storeChain}` : "",
    order.storeName ? `門市名稱：${order.storeName}` : "",
    order.storeCode ? `門市店號：${order.storeCode}` : "",
    `轉帳帳戶末 5 碼：${order.transferLast5}`,
    "",
    "訂單內容：",
    order.itemsText,
    "",
    `商品小計：NT$${Number(order.itemSubtotal || 0).toLocaleString("zh-TW")}`,
    `應付總額：NT$${Number(order.total || 0).toLocaleString("zh-TW")}`,
  ].filter((line) => line !== "").join("\n");

  sendAdminNotification_(subject, body);
}

function notifyWishlistCreated_(wish) {
  const subject = "MUWA 新許願通知";
  const body = [
    "有人送出新的商品許願：",
    "",
    `許願商品或情境：${wish.wishTitle || "未填寫"}`,
    `聯絡信箱：${wish.wishEmail || "未填寫"}`,
    "",
    "想法內容：",
    wish.wishDetail || "未填寫",
    "",
    wish.imageName ? `圖片檔名：${wish.imageName}` : "",
    wish.imageUrl ? `圖片連結：${wish.imageUrl}` : "",
  ].filter((line) => line !== "").join("\n");

  sendAdminNotification_(subject, body);
}

function sendAdminNotification_(subject, body) {
  try {
    sendMuwaEmail_(ADMIN_NOTIFICATION_EMAILS.join(","), subject, body, {
      name: "MUWA 後台通知",
    });
  } catch (error) {
    console.error(`管理者通知寄送失敗：${error && error.message ? error.message : error}`);
    throw error;
  }
}

function testAdminNotification() {
  sendMuwaEmail_(
    ADMIN_NOTIFICATION_EMAILS.join(","),
    "MUWA 後台通知測試",
    "這是一封測試信。如果你收到這封信，代表 Apps Script 寄信權限已經授權成功。",
    { name: "MUWA 後台通知" }
  );
}

function currentMuwaExecutionEmail_() {
  return String(DriveApp.getRootFolder().getOwner().getEmail() || "").trim().toLowerCase();
}

function checkEmailSender() {
  const effectiveUser = currentMuwaExecutionEmail_();
  const result = { expectedSender: MUWA_SENDER_EMAIL, effectiveUser, senderReady: effectiveUser === MUWA_SENDER_EMAIL };
  console.log(JSON.stringify(result));
  return result;
}

function assertMuwaSender_() {
  const effectiveUser = currentMuwaExecutionEmail_();
  if (effectiveUser !== MUWA_SENDER_EMAIL) {
    throw new Error("寄件身分不符，已停止寄信。請使用 muwa.to.sales@gmail.com 部署並建立通知觸發器。");
  }
}

function outputServiceStatus_(e) {
  return outputCallback_(e.parameter.callback || "", {
    ok: true,
    sender: MUWA_SENDER_EMAIL,
    senderReady: currentMuwaExecutionEmail_() === MUWA_SENDER_EMAIL,
    notificationVersion: "20261024-v2",
  });
}

function taipeiNotificationTime_(date) {
  return Utilities.formatDate(date || new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
}

function markOrderPaid(orderId, adminKey) {
  assertAdmin_(ADMIN_USER, adminKey);
  assertMuwaSender_();
  const sheet = getOrderSheet_();
  const headerMap = getHeaderMap_(sheet);
  const rows = sheet.getDataRange().getValues();
  for (let index = 1; index < rows.length; index += 1) {
    if (String(rowValue_(rows[index], headerMap, "訂單編號")) === String(orderId)) {
      return { ok: true, sent: processOrderNotification_(sheet, index + 1, "已付款") };
    }
  }
  throw new Error("找不到訂單。");
}

function setupPaidNotificationTrigger() {
  return setupOrderNotificationWorkflow();
}

function setupOrderNotificationWorkflow() {
  assertMuwaSender_();
  const sheet = getOrderSheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let migrated;
  try {
    migrated = migrateLegacyNotificationRecords_(sheet);
    applyOrderStatusDropdown_(sheet);
    const headers = getHeaderMap_(sheet);
    sheet.getRange(1, headers["通知狀態"]).setNote("選擇已取消、已付款或已寄送後，MUWA 會自動通知顧客。每個狀態只寄送一次，寄信紀錄保存在獨立欄位。");
    sheet.getRange(1, headers["對帳時間"]).setNote("首次選擇已付款時自動填入，時間為台灣時間（Asia/Taipei，UTC+8）；重複選取不會覆蓋。");
    sheet.getRange(1, headers["最後通知時間"]).setNote("顧客通知成功寄出時記錄，使用台灣時間（UTC+8）。");
    sheet.setColumnWidth(headers["通知狀態"], 130);
    sheet.setColumnWidth(headers["對帳時間"], 180);
    sheet.setColumnWidth(headers["最後通知時間"], 180);
    sheet.setColumnWidth(headers["通知錯誤"], 260);
  } finally {
    lock.releaseLock();
  }
  const handlers = ["handlePaidStatusEdit_", "handleOrderNotificationEdit_"];
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (handlers.includes(trigger.getHandlerFunction())) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("handleOrderNotificationEdit_")
    .forSpreadsheet(SpreadsheetApp.openById(PRODUCT_SHEET_ID)).onEdit().create();
  const result = { ok: true, sender: MUWA_SENDER_EMAIL, migrated, message: "訂單通知已設定，未寄出任何歷史訂單通知。" };
  console.log(JSON.stringify(result));
  return result;
}

function migrateLegacyNotificationRecords_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const migrationKey = "MUWA_ORDER_NOTIFICATION_SCHEMA_V2";
  if (properties.getProperty(migrationKey)) return 0;
  const headers = getHeaderMap_(sheet);
  const rows = sheet.getDataRange().getValues();
  let migrated = 0;
  rows.slice(1).forEach((row, index) => {
    if (!rowValue_(row, headers, "訂單編號")) return;
    const oldNotification = String(rowValue_(row, headers, "通知狀態") || "").trim();
    const orderStatus = String(rowValue_(row, headers, "狀態") || "").trim();
    if (oldNotification === "已寄送" && !rowValue_(row, headers, "付款通知狀態")) {
      sheet.getRange(index + 2, headers["付款通知狀態"]).setValue("已寄送");
      const target = normalizeOrderNotificationStatus_(orderStatus) || "已付款";
      sheet.getRange(index + 2, headers["通知狀態"]).setValue(target);
      migrated += 1;
    }
  });
  properties.setProperty(migrationKey, taipeiNotificationTime_());
  return migrated;
}

function normalizeOrderNotificationStatus_(status) {
  return ({ "已付款": "已付款", "對帳成功": "已付款", "已寄送": "已寄送", "已出貨": "已寄送", "已取消": "已取消", "取消": "已取消" })[String(status || "").trim()] || "";
}

function handlePaidStatusEdit_(e) {
  return handleOrderNotificationEdit_(e);
}

function handleOrderNotificationEdit_(e) {
  if (!e || !e.range) return;
  // Legacy triggers belonging to another account must neither send nor modify the row.
  if (currentMuwaExecutionEmail_() !== MUWA_SENDER_EMAIL) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== ORDER_SHEET_NAME || e.range.getLastRow() < 2) return;
  const headers = getHeaderMap_(sheet);
  const firstColumn = e.range.getColumn();
  const lastColumn = e.range.getLastColumn();
  const notificationEdited = headers["通知狀態"] >= firstColumn && headers["通知狀態"] <= lastColumn;
  const orderStatusEdited = headers["狀態"] >= firstColumn && headers["狀態"] <= lastColumn;
  if (!notificationEdited && !orderStatusEdited) return;
  for (let rowNumber = Math.max(2, e.range.getRow()); rowNumber <= e.range.getLastRow(); rowNumber += 1) {
    const column = notificationEdited ? headers["通知狀態"] : headers["狀態"];
    const status = normalizeOrderNotificationStatus_(sheet.getRange(rowNumber, column).getValue());
    if (status) processOrderNotification_(sheet, rowNumber, status);
  }
}

function notificationConfig_(status) {
  return {
    "已付款": { recordHeader: "付款通知狀態", orderStatus: "對帳成功" },
    "已寄送": { recordHeader: "出貨通知狀態", orderStatus: "已出貨" },
    "已取消": { recordHeader: "取消通知狀態", orderStatus: "取消" },
  }[status];
}

function processOrderNotification_(sheet, rowNumber, status) {
  assertMuwaSender_();
  const config = notificationConfig_(status);
  if (!config) throw new Error("通知狀態請選擇已取消、已付款或已寄送。");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let headers;
  try {
    headers = getHeaderMap_(sheet);
    const row = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (!rowValue_(row, headers, "訂單編號")) return false;
    sheet.getRange(rowNumber, headers["通知狀態"]).setValue(status);
    sheet.getRange(rowNumber, headers["狀態"]).setValue(config.orderStatus);
    if (status === "已付款" && !rowValue_(row, headers, "對帳時間")) {
      sheet.getRange(rowNumber, headers["對帳時間"]).setNumberFormat("@").setValue(taipeiNotificationTime_());
    }
    if (String(rowValue_(row, headers, config.recordHeader) || "").trim() === "已寄送") return false;
    const email = String(rowValue_(row, headers, "電子信箱") || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("顧客電子信箱空白或格式錯誤，未寄出通知。");
    const message = buildOrderNotificationEmail_(row, headers, status);
    sendMuwaEmail_(email, message.subject, message.body);
    sheet.getRange(rowNumber, headers[config.recordHeader]).setValue("已寄送");
    sheet.getRange(rowNumber, headers["最後通知時間"]).setNumberFormat("@").setValue(taipeiNotificationTime_());
    sheet.getRange(rowNumber, headers["通知錯誤"]).clearContent();
    return true;
  } catch (error) {
    if (headers && headers["通知錯誤"]) sheet.getRange(rowNumber, headers["通知錯誤"]).setValue(String(error.message || error).slice(0, 500));
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function sendPaidOrderEmailForRow_(sheet, rowNumber) {
  return processOrderNotification_(sheet, rowNumber, "已付款");
}

function sendPaidOrderEmails() {
  // Historical orders are never sent in bulk. Notifications are driven by explicit row edits.
  throw new Error("已停用歷史訂單批次寄信。請在通知狀態下拉選單選擇已付款。");
}

function buildOrderNotificationEmail_(row, headers, status) {
  const orderId = String(rowValue_(row, headers, "訂單編號") || "");
  const name = String(rowValue_(row, headers, "姓名") || "顧客");
  const total = Number(rowValue_(row, headers, "應付總額") || 0).toLocaleString("zh-TW");
  const shipping = String(rowValue_(row, headers, "運送方式") || "依訂單選擇的配送方式");
  const signature = "MUWA 小編\n官方 LINE：@110ayyzu";
  const messages = {
    "已付款": {
      subject: `【MUWA】款項收到了，謝謝你！｜訂單 ${orderId}`,
      body: `${name} 您好：\n\n我們已確認收到你的訂單款項，謝謝你！\u{1F337}\n\n訂單編號：${orderId}\n付款金額：NT$${total}\n\n接下來，我們會依照訂購內容安排製作或出貨。\n\n若你訂購的是客製商品，也請透過官方 LINE 與我們確認設計細節，讓成品更貼近你心裡的樣子。\n\n有任何想確認的地方，歡迎直接回信，或到官方 LINE 找我們。\n\n謝謝你讓 MUWA 參與你的日常。\n\n${signature}`,
    },
    "已寄送": {
      subject: `【MUWA】你的商品出發囉！｜訂單 ${orderId}`,
      body: `${name} 您好：\n\n來跟你分享一個好消息，你的 MUWA 商品已經寄出囉！\n\n訂單編號：${orderId}\n配送方式：${shipping}\n\n接下來請留意物流配送訊息；若選擇超商取貨，請等收到到店通知後，再前往領取。\n\n收到商品後，若有任何需要我們協助的地方，歡迎直接回信或透過官方 LINE 聯絡，我們會協助你確認。\n\n謝謝你的等待，期待這份小物為你的日常添一點喜歡。\n\n${signature}`,
    },
    "已取消": {
      subject: `【MUWA】訂單取消確認｜訂單 ${orderId}`,
      body: `${name} 您好：\n\n跟你確認一下，你的訂單已完成取消。\n\n訂單編號：${orderId}\n\n如果這與你預期的不同，或你還想調整商品、重新訂購，歡迎回信或透過官方 LINE 告訴我們，我們會陪你一起確認。\n\n若這筆訂單已完成付款，也請與我們聯絡，方便核對款項並確認後續處理方式。\n\n謝謝你曾經考慮讓 MUWA 參與你的日常，期待之後還有機會為你服務。\n\n${signature}`,
    },
  };
  if (!messages[status]) throw new Error("不支援的通知狀態。");
  return messages[status];
}

function sendMuwaEmail_(to, subject, body, options) {
  assertMuwaSender_();
  const sendOptions = Object.assign({ name: "MUWA" }, options || {}, { replyTo: MUWA_SENDER_EMAIL });
  // The primary Gmail account supplies the actual From address; do not fall back to an alias.
  delete sendOptions.from;
  GmailApp.sendEmail(to, subject, body, sendOptions);
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

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.reduce((map, header, index) => {
    const name = String(header || "").trim();
    if (name) map[name] = index + 1;
    return map;
  }, {});
}

function rowValue_(row, headerMap, headerName) {
  const column = headerMap[headerName];
  return column ? row[column - 1] : "";
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

function saveWishShowcaseImage_(dataUrl, fileName) {
  const folder = getWishShowcaseImageFolder_();
  const match = String(dataUrl).match(/^data:(.+);base64,(.+)$/);
  if (!match) return "";

  const safeName = `${Date.now()}-${String(fileName || "muwa-wish-showcase.png").replace(/[\\/:*?"<>|]/g, "-")}`;
  const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], safeName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w1600`;
}

function getWishlistImageFolder_() {
  const folders = DriveApp.getFoldersByName(WISHLIST_IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(WISHLIST_IMAGE_FOLDER_NAME);
}

function getWishShowcaseImageFolder_() {
  const folders = DriveApp.getFoldersByName(WISH_SHOWCASE_IMAGE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(WISH_SHOWCASE_IMAGE_FOLDER_NAME);
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
    ensureOrderNotificationHeaders_(sheet);
    applyOrderStatusDropdown_(sheet);
    return sheet;
  }

  sheet = spreadsheet.insertSheet(ORDER_SHEET_NAME);
  sheet.appendRow(getOrderHeaders_());
  applyOrderStatusDropdown_(sheet);
  return sheet;
}

function ensureOrderNotificationHeaders_(sheet) {
  const requiredHeaders = ["出貨通知狀態", "取消通知狀態", "付款通知狀態", "最後通知時間", "通知錯誤"];
  const headerMap = getHeaderMap_(sheet);
  requiredHeaders.forEach((header) => {
    if (!headerMap[header]) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function applyOrderStatusDropdown_(sheet) {
  const headerMap = getHeaderMap_(sheet);
  const statusColumn = headerMap["狀態"];
  if (!statusColumn) return;

  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ORDER_STATUS_OPTIONS, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, statusColumn, maxRows, 1).setDataValidation(rule);
  if (headerMap["通知狀態"]) {
    const notificationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(ORDER_NOTIFICATION_OPTIONS, true).setAllowInvalid(false).build();
    sheet.getRange(2, headerMap["通知狀態"], maxRows, 1).setDataValidation(notificationRule);
  }
}

function getWishlistSheet_() {
  const spreadsheet = SpreadsheetApp.openById(PRODUCT_SHEET_ID);
  let sheet = spreadsheet.getSheetByName(WISHLIST_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(WISHLIST_SHEET_NAME);
    sheet.appendRow(getWishlistHeaders_());
  }
  removeColumnsByHeaders_(sheet, ["使用者裝置資訊", "頁面來源"]);
  const headerMap = getHeaderMap_(sheet);
  if (!headerMap["聯絡信箱"]) {
    sheet.insertColumnAfter(3);
    sheet.getRange(1, 4).setValue("聯絡信箱");
  }
  return sheet;
}

function getWishShowcaseSheet_() {
  const spreadsheet = SpreadsheetApp.openById(PRODUCT_SHEET_ID);
  let sheet = spreadsheet.getSheetByName(WISH_SHOWCASE_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(WISH_SHOWCASE_SHEET_NAME);
    sheet.appendRow(getWishShowcaseHeaders_());
  }
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
    "出貨通知狀態",
    "取消通知狀態",
    "付款通知狀態",
    "最後通知時間",
    "通知錯誤",
  ];
}

function getWishlistHeaders_() {
  return [
    "建立時間",
    "許願商品或情境",
    "想法內容",
    "聯絡信箱",
    "圖片檔名",
    "圖片連結",
    "狀態",
    "備註",
  ];
}

function getWishShowcaseHeaders_() {
  return ["ID", "狀態", "作品名稱", "作品故事", "圖片", "排序", "建立時間", "更新時間"];
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

function findWishShowcaseRow_(sheet, id) {
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
