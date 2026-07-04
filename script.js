const productGrid = document.querySelector("#product-grid");
const wishlistForm = document.querySelector(".wishlist-form");
let productStore = [];
let activeProduct = null;
let activeImageIndex = 0;
let cartItems = {};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(price) {
  const value = String(price || "").trim();
  if (!value) return "";
  if (value.startsWith("NT$")) return value.replace(/^NT\$\s*/, "NT$ ");
  return `NT$ ${value}`;
}

function parsePrice(price) {
  const numeric = String(price || "").replace(/[^\d]/g, "");
  return Number(numeric || 0);
}

function formatMoney(amount) {
  return `NT$ ${Number(amount || 0).toLocaleString("zh-TW")}`;
}

function formatCompactMoney(amount) {
  return `NT$${Number(amount || 0).toLocaleString("zh-TW")}`;
}

const DEFAULT_PURCHASE_OPTIONS = [
  { name: "單個碗", price: 199 },
  { name: "單個木架", price: 300 },
  { name: "飼料碗架一組", price: 799 },
];

const SHIPPING_OPTIONS = {
  home: { label: "宅配", fee: 140 },
  store: { label: "店到店", fee: 60 },
};

const STORE_LOOKUP_LINKS = {
  "7-11": "https://emap.pcsc.com.tw/",
  "全家": "https://www.family.com.tw/Marketing/storemap/",
  "萊爾富": "https://www.hilife.com.tw/filter",
};

const PRODUCT_CACHE_KEY = "muwa-products-cache-v1";

function normalizePurchaseOption(item) {
  return {
    name: String(item?.name || "").trim(),
    price: parsePrice(item?.price),
    addons: Array.isArray(item?.addons)
      ? item.addons
          .map((addon) => ({
            name: String(addon?.name || "").trim(),
            price: parsePrice(addon?.price),
          }))
          .filter((addon) => addon.name && addon.price > 0)
      : [],
  };
}

function parsePurchaseOptions(value, productName = "") {
  if (Array.isArray(value)) {
    return value
      .map(normalizePurchaseOption)
      .filter((item) => item.name && item.price > 0);
  }

  const text = String(value || "").trim();
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const options = Array.isArray(parsed) ? parsed : parsed.options;
      if (Array.isArray(options)) {
        return options.map(normalizePurchaseOption).filter((item) => item.name && item.price > 0);
      }
    } catch {
      // Falls through to the legacy line parser below.
    }
  }

  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const parts = row.split(/[,，]/);
      return {
        name: String(parts[0] || "").trim(),
        price: parsePrice(parts.slice(1).join(",")),
      };
    })
    .filter((item) => item.name && item.price > 0);

  if (!rows.length && String(productName || "").includes("飼料碗架")) {
    return DEFAULT_PURCHASE_OPTIONS;
  }

  return rows;
}

function getPurchaseOptions(product) {
  const options = parsePurchaseOptions(product?.purchaseOptions, product?.name);
  if (options.length) return options;
  const fallbackPrice = parsePrice(product?.price);
  if (!fallbackPrice) return [];
  return [{ name: product?.name || "商品", price: fallbackPrice }];
}

