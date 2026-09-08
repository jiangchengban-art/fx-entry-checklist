/**
 * S62: エントリー足の根拠を「上位足ネックライン→5分足MA抜け→フィボ×ロールリバーサル」の
 *      3ステップ確認フローに置換
 *
 * テスト対象:
 * ① 上位足専用6項目（グランビル/RCI×3/MACD/ラウンドナンバー）はエントリー足列に出ない
 * ② エントリー足専用の新2項目（ネックライン形/5分足MA抜け）は上位足列に出ない
 * ③ 新2項目は上位足の方向（buy/sell）で選択肢が絞られる（gvCandidates と同じ規約）
 * ④ 方向未記録・レンジでは新2項目のセルが押せない（ダッシュ表示）
 * ⑤ 上位足の方向が反転する・上位足を選び直すと、もう成立しない記録は自動でクリアされる
 * ⑥ 確度スコアの分母が列ごとの実項目数になる（上位足8・エントリー足4）
 * ⑦ 既存項目（ロールリバーサル/エントリーFibo）は両列とも従来どおり出る
 */

import { chromium } from 'playwright';

const tests = [];
let pass = 0, fail = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function openPanel(page, pair, tfKey) {
  await page.evaluate(({ pair, tfKey }) => {
    const data = loadMarket();
    const w = data.pairs.find(p => p.pair === pair);
    w.trend = w.trend || {};
    w.trend[tfKey] = { state: 'up', zone: 'green', granville: '2', wpos: '39,68', at: new Date().toISOString() };
    w.trendAt = w.trend[tfKey].at;
    saveMarket(data);
  }, { pair, tfKey });
  await page.reload();
  await page.evaluate(() => setActiveTab('trend'));
  await page.waitForTimeout(150);
  await page.click(`.trend-item:has(.pair:text-is("${pair}")) [data-trend-panel-open][data-tf="${tfKey}"]`);
  await page.waitForTimeout(100);
}

test('①-1: 上位足専用項目（グランビル）はエントリー足列でダッシュ', async (page) => {
  const html = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'granville'), 'buy');
  });
  return html.includes('tp-na') ? 'PASS' : `FAIL: ${html}`;
});

test('①-2: 上位足専用項目（RCI短期）はエントリー足列でダッシュ', async (page) => {
  const html = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'rciShort'), 'buy');
  });
  return html.includes('tp-na') ? 'PASS' : `FAIL: ${html}`;
});

test('②: エントリー足専用の新項目は上位足列でダッシュ', async (page) => {
  const neckHtml = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfHigher', MV_TF_CHECKS.find(c => c.k === 'necklinePattern'), 'buy');
  });
  const maHtml = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfHigher', MV_TF_CHECKS.find(c => c.k === 'maBreak'), 'buy');
  });
  return neckHtml.includes('tp-na') && maHtml.includes('tp-na')
    ? 'PASS' : `FAIL: neck=${neckHtml}, ma=${maHtml}`;
});

test('③-1: 上昇側はネックライン形が「ダブルボトム/逆三尊」のみ', async (page) => {
  const vals = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const html = trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'necklinePattern'), 'buy');
    return [...html.matchAll(/data-value="([^"]+)"/g)].map(m => m[1]).filter(Boolean).sort();
  });
  const want = ['ダブルボトム', '逆三尊', '❌'].sort();
  return JSON.stringify(vals) === JSON.stringify(want) ? 'PASS' : `FAIL: got=${JSON.stringify(vals)}`;
});

test('③-2: 下降側はネックライン形が「ダブルトップ/三尊」のみ', async (page) => {
  const vals = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const html = trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'necklinePattern'), 'sell');
    return [...html.matchAll(/data-value="([^"]+)"/g)].map(m => m[1]).filter(Boolean).sort();
  });
  const want = ['ダブルトップ', '三尊', '❌'].sort();
  return JSON.stringify(vals) === JSON.stringify(want) ? 'PASS' : `FAIL: got=${JSON.stringify(vals)}`;
});

