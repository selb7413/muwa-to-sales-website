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

商品狀態只有「補貨中」、「售完」、「現貨」。三種狀態都會出現在前台，並顯示狀態小字。售完商品封面呈淡灰色，不能開啟詳情。

舊資料的「上架」會相容顯示為「現貨」；既有草稿不會自動公開，編輯後選擇新狀態並儲存才會公開。

## 使用方式

- 打開 Web App URL：進入商品管理後台。
- 輸入管理密碼。
- 填商品名稱、價格、描述、購買連結。
- 上傳商品圖片。
- 選擇商品狀態，按「儲存商品」。
- 右側可切換「商品卡片／商品詳情」預覽；編輯完整描述、配送說明或評價時會自動切換對應分頁。
- 商品詳情的「直接結帳」會將選好的細項、規格、數量與加購品接到原有結帳流程。

## 2026-10-24 本機預覽與發布

此版本同時更新前台與 Apps Script 後台。開發時可依下列方式進行本機預覽，發布時兩者必須一併更新。

1. 在此專案根目錄執行 `python -m http.server 8765 --bind 127.0.0.1`。
2. 前台預覽：`http://127.0.0.1:8765/`。
3. 後台預覽：`http://127.0.0.1:8765/product-admin.html?preview=1`。此模式只在本機啟用，讀取公開商品，可編輯預覽，不能儲存或刪除正式商品。
4. 確認發布時，需同時更新 Apps Script 的 `Code.gs` 與 `product-admin` HTML、建立新版部署，再發布前台靜態檔。僅發布前台不會更新商品狀態資料來源。

## 注意

這是輕量版後台，不是完整會員登入系統。管理密碼不會出現在網站前台，但 Web App 後台網址仍建議不要公開貼出。

## 2026-10-24 訂單狀態通知（正式第 45 版）

- 請使用 `muwa.to.sales@gmail.com` 帳號部署及執行 `setupOrderNotificationWorkflow`。程式會檢查實際執行帳號，身分不符就停止寄信。
- 在「MUWA 訂單資料表」的 R 欄「通知狀態」選擇「已取消／已付款／已寄送」，會同步訂單狀態並寄送對應的 MUWA 小編通知。舊 C 欄訂單狀態操作仍相容。
- 選擇「已付款」時，Q 欄自動記錄首次對帳的台灣時間；重複選取不覆寫。
- U／S／T 分別保存付款／出貨／取消通知的寄送紀錄，各狀態只寄一次；V 欄是最後通知時間，W 欄是通知錯誤。寄送失敗時修正信箱或問題，再重新選取狀態重試。
- 不要清除寄送紀錄欄位，以免重複寄信。設定流程只遷移舊紀錄，不會寄送歷史訂單。
- 已安裝的編輯觸發器為 `handleOrderNotificationEdit_`，擁有者是 MUWA 帳號。
- `Web App URL?action=serviceStatus` 應顯示 `senderReady: true` 與 `notificationVersion: "20261024-v2"`。
- 驗證：`node tests/order-notification.cjs`（使用記憶體模擬，不寄真實郵件）。已另外取得授權寄三封狀態測試信，只寄至 MUWA 自己的信箱。