function formatPriceRange(options, fallbackPrice) {
  const prices = (options || []).map((item) => Number(item.price || 0)).filter((price) => price > 0);
  if (!prices.length) return formatPrice(fallbackPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatCompactMoney(min) : `${formatCompactMoney(min)}~${formatCompactMoney(max)}`;
}

function richTextHtml(value) {
  const text = String(value || "").trim();
  if (!text) return "<p>內容準備中。</p>";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function plainTextHtml(value) {
  const text = String(value || "").trim();
  if (!text) return "<p>內容準備中。</p>";
  return `<pre>${escapeHtml(text)}</pre>`;
}

function imageFrame(src, label, position, scale) {
  const size = `${Math.round(Number(scale || 1) * 100)}%`;
  return `<div class="image-frame" role="img" aria-label="${escapeHtml(label)}" style="--image-url:url('${escapeHtml(src)}'); --image-position:${escapeHtml(position || "50% 50%")}; --image-size:${size} auto"></div>`;
}

function normalizeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";

  const idMatch = value.match(/[?&]id=([^&]+)/) || value.match(/\/d\/([^/]+)/);
  if (idMatch) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1600`;
  }

  return value;
}

function getProductImages(product) {
  const rawImages = Array.isArray(product.images)
    ? product.images
    : String(product.images || product.image || "")
        .split(" || ");
  const images = rawImages.map(normalizeImageUrl).filter(Boolean);
  if (!images.length && product.image) images.push(normalizeImageUrl(product.image));
  return [...new Set(images)];
}

function renderEmptyProducts() {
  if (!productGrid) return;
  renderProductFilters([]);

  productGrid.innerHTML = `
    <div class="empty-products">
      <h3>商品準備中</h3>
      <p>目前還沒有正式上架的商品。新品準備好後，會在這裡公布。</p>
    </div>
  `;
}

function renderProductLoading() {
  if (!productGrid) return;
  renderProductFilters([]);

  productGrid.innerHTML = `
    <div class="empty-products">
      <h3>載入中~請稍後~</h3>
      <p>正在讀取最新上架商品。</p>
    </div>
  `;
}

function readCachedProducts() {
  try {
    const cached = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || "null");
    return Array.isArray(cached?.products) ? cached.products : [];
  } catch {
    return [];
  }
}

function writeCachedProducts(products) {
  try {
    localStorage.setItem(
      PRODUCT_CACHE_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        products,
      })
    );
  } catch {
    // Cache is only for faster first paint; ignore storage failures.
  }
}

function renderProductList(products) {
  if (!productGrid) return;

  productStore = products.map((product) => ({
    ...product,
    images: getProductImages(product),
    purchaseOptions: getPurchaseOptions(product),
    price: formatPrice(product.price),
    imagePosition: product.imagePosition || "50% 50%",
    imageScale: product.imageScale || "1",
  }));

  if (!productStore.length) {
    renderEmptyProducts();
    return;
  }

  renderProductFilters(productStore);

  productGrid.innerHTML = productStore
    .map((product, index) => {
      const image = product.images[0]
        ? imageFrame(product.images[0], product.name, product.imagePosition, product.imageScale)
        : `<span></span>`;
      const priceLabel = formatPriceRange(product.purchaseOptions, product.price);
      const price = priceLabel ? `<strong>${escapeHtml(priceLabel)}</strong>` : "";

      return `
        <article class="product-card" data-product-category="${escapeHtml(product.category || "全部")}">
          <button class="product-open" type="button" data-product-index="${index}" aria-label="查看 ${escapeHtml(product.name)} 商品詳情">
            <div class="product-visual ${product.images[0] ? "has-image" : "visual-bowl"}" aria-hidden="${product.images[0] ? "false" : "true"}">
              <span class="product-category-badge">${escapeHtml(product.category || "全部")}</span>
              ${image}
            </div>
            <div class="product-copy">
              <div class="product-copy-main">
                <h3>${escapeHtml(product.name)}</h3>
                <span>${escapeHtml(product.description)}</span>
              </div>
              <div class="product-meta">
                ${price}
                <span class="product-detail-pill">查看詳情</span>
              </div>
            </div>
          </button>
        </article>
      `;
    })
    .join("");
}

function renderProductFilters(products) {
  const filterRow = document.querySelector(".filter-row");
  if (!filterRow) return;

  const categories = [
    ...new Set(
      products
        .map((product) => String(product.category || "").trim())
        .filter((category) => category && category !== "全部")
    ),
  ];

  filterRow.innerHTML = [
    `<button class="filter-button is-active" data-filter="all" type="button">全部</button>`,
    ...categories.map(
      (category) =>
        `<button class="filter-button" data-filter="${escapeHtml(category)}" type="button">${escapeHtml(category)}</button>`
    ),
  ].join("");
}

function applyProductFilter(filterValue) {
  const value = String(filterValue || "all");
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === value);
  });
  document.querySelectorAll(".product-card").forEach((card) => {
    const category = card.dataset.productCategory || "";
    card.classList.toggle("is-hidden", value !== "all" && category !== value);
  });
}

function loadProductFeed() {
  const feedUrl = window.MUWA_CONFIG?.productFeedUrl || "";
  if (!feedUrl) {
    renderEmptyProducts();
    return;
  }

  const cachedProducts = readCachedProducts();
  if (cachedProducts.length) {
    renderProductList(cachedProducts);
  } else {
    renderProductLoading();
  }

  const callbackName = `muwaProducts_${Date.now()}`;
  const script = document.createElement("script");
  const separator = feedUrl.includes("?") ? "&" : "?";

  window[callbackName] = (payload) => {
    const products = Array.isArray(payload.products) ? payload.products : [];
    if (products.length) writeCachedProducts(products);
    renderProductList(products);
    delete window[callbackName];
    script.remove();
  };

  script.onerror = () => {
    if (!cachedProducts.length) renderEmptyProducts();
    delete window[callbackName];
    script.remove();
  };

  script.src = `${feedUrl}${separator}action=products&callback=${callbackName}`;
  document.body.appendChild(script);
}

function ensureProductModal() {
  let modal = document.querySelector("#product-detail");
  if (modal) return modal;

  modal = document.createElement("section");
  modal.id = "product-detail";
  modal.className = "product-detail";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="product-detail-backdrop" data-close-detail></div>
    <article class="product-detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <button class="detail-close" type="button" data-close-detail aria-label="關閉商品詳情">×</button>
      <div class="detail-gallery">
        <div class="detail-main-image"></div>
        <div class="detail-thumbs" aria-label="商品圖片選擇"></div>
      </div>
      <div class="detail-info">
        <p class="section-kicker detail-category"></p>
        <h2 id="detail-title"></h2>
        <div class="detail-description"></div>
        <strong class="detail-price"></strong>
        <div class="purchase-options" data-purchase-options aria-label="購買細項"></div>
        <div class="purchase-total"><span>共計</span><strong data-detail-total>NT$ 0</strong></div>
        <p class="cart-message" data-cart-message aria-live="polite"></p>
        <div class="detail-actions">
          <button class="button primary detail-cart" type="button" data-add-cart>加到購物車</button>
        </div>
      </div>
      <div class="detail-tabs">
        <button class="is-active" type="button" data-tab="description">商品描述</button>
        <button type="button" data-tab="shipping">送貨及付款方式</button>
        <button type="button" data-tab="review">顧客評價</button>
      </div>
      <div class="detail-tab-panel" data-tab-panel></div>
    </article>
  `;
  document.body.appendChild(modal);
  return modal;
}

function ensureCartButton() {
  let button = document.querySelector("#cart-button");
  if (button) return button;

  button = document.createElement("button");
  button.id = "cart-button";
  button.className = "cart-button";
  button.type = "button";
  button.setAttribute("aria-label", "查看購物車");
  button.innerHTML = `
    <span class="cart-icon" aria-hidden="true">購物車</span>
    <span class="cart-count" data-cart-count>0</span>
  `;
  document.body.appendChild(button);
  button.addEventListener("click", openCart);
  return button;
}

function ensureCartModal() {
  let modal = document.querySelector("#cart-detail");
  if (modal) return modal;

  modal = document.createElement("section");
  modal.id = "cart-detail";
  modal.className = "cart-detail";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="cart-backdrop" data-close-cart></div>
    <article class="cart-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
      <h2 id="cart-title">購物車</h2>
      <p>確認商品與數量後，下一步填寫購買資訊並建立訂單。</p>
      <div class="cart-list" data-cart-list></div>
      <div class="cart-actions">
        <button class="button secondary" type="button" data-close-cart>回到上一頁</button>
        <button class="button primary" type="button" data-checkout>結帳</button>
      </div>
    </article>
  `;
  document.body.appendChild(modal);
  return modal;
}

function ensureOrderModal() {
  let modal = document.querySelector("#order-checkout");
  if (modal) return modal;

  modal = document.createElement("section");
  modal.id = "order-checkout";
  modal.className = "order-checkout";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="order-backdrop" data-close-order></div>
    <article class="order-panel" role="dialog" aria-modal="true" aria-labelledby="order-title">
      <button class="detail-close" type="button" data-close-order aria-label="關閉訂單視窗">×</button>
      <div data-order-form-view>
        <h2 id="order-title">填寫購買資訊</h2>
        <p class="order-intro">非客製商品可先建立訂單。送出後會產生訂單編號，請依畫面提供的帳戶完成轉帳。</p>
        <div class="order-summary" data-order-summary></div>
        <form class="order-form" data-order-form>
          <div class="order-grid">
            <label>
              <span class="field-label">姓名 <span class="required-mark">*</span></span>
              <input type="text" name="customerName" autocomplete="name" required />
            </label>
            <label>
              <span class="field-label">手機 <span class="required-mark">*</span></span>
              <input type="tel" name="customerPhone" autocomplete="tel" required />
            </label>
          </div>
          <label>
            <span class="field-label">電子信箱 <span class="required-mark">*</span></span>
            <input type="email" name="customerEmail" autocomplete="email" required />
          </label>

          <fieldset class="shipping-fieldset">
            <legend>運送方式 <span class="required-mark">*</span></legend>
            <label class="shipping-choice">
              <input type="radio" name="shippingMethod" value="home" checked required />
              <span>宅配 <strong>${formatCompactMoney(SHIPPING_OPTIONS.home.fee)}</strong></span>
            </label>
            <label class="shipping-choice">
              <input type="radio" name="shippingMethod" value="store" required />
              <span>7-11 / 全家 / 萊爾富店到店 <strong>${formatCompactMoney(SHIPPING_OPTIONS.store.fee)}</strong></span>
            </label>
          </fieldset>

          <div class="shipping-fields" data-home-fields>
            <label>
              <span class="field-label">宅配地址 <span class="required-mark">*</span></span>
              <input type="text" name="homeAddress" autocomplete="street-address" required />
            </label>
          </div>

          <div class="shipping-fields" data-store-fields hidden>
            <div class="order-grid">
              <label>
                <span class="field-label">超商 <span class="required-mark">*</span></span>
                <select name="storeChain" disabled required>
                  <option value="7-11">7-11</option>
                  <option value="全家">全家</option>
                  <option value="萊爾富">萊爾富</option>
                </select>
              </label>
              <a class="store-lookup" href="${STORE_LOOKUP_LINKS["7-11"]}" target="_blank" rel="noopener" data-store-lookup>查詢門市</a>
            </div>
            <p class="field-note">請先開啟門市查詢頁，找到門市後把資訊填回下方。</p>
            <div class="order-grid">
              <label>
                <span class="field-label">門市名稱 <span class="required-mark">*</span></span>
                <input type="text" name="storeName" disabled />
              </label>
              <label>
                <span class="field-label">門市店號 <span class="required-mark">*</span></span>
                <input type="text" name="storeCode" disabled />
              </label>
            </div>
          </div>

          <label>
            <span class="field-label">轉帳帳戶末 5 碼(請先填寫，匯款後會依此5碼對帳) <span class="required-mark">*</span></span>
            <input type="text" name="transferLast5" inputmode="numeric" pattern="\\d{5}" maxlength="5" placeholder="例如：90123" required />
          </label>

          <div class="order-total" data-order-total></div>
          <p class="form-message" data-order-message role="status" aria-live="polite"></p>
          <div class="cart-actions">
            <button class="button secondary" type="button" data-order-back>回到購物車</button>
            <button class="button primary" type="submit">送出訂單</button>
          </div>
        </form>
      </div>

      <div class="order-success" data-order-success hidden></div>
    </article>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-order-form]").addEventListener("submit", submitOrderForm);
  modal.querySelectorAll('input[name="shippingMethod"]').forEach((input) => {
    input.addEventListener("change", updateOrderShippingFields);
  });
  modal.querySelector('select[name="storeChain"]').addEventListener("change", updateStoreLookupLink);
  return modal;
}

function ensureLineModal() {
  let modal = document.querySelector("#line-checkout");
  if (modal) return modal;

  modal = document.createElement("section");
  modal.id = "line-checkout";
  modal.className = "line-checkout";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="line-backdrop" data-close-line></div>
    <article class="line-panel" role="dialog" aria-modal="true" aria-labelledby="line-title">
      <button class="detail-close" type="button" data-close-line aria-label="關閉 LINE 視窗">×</button>
      <h2 id="line-title">加入官方LINE，跟MUWA討論 !</h2>
      <img src="./assets/line-qr.jpg" alt="MUWA 官方 LINE QR Code" />
    </article>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openProductDetail(productIndex) {
  const product = productStore[Number(productIndex)];
  if (!product) return;

  activeProduct = product;
  activeImageIndex = 0;
  renderProductDetail();

  const modal = ensureProductModal();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
}

function closeProductDetail() {
  const modal = ensureProductModal();
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".cart-detail.is-open") && !document.querySelector(".line-checkout.is-open")) {
    document.body.classList.remove("detail-open");
  }
}

function renderProductDetail() {
  const modal = ensureProductModal();
  const product = activeProduct;
  if (!product) return;

  const images = product.images.length ? product.images : [""];
  const activeImage = images[activeImageIndex] || images[0] || "";
  const buyLink = product.link || `mailto:muwa.to.sales@gmail.com?subject=${encodeURIComponent(`想詢問 ${product.name}`)}`;

  modal.querySelector(".detail-category").textContent = product.category || "全部";
  modal.querySelector("#detail-title").textContent = product.name || "MUWA 商品";
  modal.querySelector(".detail-description").innerHTML = richTextHtml(product.description || "商品介紹準備中。");
  modal.querySelector(".detail-price").textContent = formatPriceRange(product.purchaseOptions, product.price) || "價格請私訊";
  modal.querySelector("[data-cart-message]").textContent = "";
  renderPurchaseOptions(product);
  modal.querySelector(".detail-main-image").innerHTML = activeImage
    ? imageFrame(activeImage, product.name, product.imagePosition || "50% 50%", product.imageScale || "1")
    : `<div class="detail-image-placeholder">MUWA</div>`;
  modal.querySelector(".detail-thumbs").innerHTML = images
    .map((image, index) => `
      <button class="${index === activeImageIndex ? "is-active" : ""}" type="button" data-image-index="${index}">
        ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} 圖片 ${index + 1}" />` : "<span>MUWA</span>"}
      </button>
    `)
    .join("");

  renderDetailTab("description");
}

function renderPurchaseOptions(product) {
  const modal = ensureProductModal();
  const options = getPurchaseOptions(product);
  const container = modal.querySelector("[data-purchase-options]");
  if (!container) return;

  if (!options.length) {
    container.innerHTML = `<p class="field-note">目前尚未設定可購買細項，請先聯絡 MUWA 確認。</p>`;
    updateDetailOptionTotals();
    return;
  }

  container.innerHTML = options
    .map((option, index) => `
      <article class="purchase-option-row" data-option-index="${index}" data-option-price="${Number(option.price || 0)}" data-option-name="${escapeHtml(option.name)}">
        <div class="purchase-line">
          <button class="purchase-option-name" type="button" data-select-option="${index}">
            <span>${escapeHtml(option.name)}</span>
            <small>${escapeHtml(formatCompactMoney(option.price))}</small>
          </button>
          <div class="option-qty" aria-label="${escapeHtml(option.name)} 數量">
            <button type="button" data-option-minus="${index}" aria-label="減少 ${escapeHtml(option.name)} 數量">−</button>
            <span data-option-qty="${index}">1</span>
            <button type="button" data-option-plus="${index}" aria-label="增加 ${escapeHtml(option.name)} 數量">+</button>
          </div>
          <strong class="purchase-subtotal" data-option-subtotal="${index}">小計 ${escapeHtml(formatCompactMoney(option.price))}</strong>
        </div>
        ${option.addons?.length ? `
          <div class="addon-options" aria-label="${escapeHtml(option.name)} 加購品">
            <p>可加購</p>
            ${option.addons.map((addon, addonIndex) => `
              <div class="addon-option-row" data-addon-index="${addonIndex}" data-addon-parent="${index}" data-addon-price="${Number(addon.price || 0)}" data-addon-name="${escapeHtml(addon.name)}" data-addon-parent-name="${escapeHtml(option.name)}">
                <span>${escapeHtml(addon.name)} <small>${escapeHtml(formatCompactMoney(addon.price))}</small></span>
                <div class="option-qty addon-qty" aria-label="${escapeHtml(addon.name)} 加購數量">
                  <button type="button" data-addon-minus="${index}:${addonIndex}" aria-label="減少 ${escapeHtml(addon.name)} 加購數量">−</button>
                  <span data-addon-qty="${index}:${addonIndex}">0</span>
                  <button type="button" data-addon-plus="${index}:${addonIndex}" aria-label="增加 ${escapeHtml(addon.name)} 加購數量">+</button>
                </div>
                <strong data-addon-subtotal="${index}:${addonIndex}">小計 ${escapeHtml(formatCompactMoney(0))}</strong>
              </div>
            `).join("")}
          </div>
        ` : ""}
      </article>
    `)
    .join("");
  updateDetailOptionTotals();
}

function updateDetailOptionTotals() {
  const modal = document.querySelector("#product-detail");
  if (!modal) return;
  let total = 0;
  modal.querySelectorAll("[data-option-index]").forEach((row) => {
    const price = Number(row.dataset.optionPrice || 0);
    const index = row.dataset.optionIndex;
    const qty = Number(row.querySelector(`[data-option-qty="${index}"]`)?.textContent || 0);
    const subtotal = price * qty;
    total += subtotal;
    const subtotalNode = row.querySelector(`[data-option-subtotal="${index}"]`);
    if (subtotalNode) subtotalNode.textContent = `小計 ${formatCompactMoney(subtotal)}`;
  });
  modal.querySelectorAll("[data-addon-index]").forEach((row) => {
    const key = `${row.dataset.addonParent}:${row.dataset.addonIndex}`;
    const price = Number(row.dataset.addonPrice || 0);
    const parentQty = Number(modal.querySelector(`[data-option-qty="${row.dataset.addonParent}"]`)?.textContent || 0);
    const qtyNode = row.querySelector(`[data-addon-qty="${key}"]`);
    let qty = Number(qtyNode?.textContent || 0);
    const locked = parentQty <= 0;
    if (locked && qty > 0) {
      qty = 0;
      if (qtyNode) qtyNode.textContent = "0";
    }
    row.classList.toggle("is-locked", locked);
    row.querySelector(`[data-addon-plus="${key}"]`)?.toggleAttribute("disabled", locked);
    row.querySelector(`[data-addon-minus="${key}"]`)?.toggleAttribute("disabled", locked || qty <= 0);
    const subtotal = price * qty;
    total += subtotal;
    const subtotalNode = row.querySelector(`[data-addon-subtotal="${key}"]`);
    if (subtotalNode) subtotalNode.textContent = `小計 ${formatCompactMoney(subtotal)}`;
  });
  const totalNode = modal.querySelector("[data-detail-total]");
  if (totalNode) totalNode.textContent = formatCompactMoney(total);
}

function getProductKey(product) {
  return String(product?.id || product?.name || "");
}

function getCartKey(product, optionName) {
  return `${getProductKey(product)}::${optionName}`;
}

function isCustomProduct(productOrItem) {
  const category = String(productOrItem?.category || "").toLowerCase();
  return /客製|客制|custom/.test(category);
}

function getSelectedCartItems() {
  return Object.values(cartItems).filter((item) => Number(item.qty || 0) > 0);
}

function getCartSubtotal(items = getSelectedCartItems()) {
  return items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function getOrderEndpoint() {
  return window.MUWA_CONFIG?.orderEndpoint || window.MUWA_CONFIG?.productFeedUrl || "";
}

function addActiveProductToCart(mode = "add") {
  if (!activeProduct) return 0;
  const rows = Array.from(document.querySelectorAll("#product-detail [data-option-index]"));
  let addedQty = 0;
  rows.forEach((row) => {
    const index = row.dataset.optionIndex;
    const optionName = row.dataset.optionName || activeProduct.name || "商品";
    const price = Number(row.dataset.optionPrice || 0);
    const qty = Number(row.querySelector(`[data-option-qty="${index}"]`)?.textContent || 0);
    if (qty <= 0) return;
    const key = getCartKey(activeProduct, optionName);
    const previous = cartItems[key]?.qty || 0;
    const nextQty = mode === "set" ? qty : previous + qty;
    cartItems[key] = {
      key,
      productKey: getProductKey(activeProduct),
      productName: activeProduct.name || "MUWA 商品",
      category: activeProduct.category || "",
      optionName,
      price,
      qty: nextQty,
      image: activeProduct.images?.[0] || "",
    };
    addedQty += qty;
  });
  document.querySelectorAll("#product-detail [data-addon-index]").forEach((row) => {
    const parentName = row.dataset.addonParentName || activeProduct.name || "商品";
    const addonName = row.dataset.addonName || "加購品";
    const price = Number(row.dataset.addonPrice || 0);
    const keyPart = `${row.dataset.addonParent}:${row.dataset.addonIndex}`;
    const parentQty = Number(document.querySelector(`[data-option-qty="${row.dataset.addonParent}"]`)?.textContent || 0);
    const qty = Number(row.querySelector(`[data-addon-qty="${keyPart}"]`)?.textContent || 0);
    if (qty <= 0 || parentQty <= 0) return;
    const optionName = `${parentName} 加購：${addonName}`;
    const key = getCartKey(activeProduct, optionName);
    const previous = cartItems[key]?.qty || 0;
    const nextQty = mode === "set" ? qty : previous + qty;
    cartItems[key] = {
      key,
      productKey: getProductKey(activeProduct),
      productName: activeProduct.name || "MUWA 商品",
      category: activeProduct.category || "",
      optionName,
      price,
      qty: nextQty,
      image: activeProduct.images?.[0] || "",
    };
    addedQty += qty;
  });
  updateCartButton();
  const message = document.querySelector("[data-cart-message]");
  if (message) {
    message.textContent = addedQty > 0 ? `已加入購物車：共 ${addedQty} 件細項` : "請先選擇要購買的細項數量。";
  }
  return addedQty;
}

function openCart() {
  const modal = ensureCartModal();
  renderCart();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
}

function closeCart() {
  const modal = ensureCartModal();
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".product-detail.is-open") && !document.querySelector(".line-checkout.is-open")) {
    document.body.classList.remove("detail-open");
  }
}

function renderCart() {
  const modal = ensureCartModal();
  const list = modal.querySelector("[data-cart-list]");
  const selectedItems = Object.values(cartItems).filter((item) => Number(item.qty || 0) > 0);
  if (!productStore.length) {
    list.innerHTML = "<p>目前沒有可購買商品。</p>";
    return;
  }

  if (!selectedItems.length) {
    list.innerHTML = "<p>購物車目前是空的。可以回到商品頁加入想購買的商品。</p>";
    return;
  }

  const rows = selectedItems
    .map((item) => {
      const subtotal = Number(item.price || 0) * Number(item.qty || 0);
      const image = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.productName)}" />`
        : `<span>MUWA</span>`;

      return `
        <article class="cart-row">
          <div class="cart-row-image">${image}</div>
          <div>
            <h3>${escapeHtml(item.productName)}</h3>
            <p>${escapeHtml(item.optionName)} / ${escapeHtml(formatCompactMoney(item.price))} / 小計 ${escapeHtml(formatCompactMoney(subtotal))}</p>
          </div>
          <div class="cart-qty">
            <button type="button" data-cart-minus="${escapeHtml(item.key)}">−</button>
            <span>${item.qty}</span>
            <button type="button" data-cart-plus="${escapeHtml(item.key)}">+</button>
          </div>
        </article>
      `;
    })
    .join("");
  const total = selectedItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  list.innerHTML = `${rows}<div class="cart-total"><span>共計</span><strong>${escapeHtml(formatCompactMoney(total))}</strong></div>`;
}

