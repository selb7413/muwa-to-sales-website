const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','apps-script-product-admin.gs'),'utf8');
const headers=['建立時間','訂單編號','狀態','姓名','手機','電子信箱','運送方式','運費','宅配地址','超商','門市名稱','門市店號','轉帳帳戶末5碼','訂單內容','商品小計','應付總額','對帳時間','通知狀態','出貨通知狀態','取消通知狀態','付款通知狀態','最後通知時間','通知錯誤'];
let identity='muwa.to.sales@gmail.com',failSend=false,locked=false,created=0;
const sent=[],props={},checks=[];
const sb={console,DriveApp:{getRootFolder:()=>({getOwner:()=>({getEmail:()=>identity})})},GmailApp:{sendEmail:(...args)=>{if(failSend)throw Error('模擬寄信失敗');sent.push(args);}},Utilities:{formatDate:(date,tz,pattern)=>{assert.equal(tz,'Asia/Taipei');assert.equal(pattern,'yyyy/MM/dd HH:mm:ss');return '2026/10/24 15:00:00';}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperty:(k,v)=>{props[k]=v;}})},LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(locked,false);locked=true;},releaseLock:()=>{locked=false;}})},ScriptApp:{getProjectTriggers:()=>[],newTrigger:()=>({forSpreadsheet(){return this;},onEdit(){return this;},create(){created++;}})},SpreadsheetApp:{openById:()=>({}),newDataValidation:()=>({requireValueInList(options,show){this.options=Array.from(options);assert.equal(show,true);return this;},setAllowInvalid(v){assert.equal(v,false);return this;},build(){return {options:this.options};}})}};
vm.createContext(sb);vm.runInContext(source,sb);
function pass(name){checks.push(name);console.log('PASS '+name);}
function makeSheet(rows){
 const values=[headers.slice(),...rows.map(row=>headers.map(h=>row[h]??''))],validations=[];
 const sheet={values,validations,getName:()=> 'MUWA 訂單資料表',getLastColumn:()=>headers.length,getMaxRows:()=>1000,getDataRange:()=>({getValues:()=>values.map(r=>r.slice())}),setColumnWidth:()=>{},getRange(r,c,height=1,width=1){return {getValue:()=>values[r-1]?.[c-1]??'',getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>values[r+i-1]?.[c+j-1]??'')),setValue(v){while(values.length<r)values.push([]);values[r-1][c-1]=v;return this;},setNumberFormat(){return this;},setNote(){return this;},setDataValidation(rule){validations.push({r,c,height,width,rule});return this;},clearContent(){values[r-1][c-1]='';return this;},getSheet:()=>sheet,getRow:()=>r,getLastRow:()=>r+height-1,getColumn:()=>c,getLastColumn:()=>c+width-1};}};
 return sheet;
}
const row={'訂單編號':'TEST-001','狀態':'待對帳','姓名':'測試顧客','電子信箱':'customer@example.invalid','運送方式':'7-11 店到店','應付總額':699};
let sheet=makeSheet([row]);
const col=h=>headers.indexOf(h)+1,val=(h,r=2)=>sheet.values[r-1][col(h)-1];
identity='private@example.invalid';
assert.throws(()=>sb.sendMuwaEmail_('customer@example.invalid','subject','body'),/寄件身分不符/);assert.equal(sent.length,0);
assert.throws(()=>sb.createOrder_({}),/寄件身分不符/);assert.throws(()=>sb.createWishlist_({}),/寄件身分不符/);
sb.handleOrderNotificationEdit_({range:sheet.getRange(2,col('通知狀態'))});assert.equal(val('狀態'),'待對帳');pass('私人或未知帳號不寄信，也不能新增需通知的訂單');
identity='muwa.to.sales@gmail.com';
sb.processOrderNotification_(sheet,2,'已付款');assert.equal(val('狀態'),'對帳成功');assert.equal(val('通知狀態'),'已付款');assert.equal(val('對帳時間'),'2026/10/24 15:00:00');assert.equal(val('付款通知狀態'),'已寄送');assert.equal(val('最後通知時間'),'2026/10/24 15:00:00');
assert.equal(sent.length,1);assert.equal(sent[0][3].replyTo,'muwa.to.sales@gmail.com');assert.equal(sent[0][3].from,undefined);assert.match(sent[0][1],/款項收到了/);assert.match(sent[0][2],/NT\$699/);assert.ok(sent[0][2].includes(String.fromCodePoint(0x1F337)));pass('已付款填入台灣對帳時間，實際 Gmail 身分與回覆地址固定為 MUWA');
sheet.values[1][col('對帳時間')-1]='既有對帳時間';sb.processOrderNotification_(sheet,2,'已付款');assert.equal(sent.length,1);assert.equal(val('對帳時間'),'既有對帳時間');pass('重複選已付款不重寄，不覆蓋原對帳時間');
sb.processOrderNotification_(sheet,2,'已寄送');sb.processOrderNotification_(sheet,2,'已寄送');assert.equal(sent.length,2);assert.equal(val('出貨通知狀態'),'已寄送');assert.equal(val('狀態'),'已出貨');assert.match(sent[1][2],/到店通知/);pass('出貨通知獨立記錄，只寄一次並帶入配送方式');
sb.processOrderNotification_(sheet,2,'已取消');sb.processOrderNotification_(sheet,2,'已取消');assert.equal(sent.length,3);assert.equal(val('取消通知狀態'),'已寄送');assert.equal(val('狀態'),'取消');assert.match(sent[2][2],/若這筆訂單已完成付款/);pass('取消通知只寄一次，付款後取消不承諾自動退款');
sheet=makeSheet([{...row,'電子信箱':''}]);assert.throws(()=>sb.processOrderNotification_(sheet,2,'已付款'),/電子信箱/);assert.equal(val('付款通知狀態'),'');assert.match(val('通知錯誤'),/電子信箱/);pass('缺少顧客信箱不標記成功，留下錯誤供修正');
sheet=makeSheet([row]);failSend=true;assert.throws(()=>sb.processOrderNotification_(sheet,2,'已付款'),/模擬寄信失敗/);assert.equal(val('付款通知狀態'),'');failSend=false;sb.processOrderNotification_(sheet,2,'已付款');assert.equal(val('通知錯誤'),'');assert.equal(val('付款通知狀態'),'已寄送');pass('寄信失敗保留重試機會，成功後清除錯誤');
sheet=makeSheet([{...row,'狀態':'對帳成功','通知狀態':'已寄送','對帳時間':'2026.08.10'}]);const before=sent.length;
assert.equal(sb.migrateLegacyNotificationRecords_(sheet),1);assert.equal(val('通知狀態'),'已付款');assert.equal(val('付款通知狀態'),'已寄送');assert.equal(val('對帳時間'),'2026.08.10');assert.equal(sb.migrateLegacyNotificationRecords_(sheet),0);assert.equal(sent.length,before);sb.processOrderNotification_(sheet,2,'已付款');assert.equal(sent.length,before);pass('舊已寄信標記移到付款紀錄，不誤判出貨、不重寄歷史訂單');
sb.applyOrderStatusDropdown_(sheet);assert.deepEqual(sheet.validations.find(v=>v.c===col('通知狀態')).rule.options,['已取消','已付款','已寄送']);pass('通知狀態下拉選單恰為三種選項');
sheet=makeSheet([row]);sheet.values[1][col('通知狀態')-1]='已寄送';sb.handleOrderNotificationEdit_({range:sheet.getRange(2,col('通知狀態'))});assert.equal(val('狀態'),'已出貨');assert.equal(val('出貨通知狀態'),'已寄送');pass('真正編輯事件依通知欄觸發，舊訂單狀態同步');
sheet=makeSheet([row]);sb.handleOrderNotificationEdit_({range:sheet.getRange(2,col('姓名'))});assert.equal(val('狀態'),'待對帳');pass('編輯姓名或其他欄位不觸發寄信');
sb.getOrderSheet_=()=>sheet;sb.setupOrderNotificationWorkflow();assert.equal(created,1);assert.equal(locked,false);pass('設定流程建立 MUWA 編輯觸發器，不寄送歷史通知');
assert.throws(()=>sb.sendPaidOrderEmails(),/停用/);pass('阻止歷史訂單批次寄信');
console.log('All '+checks.length+' checks passed; no real email was sent.');
