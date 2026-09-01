import { chromium } from 'playwright';
import path from 'path';

const url = 'file://' + path.resolve('index.html').replace(/\\/g, '/');
const results = [];
const check = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log((cond ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ' :: ' + extra : ''));
};

/* 環境に置かれている Chromium が package.json の playwright と別ビルドのことがあるので、
   既定の探索に失敗したら実行ファイルを直接指す。 */
const browser = await chromium.launch().catch(() =>
  chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }));
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(url);

// 1. タブが6つ、環境タブが存在
const tabs = await page.$$eval('.tab-bar .tab-btn', els => els.map(e => e.dataset.tab));
check('タブが6つ・環境タブあり', tabs.length === 6 && tabs[0] === 'market', tabs.join(','));

// 2. 環境タブを開く → 空状態
await page.click('.tab-btn[data-tab="market"]');
check('環境パネルが表示', await page.isVisible('#tabPanel-market'));
check('空状態メッセージ', (await page.textContent('#mvList')).includes('監視する通貨ペアがまだありません'));

// 3. 監視ペアを追加
await page.selectOption('#mvAddPair', 'USD/JPY');
await page.waitForTimeout(150);
check('USD/JPY が追加された', (await page.textContent('#mvList')).includes('USD/JPY'));
check('未記録と表示', (await page.textContent('#mvList')).includes('未記録'));

// 4. 重複追加を拒否
await page.selectOption('#mvAddPair', 'USD/JPY');
await page.waitForTimeout(150);
const cards1 = await page.$$('.mv-card');
check('重複追加を拒否', cards1.length === 1, 'cards=' + cards1.length);

// 5. 自由入力でペア追加
await page.selectOption('#mvAddPair', '__custom__');
await page.fill('#mvAddPairCustom', 'CAD/JPY');
await page.click('#mvAddPairCustomOk');
await page.waitForTimeout(150);
check('自由入力ペア追加', (await page.textContent('#mvList')).includes('CAD/JPY'));

// 6. 記録モーダルを開く
await page.click('[data-mv-record="USD/JPY"]');
await page.waitForTimeout(200);
check('モーダル表示', await page.isVisible('#mvModal'));
check('3時間足の入力行', (await page.$$('#mvModalRows .mv-edit-row')).length === 3);

// 7. 状態を選択（週足=上昇、日足=レンジ、4H=下降）
await page.click('.mv-edit-row[data-tf="w"] button[data-state="up"]');
await page.click('.mv-edit-row[data-tf="d"] button[data-state="range"]');
await page.click('.mv-edit-row[data-tf="h4"] button[data-state="down"]');
await page.fill('.mv-edit-row[data-tf="w"] input.memo', '高値切り上げ継続');
check('3つとも選択状態', (await page.$$('#mvModalRows button.on')).length === 3);

// 8. トグル解除できる
await page.click('.mv-edit-row[data-tf="h4"] button[data-state="down"]');
check('再クリックで未選択に戻る', (await page.$$('#mvModalRows button.on')).length === 2);
await page.click('.mv-edit-row[data-tf="h4"] button[data-state="down"]');

// 9. AI分析を入力して保存
await page.fill('#mvAiText', 'AI分析: 週足は上昇継続、日足は調整レンジ。');
await page.click('#mvSave');
await page.waitForTimeout(250);
check('モーダルが閉じた', !(await page.isVisible('#mvModal')));
const body1 = await page.textContent('#mvList');
check('週足=上昇が表示', body1.includes('▲ 上昇'));
check('日足=レンジが表示', body1.includes('▬ レンジ'));
check('4時間足=下降が表示', body1.includes('▼ 下降'));
check('メモが表示', body1.includes('高値切り上げ継続'));
check('AI分析が表示', body1.includes('AI分析: 週足は上昇継続'));