function updateCartButton() {
  const button = ensureCartButton();
  const count = Object.values(cartItems).reduce((sum, item) => sum + Number(item.qty || 0), 0);
  button.querySelector("[data-cart-count]").textContent = String(count);
  button.classList.toggle("has-items", count > 0);
}

function openLineCheckout() {
  const modal = ensureLineModal();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
}

function closeLineCheckout() {
  const modal = ensureLineModal();
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".product-detail.is-open") && !document.querySelector(".cart-detail.is-open") && !document.querySelector(".order-checkout.is-open")) {
    document.body.classList.remove("detail-open");
  }
}

function openOrderCheckout() {
  const items = getSelectedCartItems();
  if (!items.length) {
    openCart();
    const list = document.querySelector("[data-cart-list]");
    if (list) list.innerHTML = "<p>購物車目前是空的。請先加入商品再結帳。</p>";
    return;
  }

  const modal = ensureOrderModal();
  renderOrderForm();
  closeCart();
  closeProductDetail();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-open");
}

function closeOrderCheckout() {
  const modal = ensureOrderModal();
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".product-detail.is-open") && !document.querySelector(".cart-detail.is-open") && !document.querySelector(".line-checkout.is-open")) {
    document.body.classList.remove("detail-open");
  }
}

function renderOrderForm() {
  const modal = ensureOrderModal();
  const form = modal.querySelector("[data-order-form]");
  const items = getSelectedCartItems();
  const summary = modal.querySelector("[data-order-summary]");
  modal.querySelector("[data-order-form-view]").hidden = false;
  modal.querySelector("[data-order-success]").hidden = true;
  form.reset();
  form.querySelector('input[name="shippingMethod"][value="home"]').checked = true;
  modal.querySelector("[data-order-message]").textContent = "";
  summary.innerHTML = items
    .map((item) => {
      const subtotal = Number(item.price || 0) * Number(item.qty || 0);
      return `
        <div class="order-summary-row">
          <span>${escapeHtml(item.productName)}｜${escapeHtml(item.optionName)} × ${Number(item.qty || 0)}</span>
          <strong>${escapeHtml(formatCompactMoney(subtotal))}</strong>
        </div>
      `;
    })
    .join("");
  updateOrderShippingFields();
}

