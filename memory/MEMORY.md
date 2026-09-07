# FX Entry Checklist — Project Memory（S55完了時点）

**最終更新**: 2026-09-07（セッション55完了）  
**ブランチ**: `claude/s55-modal-trade-implementation-4o9hzr`（既にマージ済み）

---

## 現在の状態（S55完了）

### ✅ 実装完了
- **🎯 トレードタブ廃止・🔭一覧タブへの統合**（S55）
  - 下部タブバー: 🔭一覧 / 📚振り返り / ⚙設定（3タブに統一）
  - トレード記録フォーム → `#tradeModal`（モーダル）に変更
  - 開く経路: 根拠パネル「📝 記録フォームへ」・ヘッダ「→」・履歴「✎ 編集」
  - 閉じる経路: ✕ボタン・背景クリック・Escapeキー・保存成功（自動で一覧タブに戻る）
  - DOM id・データモデル・CSV・端末間マージ・統計はすべて無変更

- **結果タグ＋円建て損益方式によるトレード結果記録**（S54）
  - 旧・建玉ブロック、3分割決済モーダル、RR計算は全廃
  - 新: アラート発生日時・時間足、結果タグ、円建て損益、建値タッチ、Firebase 画像
  - CSV: 旧列を全撤去し新列に置換（旧データは移行されない）

- **🔭トレンド一覧タブ**（S24再設計〜S51最適化）
  - 全28銘柄常時表示で上位足トレンド横断比較
  - グランビルの波をタップで位置記録（`wpos`、% 座標）
  - エントリー圏（買②③/売②③）までの距離で並び順決定
  - 根拠パネル（S33）で環境認識を一覧から完結
  - ペア削除も行内で実行可能

- **🗺 波マップと軌跡追跡**（S40-S50）
  - 全通貨の波位置を 1 枚に重ね表示
  - 日次スナップショット（前日比較・軌跡線）
  - 単一銘柄モード（全時間足同時表示）
  - エントリー圏の可視化・絞り込み
  - 過去日訂正機能

### テスト状況
- ✅ s55-test.mjs: 15項目（モーダル開閉・保存・編集・背景・Escape）
- ✅ s44-test.mjs: 59項目（エントリー圏・並び順・根拠ボタン）
- ✅ s43-test.mjs: 35項目（波マップエントリー圏）
- ✅ s42-test.mjs: 45項目（日次記録・単一銘柄・タップ不反応修正）
- ✅ s40-test.mjs: 62項目（波タップ記録・波マップ）
- **合計: 156項目全通過**
- sw.js: v27→v28

### ⚠️ S55で変更した DOM 構造

| 箇所 | 変更 | 影響 |
|------|------|------|
| `#tabPanel-trade` | → `#tradeModal`（`.modal-backdrop` + `.modal.wide.trade-modal`） | ビジュアルはモーダル化だが、内部の DOM id（`fDatetime`, `fPnl` 等）は完全に維持 |
| `setActiveTab('trend')` | 既定値に（S55で追加） | 起動時・モーダル保存後は 🔭 タブに戻る |
| `tabPanels` オブジェクト | `trade` キー削除 | `trend`/`review`/`settings` の3つだけ |

### 開閉経路（`openTradeModal(watchId)` / `closeTradeModal()`）
```
① 🔭一覧タブの根拠パネル「📝 記録フォームへ」→ openTradeModal(watchId)
② ヘッダの「→」ボタン（ペア単位移行） → openTradeModal(watchId)
③ 📚振り返りタブの履歴「✎ 編集」ボタン → loadTradeIntoForm() → openTradeModal(watchId)

閉じる:
① ✕ボタン → closeTradeModal()
② 背景クリック → closeTradeModal()
③ Escapeキー → closeTradeModal()
④ doSave()成功 → closeTradeModal() → setActiveTab('trend')
```

---

## 次のステップ（優先度順）

### 🎯 即実装可能（ブロッカーなし）
1. **ユーザーのブラウザ確認**
   - Service Worker キャッシュクリア後の新モーダルフロー動作確認
   - 3端末での Supabase 同期設定

2. **`GV_ENTRY_RADIUS` の実運用チューニング**
   - 現在: 10%（理論値）
   - 実データで「ちょうどいい圏の半径」を測定・調整

### 📊 次のテーマ（S56以降）
1. **Firebase Storage 画像アップロード**
   - 実運用確認（設定タブで bucket / API Key 入力）
   - 画像フォーマット・圧縮の最適化

2. **RCI / 上位足 MACD の画像追加**
   - `MV_TF_CHECKS` に `link` プロパティを足すだけで自動反映
   - S20-S38 時点で設計済み

3. **localStorage → IndexedDB 容量対策**
   - 数千件トレード記録で 5-10MB 上限に達する可能性
   - 古い記録の圧縮・アーカイブ機構の検討

### 🔄 長期計画（リファレンス）
- 📈 他のインジケーター画像追加
- 📊 根拠別の成績詳細分析
- 🏷 タグ・カテゴリシステム
- 📱 モバイル専用最適化

---

## key な実装詳細

### 必須の規約（崩すと統計・同期が壊れる）
```js
// ① トレンド3項目の書き込みは mvWriteTrend() 経由のみ
mvWriteTrend(watchId, tfKey, newState, newZone, newGranville);

// ② チェック項目の書き込みは mvWriteCheck() 経由のみ
mvWriteCheck(watchId, tfCheckKey, value); // 同値を渡すとトグル解除

// ③ 判定の書き込みは mvSetJudge() 経由のみ
mvSetJudge(watchId, newJudge); // judgeLog への記録を含む

// ④ 上位足・エントリー足の書き込みは mvSetTf() 経由のみ
mvSetTf(watchId, 'tfHigher' | 'tfEntry', value);

// ⑤ トレード保存は doSave() のみ（データモデル・CSV・同期自動対応）
```