test('③-3: MA抜けは方向側の1択＋❌のみ（逆方向は出ない）', async (page) => {
  const buyVals = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    const html = trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'maBreak'), 'buy');
    return [...html.matchAll(/data-value="([^"]+)"/g)].map(m => m[1]).filter(Boolean).sort();
  });
  const want = ['上抜け', '❌'].sort();
  return JSON.stringify(buyVals) === JSON.stringify(want) ? 'PASS' : `FAIL: got=${JSON.stringify(buyVals)}`;
});

test('④: 方向未記録（side=null）では新項目セルが押せない', async (page) => {
  const html = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'necklinePattern'), null);
  });
  return html.includes('tp-na') && !html.includes('<button') ? 'PASS' : `FAIL: ${html}`;
});

test('⑤-1: UI操作で checksEntry.necklinePattern に記録される', async (page) => {
  await page.click('[data-trend-check-btn]:has-text("逆三尊")');
  await page.waitForTimeout(100);
  const v = await page.evaluate(() => loadMarket().pairs.find(p => p.pair === 'USDJPY').checksEntry.necklinePattern);
  return v === '逆三尊' ? 'PASS' : `FAIL: got=${v}`;
});

test('⑤-2: 上位足の方向反転で逆sideの記録が自動クリアされる', async (page) => {
  await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    mvWriteTrend(w.id, 'd', { state: 'down' });
  });
  const v = await page.evaluate(() => loadMarket().pairs.find(p => p.pair === 'USDJPY').checksEntry.necklinePattern);
  return v === '' ? 'PASS' : `FAIL: got=${v}`;
});

test('⑤-3: 上位足を別の足に選び直しても、その足の方向で自動クリアされる', async (page) => {
  await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    mvWriteTrend(w.id, 'd', { state: 'up' });
    mvSetTf(w.id, 'tfHigher', '日足');
    mvWriteCheck(w.id, 'tfEntry', 'necklinePattern', '逆三尊');
    mvWriteTrend(w.id, 'h4', { state: 'down' });
    mvSetTf(w.id, 'tfHigher', '4時間足');
  });
  const v = await page.evaluate(() => loadMarket().pairs.find(p => p.pair === 'USDJPY').checksEntry.necklinePattern);
  return v === '' ? 'PASS' : `FAIL: got=${v}`;
});

test('⑥: 確度スコアの分母は上位足8項目・エントリー足4項目', async (page) => {
  const counts = await page.evaluate(() => ({
    higher: MV_TF_CHECKS.filter(c => !c.legs || c.legs.indexOf('tfHigher') >= 0).length,
    entry: MV_TF_CHECKS.filter(c => !c.legs || c.legs.indexOf('tfEntry') >= 0).length,
  }));
  return counts.higher === 8 && counts.entry === 4
    ? 'PASS' : `FAIL: got=${JSON.stringify(counts)}`;
});

test('⑦: 既存項目（ロールリバーサル/エントリーFibo）は上位足・エントリー足の両方に出る', async (page) => {
  const rollHigher = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfHigher', MV_TF_CHECKS.find(c => c.k === 'rollReversal'), 'buy');
  });
  const rollEntry = await page.evaluate(() => {
    const w = loadMarket().pairs.find(p => p.pair === 'USDJPY');
    return trendCheckCell(w, 'tfEntry', MV_TF_CHECKS.find(c => c.k === 'rollReversal'), 'buy');
  });
  return !rollHigher.includes('tp-na') && !rollEntry.includes('tp-na')
    ? 'PASS' : `FAIL: higher=${rollHigher}, entry=${rollEntry}`;
});

// Run tests
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

  const indexPath = new URL(`file://${process.cwd()}/index.html`).href;
  await page.goto(indexPath);
  await page.waitForFunction(() => window.loadMarket !== undefined, { timeout: 5000 });

  await openPanel(page, 'USDJPY', 'd');

  for (const t of tests) {
    try {
      const result = await t.fn(page);
      if (result === 'PASS') {
        console.log(`✓ ${t.name}`);
        pass++;
      } else {
        console.log(`✗ ${t.name}: ${result}`);
        fail++;
      }
    } catch (e) {
      console.log(`✗ ${t.name}: ${e.message}`);
      fail++;
    }
  }

  await browser.close();
  console.log(`\n${pass}/${pass + fail} tests passed`);
  process.exit(fail > 0 ? 1 : 0);
})();