function getSelectedShippingMethod() {
  const modal = ensureOrderModal();
  return modal.querySelector('input[name="shippingMethod"]:checked')?.value || "home";
}

function getSelectedShipping() {
  return SHIPPING_OPTIONS[getSelectedShippingMethod()] || SHIPPING_OPTIONS.home;
}

function updateOrderShippingFields() {
  const modal = ensureOrderModal();
  const method = getSelectedShippingMethod();
  const homeFields = modal.querySelector("[data-home-fields]");
  const storeFields = modal.querySelector("[data-store-fields]");
  const homeInputs = homeFields.querySelectorAll("input");
  const storeInputs = storeFields.querySelectorAll("input, select");

  homeFields.hidden = method !== "home";
  storeFields.hidden = method !== "store";
  homeInputs.forEach((input) => {
    input.disabled = method !== "home";
    input.required = method === "home";
  });
  storeInputs.forEach((input) => {
    input.disabled = method !== "store";
    input.required = method === "store";
  });
  updateStoreLookupLink();
  updateOrderTotal();
}

function updateStoreLookupLink() {
  const modal = ensureOrderModal();
  const select = modal.querySelector('select[name="storeChain"]');
  const link = modal.querySelector("[data-store-lookup]");
  const chain = select?.value || "7-11";
  if (link) {
    link.href = STORE_LOOKUP_LINKS[chain] || STORE_LOOKUP_LINKS["7-11"];
    link.textContent = `查詢 ${chain} 門市`;
  }
}

