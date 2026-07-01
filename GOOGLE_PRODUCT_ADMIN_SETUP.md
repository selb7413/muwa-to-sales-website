# MUWA 商品後台設定

這一版用 Google Sheet 當商品資料庫，Google Apps Script 當商品管理後台。後台可以直接上傳圖片，圖片會存到 Google Drive 的 `MUWA 商品圖片` 資料夾。

## 目前已建立

- 商品資料表：<https://docs.google.com/spreadsheets/d/1-_Tv649zg_o9ABnKAE7_xbFYIAdxJILD5S1JjHMlE90/edit>
- 後台程式：`apps-script-product-admin.gs`
- 後台畫面：`product-admin.html`

## 第一次設定

1. 打開商品資料表。
2. 點「擴充功能」→「Apps Script」。
3. 把 `apps-script-product-admin.gs` 的內容貼到 `Code.gs`。
4. 在 Apps Script 左側新增 HTML 檔案，檔名一定要叫 `product-admin`。
5. 把 `product-admin.html` 的內容貼進 `product-admin.html`。
6. 在 `Code.gs` 最上方修改 `ADMIN_KEY`，換成你自己的管理密碼。
7. 點「部署」→「新增部署作業」→ 類型選「網頁應用程式」。
8. 執行身分選「我」，存取權選「任何人」。
9. 部署後複製 Web App URL。

## 讓前台讀到商品

把 Web App URL 貼到 `config.js`：

```js
productFeedUrl: "你的 Web App URL",
```

之後只要後台新增商品，狀態是「上架」，網站商品區就會自動讀到。

## 使用方式

- 打開 Web App URL：進入商品管理後台。
- 輸入管理密碼。
- 填商品名稱、價格、描述、購買連結。
- 上傳商品圖片。
- 狀態選「上架」才會出現在網站前台。

## 注意

這是輕量版後台，不是完整會員登入系統。管理密碼不會出現在網站前台，但 Web App 後台網址仍建議不要公開貼出。