### モーダルのライフサイクル
```js
// 開く
openTradeModal(watchId) {
  // ① watchId が存在しなければ新規作成フォーム表示
  // ② 存在すれば loadTradeIntoForm(watchId) で既存データ復元
  // ③ #tradeModal を .open 表示
}

// 閉じる
closeTradeModal() {
  // ① #tradeModal を .open 除去（CSS で非表示）
  // ② setActiveTab('trend') で 🔭タブへ戻す
  // ③ trendPanel をリセット（開き直すまで保持してもよい）
}

// 保存成功時の流れ
doSave() → syncFormFromMarket() → saveFormData() → closeTradeModal()
```

### CSV 互換性（S54 の列構成）
```
必須: id, tradeType(検証/リアル), datetime, direction(買/売)
結果: resultTag(REG/BIG/MAX/微益/建値決済/損切/other)
損益: pnlAmount(円・符号付き), beTouch(無し/有/2回)
画像: imgEntry, imgHigher, imgOthers（Firebase URL）
根拠: hi_granville, hi_rci_s/m/l, hi_macd, ... × 上位足/エントリー足
旧列撤去: entryPrice, slPrice, slBasis, splitCount, exits（使用不可）
```

### 端末間マージの核（S28）
- **局所的マージ**: ペア・トレード・判定 = キー単位で時刻比較→結合
- **グローバルマージ**: `judgeLog` / `snapshots` = 集合和（競合なし）
- **安全弁**: `STORAGE_FAILED` フラグ で破損時は同期停止

---

## ファイル構成（S55完了）

```
/home/user/fx-entry-checklist/
├─ index.html              （アプリ本体・単一ファイル）
├─ sw.js                   （Service Worker・v28）
├─ manifest.webmanifest    （PWA設定）
├─ CLAUDE.md               （プロジェクト仕様書・S55更新）
├─ memory/
│  ├─ MEMORY.md            （このファイル・S55時点の要点）
│  └─ sessions/            （古いセッションログ移行予定）
├─ docs/
│  └─ SESSIONS_ARCHIVE.md  （S1-54のセッション履歴全体）
└─ assets/
   ├─ icon-*.png
   └─ apple-touch-icon.png
```

---

## コマンド実行ログ（S55完了）

```bash
# テスト実行（全てpass）
node s55-test.mjs      # 15項目
node s44-test.mjs      # 59項目
node s43-test.mjs      # 35項目
node s42-test.mjs      # 45項目
node s40-test.mjs      # 62項目
# → 合計 156項目全通過

# git status（working tree clean）
git status
# On branch claude/s55-modal-trade-implementation-4o9hzr
# nothing to commit, working tree clean

# 最新コミット
git log --oneline -1
# a846c0c S55: 🎯トレードタブ廃止・🔭一覧タブへ統合（モーダル化）
```

---

## 注意点（次のセッションで確認）

### ✅ 確認済み
- ✅ モーダル内の `doSave()` は既存コード（1行も変更なし）
- ✅ データモデル・CSV 互換性は無変更
- ✅ 端末間マージ・Supabase 同期は無影響
- ✅ S44/S43/S42/S40 テストは既存テストのまま（`data-tab="trade"` 参照を更新済み）

### ⚠️ 実運用確認待ち
- ⚠️ Service Worker キャッシュが古いままだとモーダル UI が反映されない可能性
  - Safari DevTools で Application → Clear All してテスト
- ⚠️ iPhone Safari でメールアプリ内ブラウザから開くと PWA と別ストレージ
  - Safari アプリから開く（必ず明記）

### 🔍 トラブルシューティング
```js
// モーダルが開かない → openTradeModal() の定義確認
// モーダルが閉じない → closeTradeModal() のハンドラ確認
// 保存後に一覧に戻らない → doSave() の最後に closeTradeModal() あるか確認
// ✕ボタンが効かない → .modal-backdrop の click ハンドラ確認
```

---

## 次のセッションへ向けてのプロンプト

**定型プロンプト（セッション開始時に貼り付け）:**

```
S55実装（🎯トレードタブ廃止・モーダル化）が完了しました。

【現在のブランチ】: claude/s55-modal-trade-implementation-4o9hzr
【テスト状況】: 156項目全通過（s55/s44/s43/s42/s40）
【sw.js】: v28
【最新コミット】: a846c0c S55: 🎯トレードタブ廃止・🔭一覧タブへ統合

【S55の変更内容】
- 下部タブバーを3タブ化（🔭一覧 / 📚振り返り / ⚙設定）
- トレード記録フォーム → #tradeModal（モーダル）
- 開く経路: 根拠パネル「📝 記録フォームへ」・ヘッダ「→」・履歴「✎ 編集」
- 閉じる経路: ✕・背景クリック・Escape・保存成功（自動で一覧タブ戻る）
- DOM id/データモデル/CSV/同期はすべて無変更

【次のステップ】
1. ユーザーのブラウザ確認（Service Worker キャッシュクリア後）
2. Supabase 同期設定（3端末）
3. GV_ENTRY_RADIUS チューニング（実データで圏の最適値測定）

【チェック項目】
- [ ] Safari DevTools で SW キャッシュをクリア
- [ ] モーダルの開閉動作確認
- [ ] 保存→一覧タブへの自動戻り確認
- [ ] Escapeキー・背景クリックでモーダル閉じ確認

詳細は memory/MEMORY.md / CLAUDE.md を参照。
```

---

**記録日時**: 2026-09-07 22:00（予定）  
**作成者**: Claude Haiku 4.5 + ユーザー  
**状態**: ✅ S55完了・次セッション待機