function updateOrderTotal() {
  const modal = ensureOrderModal();
  const subtotal = getCartSubtotal();
  const shipping = getSelectedShipping();
  const total = subtotal + Number(shipping.fee || 0);
  const node = modal.querySelector("[data-order-total]");
  if (node) {
    node.innerHTML = `
      <span>商品小計 ${escapeHtml(formatCompactMoney(subtotal))}</span>
      <span>運費 ${escapeHtml(formatCompactMoney(shipping.fee))}</span>
      <strong>總計 ${escapeHtml(formatCompactMoney(total))}</strong>
    `;
  }
}

function buildOrderPayload(form) {
  const data = new FormData(form);
  const items = getSelectedCartItems().map((item) => ({
    productName: item.productName,
    optionName: item.optionName,
    price: Number(item.price || 0),
    qty: Number(item.qty || 0),
    subtotal: Number(item.price || 0) * Number(item.qty || 0),
  }));
  const shippingMethod = String(data.get("shippingMethod") || "home");
  const shipping = SHIPPING_OPTIONS[shippingMethod] || SHIPPING_OPTIONS.home;
  const subtotal = getCartSubtotal();
  const storeChain = String(data.get("storeChain") || "");

  return {
    customerName: String(data.get("customerName") || "").trim(),
    customerPhone: String(data.get("customerPhone") || "").trim(),
    customerEmail: String(data.get("customerEmail") || "").trim(),
    shippingMethod,
    shippingLabel: shippingMethod === "home" ? "宅配" : `${storeChain || "店到店"} 店到店`,
    shippingFee: Number(shipping.fee || 0),
    homeAddress: String(data.get("homeAddress") || "").trim(),
    storeChain,
    storeName: String(data.get("storeName") || "").trim(),
    storeCode: String(data.get("storeCode") || "").trim(),
    transferLast5: String(data.get("transferLast5") || "").trim(),
    items,
    itemSubtotal: subtotal,
    total: subtotal + Number(shipping.fee || 0),
  };
}