// 10. 2回目の記録 → 履歴が出る
await page.click('[data-mv-record="USD/JPY"]');
await page.waitForTimeout(200);
check('前回値が引き継がれる', (await page.$$('#mvModalRows button.on')).length === 3);
await page.click('.mv-edit-row[data-tf="d"] button[data-state="up"]');
await page.click('#mvSave');
await page.waitForTimeout(250);
const body2 = await page.textContent('#mvList');
check('履歴セクションが出現', body2.includes('過去の見立て（1件）'));

// 11. 空保存を拒否
await page.click('[data-mv-record="CAD/JPY"]');
await page.waitForTimeout(200);
await page.click('#mvSave');
await page.waitForTimeout(250);
check('空保存を拒否（モーダル継続）', await page.isVisible('#mvModal'));
await page.click('#mvCancel');
await page.waitForTimeout(150);

// 12. localStorage の分離
const keys = await page.evaluate(() => Object.keys(localStorage));
check('専用キーで保存', keys.includes('mochipoyo_market_view_v1'), keys.join(','));
const mv = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')));
check('スナップショット2件', mv.snapshots.length === 2, 'n=' + mv.snapshots.length);
check('監視ペア2件', mv.pairs.length === 2);

// 13. リロードで永続化
await page.reload();
await page.waitForTimeout(300);
check('リロード後も環境タブが復元', await page.isVisible('#tabPanel-market'));
check('リロード後もデータ保持', (await page.textContent('#mvList')).includes('高値切り上げ継続'));

// 14. AIプロンプト生成
await page.click('[data-mv-record="USD/JPY"]');
await page.waitForTimeout(200);
const prompt = await page.evaluate(() => buildAiPrompt('USD/JPY', readMvModal()));
check('プロンプトにペア名', prompt.includes('USD/JPY'));
check('プロンプトに自分の見立て', prompt.includes('週足：上昇') && prompt.includes('高値切り上げ継続'));
await page.click('#mvCancel');
await page.waitForTimeout(150);

// 15. 履歴1件削除
await page.click('.mv-history summary');
await page.waitForTimeout(150);
await page.click('[data-mv-del-snap]');
await page.waitForTimeout(250);
const mv2 = await page.evaluate(() => JSON.parse(localStorage.getItem('mochipoyo_market_view_v1')));
check('履歴1件削除', mv2.snapshots.length === 1, 'n=' + mv2.snapshots.length);

// 16. 監視解除
await page.click('[data-mv-del-pair="CAD/JPY"]');
await page.waitForTimeout(200);
check('削除確認モーダル', await page.isVisible('#mvDeleteModal'));
await page.click('#mvDeleteConfirm');
await page.waitForTimeout(250);
check('CAD/JPY が消えた', !(await page.textContent('#mvList')).includes('CAD/JPY'));

// 17. 既存機能が壊れていない
await page.click('.tab-btn[data-tab="checklist"]');
await page.waitForTimeout(150);
check('チェックタブ動作', await page.isVisible('#tabPanel-checklist'));
check('チェック項目15件', (await page.$$('#checklist li[data-idx]')).length === 15);
await page.click('.tab-btn[data-tab="stats"]');
await page.waitForTimeout(150);
check('統計タブ動作', await page.isVisible('#tabPanel-stats'));
await page.click('.tab-btn[data-tab="guide"]');
await page.waitForTimeout(150);
check('解説タブ動作', await page.isVisible('#tabPanel-guide'));
await page.click('.tab-btn[data-tab="list"]');
await page.waitForTimeout(150);
check('履歴タブ動作', await page.isVisible('#tabPanel-list'));

check('JSエラーなし', errors.length === 0, errors.join(' | '));

await page.click('.tab-btn[data-tab="market"]');
await page.waitForTimeout(200);
await page.screenshot({ path: 'screenshots/session12-market.png', fullPage: true });

await browser.close();
const failed = results.filter(r => !r.ok);
console.log('\n=== ' + (results.length - failed.length) + '/' + results.length + ' PASS ===');
if (failed.length) { failed.forEach(f => console.log('  FAILED: ' + f.name + ' ' + f.extra)); process.exit(1); }
