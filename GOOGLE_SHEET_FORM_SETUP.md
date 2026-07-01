# MUWA 商品許願池表單連接設定

Google Sheet 已建立：

https://docs.google.com/spreadsheets/d/1QIWrHcOOPjolKcVJeZ0nuzamnxJWT8dTGfj-DvP7_Ww/edit

## 部署步驟

1. 打開 Google Sheet。
2. 點選「擴充功能」→「Apps Script」。
3. 把 `google-apps-script.js` 的內容貼進 Apps Script。
4. 點「部署」→「新增部署作業」。
5. 類型選「網頁應用程式」。
6. 執行身分選「我」。
7. 存取權選「任何人」。
8. 部署後複製 Web App URL。
9. 回到 `config.js`，把 `wishlistEndpoint` 改成該 URL。

完成後，網站的「商品許願池」就會把送出時間、許願商品、想法內容、示意圖檔名送進 Google Sheet。

目前圖片欄位只會送出檔名；若要真的收圖檔，建議改用 Google Form 或接雲端上傳。