async function submitOrderForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const modal = ensureOrderModal();
  const message = modal.querySelector("[data-order-message]");
  const endpoint = getOrderEndpoint();

  if (!endpoint) {
    message.textContent = "訂單端點尚未設定。請先到 config.js 填入 Apps Script 網址。";
    return;
  }

  if (!form.reportValidity()) return;
  const payload = buildOrderPayload(form);
  if (!payload.items.length) {
    message.textContent = "購物車目前是空的，請先加入商品。";
    return;
  }

  message.textContent = "訂單送出中...";
  form.querySelector('button[type="submit"]').disabled = true;

  try {
    const result = await submitOrderToGoogleScript(endpoint, payload);
    renderOrderSuccess(result, payload);
    cartItems = {};
    updateCartButton();
  } catch (error) {
    message.textContent = error?.message || "訂單送出失敗，請稍後再試，或直接私訊 MUWA。";
  } finally {
    form.querySelector('button[type="submit"]').disabled = false;
  }
}

function hasCustomOrderItems(payload) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.some((item) => {
    const text = `${item.productName || ""} ${item.optionName || ""}`;
    return text.includes("客製") || text.includes("客制") || text.includes("訂製") || text.includes("訂制");
  });
}

function renderOrderSuccess(result, payload) {
  const modal = ensureOrderModal();
  const orderId = result.orderId || "訂單已送出";
  const hasCustomItems = hasCustomOrderItems(payload);
  const bankCard = `
    <div class="bank-card">
      <span>轉帳銀行</span>
      <strong>(822) 中國信託</strong>
      <span>帳號</span>
      <strong>245540029018</strong>
      <span>轉帳帳戶末 5 碼</span>
      <strong>${escapeHtml(payload.transferLast5)}</strong>
      <span>應付總額</span>
      <strong>${escapeHtml(formatCompactMoney(payload.total))}</strong>
    </div>
  `;
  modal.querySelector("[data-order-form-view]").hidden = true;
  const success = modal.querySelector("[data-order-success]");
  success.hidden = false;
  success.innerHTML = `
    ${hasCustomItems ? "" : '<div class="success-check" aria-hidden="true">✓</div>'}
    <p class="section-kicker">訂單已建立</p>
    <h2>建立訂單編號${escapeHtml(orderId)}</h2>
    <p>${hasCustomItems
      ? "因有客製商品，請先連絡官方LINE確認設計後再進行匯款。"
      : "對帳成功會收到muwa.to.sales@gmail.com告知的信件。"}</p>
    ${hasCustomItems ? '<img class="success-line-qr" src="./assets/line-qr.jpg" alt="MUWA 官方 LINE QR Code" />' : ""}
    ${hasCustomItems ? "" : bankCard}
    <div class="cart-actions">
      <button class="button primary" type="button" data-close-order>完成</button>
    </div>
  `;
}

