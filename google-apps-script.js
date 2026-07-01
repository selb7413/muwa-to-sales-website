const SHEET_ID = "1QIWrHcOOPjolKcVJeZ0nuzamnxJWT8dTGfj-DvP7_Ww";
const SHEET_NAME = "MUWA 商品許願池收件表";

function doPost(e) {
  let payload = {};

  try {
    payload = JSON.parse(e.postData.contents || "{}");
  } catch (error) {
    payload = e.parameter || {};
  }

  payload = Object.assign({}, e.parameter || {}, payload);
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);

  sheet.appendRow([
    new Date(),
    payload.wishTitle || "",
    payload.wishDetail || "",
    payload.imageName || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
