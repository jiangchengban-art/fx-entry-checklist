import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

// S78: Firebase Storage 画像保存の実運用化（匿名認証・圧縮・アップロード中ガード・テストアップロード・サムネイル）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = 'file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/');

let browser;
try { browser = await chromium.launch(); }
catch { browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); }
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => {
  // アップロード失敗系テストで意図的に出す console.error は除外
  if (msg.type() === 'error' && !/upload:|auth:|noBucket|Failed to load resource/.test(msg.text())) errors.push(msg.text());
});

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('OK  ', name); } else { fail++; console.log('FAIL', name); } };

// ---- Firebase REST をモック ----
const calls = { signUp: 0, upload: [] };
let uploadStatus = 200;
let uploadDelay = 0;
await page.route('https://identitytoolkit.googleapis.com/**', route => {
  calls.signUp++;
  route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ localId: 'uidABC', idToken: 'tok123', refreshToken: 'ref', expiresIn: '3600' }) });
});
await page.route('https://firebasestorage.googleapis.com/**', async route => {
  const req = route.request();
  calls.upload.push({ url: req.url(), auth: req.headers()['authorization'], type: req.headers()['content-type'], size: (req.postDataBuffer() || []).length });
  if (uploadDelay) await new Promise(r => setTimeout(r, uploadDelay));
  route.fulfill({ status: uploadStatus, contentType: 'application/json', body: JSON.stringify({ downloadTokens: 'dl1' }) });
});

await page.goto(filePath);
await page.waitForSelector('#trendSearchInput');

// 1. 設定UI
check('テストアップロードボタンがある', !!(await page.$('#fbTestUpload')));
check('fbStatus 表示欄がある', !!(await page.$('#fbStatus')));

// 2. 未設定でテスト → 案内
await page.evaluate(() => localStorage.removeItem('mochipoyo_firebase_config_v1'));
await page.evaluate(() => document.getElementById('fbTestUpload').click());
await page.waitForTimeout(100);
check('未設定時は bucket 入力を促す', (await page.textContent('#fbStatus')).includes('bucket'));

// 3. 設定してテストアップロード成功
await page.evaluate(() => localStorage.setItem('mochipoyo_firebase_config_v1', JSON.stringify({ bucket: 'demo.firebasestorage.app', apiKey: 'AIzaTEST' })));
await page.evaluate(() => document.getElementById('fbTestUpload').click());
await page.waitForFunction(() => /✅|❌/.test(document.getElementById('fbStatus').textContent));
check('テストアップロード成功表示', (await page.textContent('#fbStatus')).includes('✅'));
check('匿名サインアップが1回呼ばれた', calls.signUp === 1);
check('Authorization: Firebase <idToken> が付く', calls.upload[0] && calls.upload[0].auth === 'Firebase tok123');
check('保存パスが chart-images/{uid}/ 配下', calls.upload[0] && decodeURIComponent(calls.upload[0].url).includes('chart-images/uidABC/'));

// 4. トークンを使い回す（2回目はサインアップしない）
await page.evaluate(() => document.getElementById('fbTestUpload').click());
await page.waitForTimeout(300);
check('有効期限内はトークン再利用', calls.signUp === 1);

// 5. 認証情報は JSON バックアップから除外
check('BACKUP_SKIP が firebase_auth を除外', await page.evaluate(() => BACKUP_SKIP.test('mochipoyo_firebase_auth_v1')));

// 6. 圧縮：大きな画像は長辺1600px以下・元より小さく
const comp = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 3000; c.height = 2000;
  const g = c.getContext('2d');
  for (let i = 0; i < 4000; i++) { g.fillStyle = `hsl(${i % 360},70%,50%)`; g.fillRect(Math.random() * 3000, Math.random() * 2000, 40, 40); }
  const src = await new Promise(r => c.toBlob(r, 'image/png'));
  const file = new File([src], 'big.png', { type: 'image/png' });
  const out = await compressImage(file);
  const bmp = await createImageBitmap(out);
  return { inSize: file.size, outSize: out.size, w: bmp.width, h: bmp.height, type: out.type };
});
check('圧縮後は長辺1600px', Math.max(comp.w, comp.h) === 1600);
check('圧縮後はサイズが小さい', comp.outSize < comp.inSize);
check('WebP か JPEG に変換', /image\/(webp|jpeg)/.test(comp.type));

// 7. 失敗時のメッセージ
uploadStatus = 403;
await page.evaluate(() => document.getElementById('fbTestUpload').click());
await page.waitForFunction(() => document.getElementById('fbStatus').textContent.includes('❌'));
check('403 はルール確認を案内', (await page.textContent('#fbStatus')).includes('ルール'));
uploadStatus = 200;

// 8. アップロード中は保存をブロック
uploadDelay = 800;
const blocked = await page.evaluate(async () => {
  const input = document.getElementById('fImgEntry');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([1, 2, 3])], 'x.bin', { type: 'application/octet-stream' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  await new Promise(r => setTimeout(r, 100));
  const during = { count: imgUploading, label: document.getElementById('fImgEntryPreview').textContent };
  let saved = false;
  const orig = window.doSave; window.doSave = () => { saved = true; };
  tradeTypeState = tradeTypeState || 'test';
  document.getElementById('tradeForm').requestSubmit();
  window.doSave = orig;
  return { ...during, saved };
});
check('アップロード中カウント>0', blocked.count > 0);
check('アップロード中表示が出る', blocked.label.includes('アップロード中'));
await page.waitForFunction(() => imgUploading === 0);
check('完了後にURLがフォームに入る', await page.evaluate(() => formImages.entry.includes('chart-images')));
check('完了後はアップロード中表示が消える', !(await page.textContent('#fImgEntryPreview')).includes('アップロード中'));
uploadDelay = 0;

// 9. 履歴サムネイルは <img loading=lazy>
const thumb = await page.evaluate(() => imageThumbsHtml({ entry: 'https://x/a.webp', higher: '', others: ['https://x/b.webp'] }));
check('サムネイルが img 要素', (thumb.match(/<img /g) || []).length === 2 && thumb.includes('loading="lazy"'));

console.log(`\n${pass} passed, ${fail} failed`);
console.log('Console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