function submitOrderToGoogleScript(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const token = `muwa_order_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbackName = `muwaOrderCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("訂單送出逾時，請稍後再試，或直接私訊 MUWA。"));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      if (data.source !== "muwa-order" || data.token !== token) return;
      cleanup();
      if (data.ok) {
        resolve(data);
      } else {
        reject(new Error(data.message || "訂單建立失敗，請稍後再試。"));
      }
    };

    const url = new URL(endpoint);
    url.searchParams.set("action", "createOrder");
    url.searchParams.set("token", token);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("payload", JSON.stringify(payload));

    script.src = url.toString();
    script.onerror = () => {
      cleanup();
      reject(new Error("訂單送出失敗，請稍後再試，或直接私訊 MUWA。"));
    };
    document.body.appendChild(script);
  });
}

function renderDetailTab(tabName) {
  const modal = ensureProductModal();
  const product = activeProduct;
  const panel = modal.querySelector("[data-tab-panel]");
  if (!product || !panel) return;

  modal.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  });
  panel.dataset.currentTab = tabName;

  const content = {
    description: richTextHtml(product.detailDescription || product.description || "商品介紹準備中。"),
    shipping: plainTextHtml(product.shippingInfo || "MUWA 為小型個人工作室，需溝通設計的商品，請下單後主動聯絡 Line 官方，勿擅自先付款。"),
    review: richTextHtml(product.reviewInfo || "評價區準備中。等商品正式累積回饋後，會陸續補上大家的使用心得。"),
  };

  panel.innerHTML = content[tabName] || content.description;
}

