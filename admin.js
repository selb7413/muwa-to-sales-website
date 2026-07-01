const PRODUCTS_KEY = "muwa-products";
const form = document.querySelector(".admin-form");
const list = document.querySelector(".admin-list");
const clearButton = document.querySelector('[data-action="clear"]');

function loadProducts() {
  try {
    return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveProducts(products) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file || !file.name) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function renderList() {
  const products = loadProducts();
  if (!products.length) {
    list.innerHTML = `<p class="empty-admin">目前沒有商品。新增後會出現在前台商品區。</p>`;
    return;
  }

  list.innerHTML = products
    .map(
      (product, index) => `
        <article class="admin-item">
          ${product.image ? `<img src="${product.image}" alt="" />` : `<div class="admin-thumb">MUWA</div>`}
          <div>
            <p>${escapeHtml(product.category || "全部")}</p>
            <h3>${escapeHtml(product.name)}</h3>
            <span>${escapeHtml(product.price || "未設定價格")}</span>
          </div>
          <button class="filter-button" type="button" data-delete="${index}">刪除</button>
        </article>
      `
    )
    .join("");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const image = await fileToDataUrl(data.get("image"));
  const products = loadProducts();

  products.unshift({
    id: Date.now(),
    name: String(data.get("name") || "").trim(),
    category: String(data.get("category") || "全部").trim(),
    price: String(data.get("price") || "").trim(),
    description: String(data.get("description") || "").trim(),
    link: String(data.get("link") || "").trim(),
    note: String(data.get("note") || "").trim(),
    image,
  });

  saveProducts(products);
  form.reset();
  form.querySelector(".form-message").textContent = "商品已新增。回到前台重新整理後，就會出現在商品區。";
  renderList();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  const index = Number(button.dataset.delete);
  const products = loadProducts();
  products.splice(index, 1);
  saveProducts(products);
  renderList();
});

clearButton.addEventListener("click", () => {
  saveProducts([]);
  renderList();
});

renderList();