if (productGrid) {
  productGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-product-index]");
    if (!button) return;
    openProductDetail(button.dataset.productIndex);
  });
}

document.addEventListener("click", (event) => {
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    applyProductFilter(filterButton.dataset.filter);
    return;
  }

  const closeButton = event.target.closest("[data-close-detail]");
  if (closeButton) closeProductDetail();

  const addCartButton = event.target.closest("[data-add-cart]");
  if (addCartButton) addActiveProductToCart();

  const closeCartButton = event.target.closest("[data-close-cart]");
  if (closeCartButton) closeCart();

  const checkoutButton = event.target.closest("[data-checkout]");
  if (checkoutButton) {
    openOrderCheckout();
  }

  const closeLineButton = event.target.closest("[data-close-line]");
  if (closeLineButton) closeLineCheckout();

  const closeOrderButton = event.target.closest("[data-close-order]");
  if (closeOrderButton) closeOrderCheckout();

  const orderBackButton = event.target.closest("[data-order-back]");
  if (orderBackButton) {
    closeOrderCheckout();
    openCart();
  }

  const cartPlus = event.target.closest("[data-cart-plus]");
  if (cartPlus) {
    const key = cartPlus.dataset.cartPlus;
    if (cartItems[key]) cartItems[key].qty += 1;
    updateCartButton();
    renderCart();
  }

  const cartMinus = event.target.closest("[data-cart-minus]");
  if (cartMinus) {
    const key = cartMinus.dataset.cartMinus;
    if (cartItems[key]) {
      cartItems[key].qty = Math.max(0, Number(cartItems[key].qty || 0) - 1);
      if (cartItems[key].qty <= 0) delete cartItems[key];
    }
    updateCartButton();
    renderCart();
  }

  const imageButton = event.target.closest("[data-image-index]");
  if (imageButton && activeProduct) {
    activeImageIndex = Number(imageButton.dataset.imageIndex);
    renderProductDetail();
  }

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) renderDetailTab(tabButton.dataset.tab);

  const optionQty = event.target.closest("[data-option-plus], [data-option-minus]");
  if (optionQty) {
    const index = optionQty.dataset.optionPlus || optionQty.dataset.optionMinus;
    const qtyNode = document.querySelector(`[data-option-qty="${index}"]`);
    if (!qtyNode) return;
    const current = Number(qtyNode.textContent || 0);
    const next = optionQty.matches("[data-option-plus]") ? current + 1 : Math.max(0, current - 1);
    qtyNode.textContent = String(next);
    updateDetailOptionTotals();
  }

  const addonQty = event.target.closest("[data-addon-plus], [data-addon-minus]");
  if (addonQty) {
    const key = addonQty.dataset.addonPlus || addonQty.dataset.addonMinus;
    const qtyNode = document.querySelector(`[data-addon-qty="${key}"]`);
    if (!qtyNode) return;
    const [parentIndex] = key.split(":");
    const parentQty = Number(document.querySelector(`[data-option-qty="${parentIndex}"]`)?.textContent || 0);
    if (addonQty.matches("[data-addon-plus]") && parentQty <= 0) {
      const message = document.querySelector("[data-cart-message]");
      if (message) message.textContent = "請先選擇對應的主細項，才可以加購。";
      updateDetailOptionTotals();
      return;
    }
    const current = Number(qtyNode.textContent || 0);
    const next = addonQty.matches("[data-addon-plus]") ? current + 1 : Math.max(0, current - 1);
    qtyNode.textContent = String(next);
    const message = document.querySelector("[data-cart-message]");
    if (message) message.textContent = "";
    updateDetailOptionTotals();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeOrderCheckout();
    closeLineCheckout();
    closeCart();
    closeProductDetail();
  }
});

if (wishlistForm) {
  wishlistForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(wishlistForm);
    const wishTitle = String(data.get("wishTitle") || "").trim();
    const wishDetail = String(data.get("wishDetail") || "").trim();
    const image = data.get("wishImage");
    const imageNote = image && image.name ? `，示意圖「${image.name}」也已放進參考` : "";
    const title = wishTitle || "這個商品想法";
    const endpoint = window.MUWA_CONFIG?.wishlistEndpoint || "";
    const message = wishlistForm.querySelector(".form-message");

    if (!endpoint) {
      message.textContent = "表單端點尚未設定。請先到 config.js 填入 Google Apps Script Web App URL。";
      return;
    }

    message.textContent = "送出中...";

    try {
      const imageData = image && image.name ? await readFileAsDataUrl(image) : "";
      submitToGoogleScript(endpoint, {
        action: "wishlist",
        wishTitle: title,
        wishDetail,
        imageName: image && image.name ? image.name : "",
        imageData,
      });

      wishlistForm.reset();
      message.textContent = `${title} 已送出${imageNote}。請到 MUWA後台 的許願池分頁確認資料。`;
    } catch {
      message.textContent = "送出失敗，請稍後再試，或直接來信 muwa.to.sales@gmail.com。";
    }
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

loadProductFeed();
ensureCartButton();
updateCartButton();

function submitToGoogleScript(endpoint, payload) {
  const iframeName = `muwa_submit_${Date.now()}`;
  const iframe = document.createElement("iframe");
  iframe.name = iframeName;
  iframe.hidden = true;
  document.body.appendChild(iframe);

  const form = document.createElement("form");
  form.method = "POST";
  form.action = endpoint;
  form.target = iframeName;
  form.hidden = true;

  Object.entries(payload).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();

  window.setTimeout(() => {
    form.remove();
    iframe.remove();
  }, 5000);
}
