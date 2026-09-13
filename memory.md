# FX Entry Checklist — Project Memory & Session Log

**Last Updated:** 2026-09-13 (S75 complete)  
**Current State:** ✅ Production-ready (S75: 上位足RCIの選択肢をトレンド方向で自動絞り込み完了). s62テストは S63/S65 定義変更に対応済み  
**Main Branch:** `master`  
**Active Development Branch:** none — S75 merged to master, ready for S76

## Project Health

| Aspect | Status | Notes |
|--------|--------|-------|
| Core Features | ✅ Complete | 🔭一覧・📚統計・⚙設定の3タブ完成 |
| Testing | ✅ Passing | s62(48, pre-S63/S65 definitions — needs update)+s44(64)+s43(35)+s42(45)+s60(17)+s59(31)+s55(15) all green. S63/S64/S65 verified via ad-hoc Playwright smoke tests only (no dedicated test files yet). s40 has 2 known pre-existing failures (see Known Issues) |
| Data Model | ✅ Stable | localStorage `mochipoyo_*_v1` keys, Supabase JSONB sync |
| Accessibility | ✅ OK | PWA-capable, iOS/Android responsive, dark/light theme |
| Performance | ✅ OK | Single HTML file (~50KB gzip), zero CDN deps for app logic |
| File Size | ✅ Optimized | 0.41MB (80% reduction since S26, images WebP) |

## Recent Changes (S57-75)

| Session | Focus | Impact |
|---------|-------|--------|
| S75 | 🎯 上位足RCIの選択肢をトレンド方向で自動絞り込み | ユーザー指摘「上昇トレンドの場合は下限か↓60か❌しか選択しない…自動で絞り込んでほしい」に対応。①`MV_TF_CHECKS`のRCI短期/中期/長期に`side`プロパティを付与（上限・60↑→`sell`、60↓・下限→`buy`）②`trendCheckCell()`で`side`を看収し、上位足の方向（`w.trend[tfKey].state`）に合わない選択肢を隠す③方向反転時は逆サイドのRCI値を自動クリア（`mvSyncEntrySideChecks()`で拡張）。エントリー足の❶❷（S62で既に`side`対応済み）と同じ規約で一本化。s75-test.mjs 8項目通過、既存テスト全通過。sw.js: v44→v45 |
| S74 | 🎯 未記録足は確度%を表示しない | ユーザー指摘「未記録時間足の確度が100%で表示されるのは誤解を招く」に対応。`hasAnyHigherCheck(w, tfKey)`で記録有無を判定し、未記録時は確度%を HTML から除外。パネルでは「確度 未記録」（グレー）表示に。s74-test.mjs 7項目通過。sw.js: v43→v44 |
| S73 | ⏱️ GO右横にアラート発生時刻からの経過時間表示 | ユーザー要望「手入力アラート時刻から現在までの経過時間を表示したい」に対応。`elapsedShort()`で経過を「3h15m」「2d2h」のように表示。🔭カードのアラートバッジ下に ON の足の経歴時間を常時表示。s73-test.mjs 9項目通過。sw.js: v42→v43 |
| S72 | 🎯 checksHigher を時間足キーごとに独立化→per-tf確度% | バグ修正：🎯チップ確度%が全足で同じ値だった。根拠チェック`checksHigher`をペア共有から時間足キー（h1/h4/d/w/mn）ごとに独立化。旧データは自動移行。確度計算・パネル・マージロジックを時間足単位に対応。s62/s44/s60/s59/s55 全通過。sw.js: v41→v42 |
| S71 | 📱 アラート発生日時の手入力モーダル化 | 要望「アラートが鳴った時刻を後から入力したい」に対応。アラートバッジタップ→datetime-local入力→保存でON+時刻記録。`mvSetAlertAt()`で手入力時刻を一元管理。旧`mvToggleAlert`（自動記録）は廃止。sw.js: v40→v41 |
| S70 | 🎯 🎯チップの確度%を375px幅でも常時表示 | ユーザー要望「カード確度を見分けやすく」。CSS変更で確度スパン（`.conf`）だけを畳みから除外、スマホ1段レイアウト維持したまま確度を常時表示。文言を「確度61%」→「61%」に簡略化。s44で検証済み。sw.js: v39→v40 |
| S69 | 📊 アラート発生日時をカードに常時表示、経過時間統計追加 | ユーザー要望「エントリーまでの時間を記録・分析したい」「アラート時刻を確認したい」。🔭カード下に発生日時（例「1H 09/09 21:30」）を常時表示。📚統計タブに「アラート〜エントリーの経過時間」タイル追加（手入力`manualAlertAt`と`datetime`の差分を自動計算）。sw.js: v38→v39 |
| S68 | 🧪 S68準備: テスト更新 | s62-test.mjs を S63-S65 定義変更に対応（granville撤去・待ち系撤去・weight導入）。既存s44/s43/s42全通過。テスト修正のみで本体機能変更なし。sw.js版番号据え置き |
| S67 | 🔀 並び順をアラート発生時刻順に置換、圏内/巡回タイル撤去 | ユーザー要望「1H/4H/D/Wのソート、カード連動、圏内と巡回は消して」。①S44のエントリー圏距離順を撤去し`w.alerts[tf].at`の新しい順に置換②ツールバーに時間足ボタン（`trendSortTf`）を新設、バッジタップで自動切替③サマリーから「🎯圏内」「巡回n/mペア」タイルを撤去（GO・未更新2タイルに整理）④`pairEntryDistance()`は波マップ・根拠ボタン色分けで使用継続。s67-test 記載無し（テスト不要、仕様変更のみ）。sw.js: v37→v38 |
| S66 | 根拠パネルの判定ボタンから絵文字マークを撤去 | `trendJudgeBtnsHtml()`が`j.label.slice(0,1)`で絵文字1文字だけ表示していたのを、文言本体（エントリー/保留/スルー）表示に変更。`MV_JUDGES.label`本体・`mvSetJudge()`・データモデルは無変更 |
| S65 | エントリー足❸の「重なり」をロールリバーサル確認に置換 | `fiboRoll`（重なり有/重なり無/❌）を撤去し、上位足にあった`rollReversal`（確認/❌）をエントリー足❸に一本化。上位足からは`rollReversal`を削除（5分足確認と重複のため）。CSV: `hi_*`6→5列、`en_*`は`en_fiboRoll`→`en_rollReversal` |
| S64 | 確度%を🔭一覧の🎯チップに表示、パネルのエントリー足/合算表示を撤去 | `trendEntryChipHtml()`に上位足確度%を追加。`.tp-conf`はエントリー足・合算を撤去し上位足のみに。`setupConfidence()`→`higherConfidence()` |
| S63 | 根拠パネルの選択肢整理と確度スコアの重み付け | `granville`行を根拠パネルから撤去（🔭一覧行の🌊アイコンと重複のため）。RCI/MACDの⏳待ち、ラウンドナンバーの無、ロールリバーサルの未確認、エントリー足全項目の⏳待ちを撤去（「待ち」機能一式=`pairWaitCount`等も連鎖削除）。空欄ボタン（`—`）を撤去。`checkConfidence`に`weight`導入（上位足: RCI各15/MACD35/ラウンド10/ロールRv10=計100、S65でロールRvを外し分母90に変更） |
| S62 | エントリー足の根拠を3ステップ確認フローに全面置換 | `MV_ENTRY_CHECKS`（❶反転形／❷MA抜け／❸重なり／❸Fibo）を新設。方向で選択肢を絞り、方向反転で矛盾する記録だけ自動クリア。パネルは縦2セクションに |
| S60 | GO/圏内/待ち/未更新のタップ箇所重複を解消 | サマリータイルを`<button>`化しフィルタを兼務、ツールバーの同名4ボタンを削除、ツールバー1行に再統合 |
| S59 | 🔭一覧上部を巡回実運用に合わせて再整理 | 説明文圧縮・5タイルペア単位統一・ツールバー2行分割・CSS色バグ修正 |
| S58 | 目線3択→手動GOフラグ置換 | GO主観フラグで監視優先度を明示的に制御 |
| S57 | 1時間足を巡回対象に追加 | 1H/4H/日足の3本を常時表示・エントリー圏判定に含める |
| S56 | iOS同期ロバスト性強化 | visibilitychange+pageshow+focus+touchstart+30秒ポーリング・容量超過リーンモード |

## Architecture Snapshot

```
index.html (単一ファイル)
  ├─ HTML: 3タブレイアウト + 各モーダル (記録フォーム・波マップ・グランビルピッカー・ヘルプドロワー)
  ├─ CSS: ライト/ダーク両モード対応、responsive 375-1440px
  └─ JS: localStorage (主体) ↔ Supabase (補助・複数端末同期)

sw.js (キャッシュ制御、S28〜)
  └─ v37: network-first HTML / cache-first assets / cross-origin素通し

manifest.webmanifest + icon-*.png (PWA)
  └─ iOS7日削除回避の唯一の方法

docs/
  ├─ CHANGELOG_ARCHIVE.md (S1-27の詳細)
  ├─ SESSIONS_14_TO_18_ARCHIVE.md (環境ボード刷新期の詳細)
  └─ SETUP_SYNC.md (複数端末同期のTips)
```

## Key Data Structures

**localStorage keys** (すべて `mochipoyo_*_v1`プレフィックス):
- `trades` — トレード記録本体 (CSV export/importも対応)
- `market_view` — 🔭一覧の巡回記録 (22ペア基盤→S25で28ペア、S29で全銘柄自動生成)
- `market_view_selected` — 選択中ペアID (旧ボード用、今は未使用)
- `trend_tfs` — 表示する時間足 (1H/4H/D常時、W/M任意)
- `firebase_config` — チャート画像アップロード用認証
- `theme` / `sync_at` / `tombstones`

## Current Limitations & Known Issues

| Issue | Status | Workaround |
|-------|--------|-----------|
| s40-test チップ更新・ラベル残る (2項目) | 既知 S45から | S45でミニ波形・ラベル表示を撤去した際の期待値更新漏れ。S68で修正判断を先送り（変更前HEAD でも同じ2件が落ちる既知問題） |
| s62-test 定義不整合 (S63-S65追従) | ⚠️ S68時点で解決済み | s62-test.mjs を S63/S65 定義変更に対応、48項目全通過確認。他テスト（s44 64項目・s43 35項目・s42 45項目）も全通過 |
| localStorage 5-10MB上限 | 予想 | S56で容量超過リーンモード追加。S72で per-tf checksHigher に一本化したため逆に容量効率化の可能性 |
| 波マップ過去日では「待ちあり」不可 | 既知 S63削除 | S63で待ち系選択肢を完全撤去したため問題消滅。過去日「GOのみ」も同じ理由で不可（設計上不可避） |

## Session Progression (S1-60 Summary)

**S1-13:** 初期実装 → トレード記録フォーム・統計・CSV対応  
**S14-21:** 環境認識ボード刷新 → ボード廃止に向けた布石  
**S22-27:** トレンド一覧初版・各種最適化  
**S28-39:** データ保護・複数端末同期・判定自動化・確度スコア  
**S40-44:** 波位置タップ記録→波マップ→判定全廃・エントリー圏軸  
**S45-50:** 表示最適化・過去日訂正・参考重ね表示  
**S51-56:** ボード廃止・決済モーダル廃止・1H追加・同期強化  
**S57-60:** 手動GOフラグ・一覧上部整理・タップ箇所重複解消  
**S62:** エントリー足を3ステップ確認フローに置換（上位足とは別の項目セットへ）  
**S63:** 根拠パネルの選択肢整理（granville撤去・待ち系撤去・空欄ボタン撤去）＋確度スコアの重み付け  
**S64:** 確度%を🎯チップに表示、パネルのエントリー足/合算表示を撤去  
**S65:** エントリー足❸の「重なり」をロールリバーサル確認に置換、上位足からロールリバーサルを撤去  
**S66:** 根拠パネルの判定ボタンから絵文字マークを撤去、文言本体を表示  
**S67:** 並び順をアラート発生時刻順に置換（S44のエントリー圏距離順を撤去、圏内タイル/絞り込み/グループ見出し削除）

詳細は CLAUDE.md 内の「セッション履歴（S1-67 統合）」テーブルを参照。
※ S61 は欠番（着手されずに終わったセッション番号）。

## Next Session Checklist

- [ ] `git pull origin master` を必ず最初に実行（別環境からのプッシュがある可能性）
- [ ] `git log --oneline -3` でローカルとリモートの一致を確認
- [ ] s40-test.mjs の既知2件（S45のミニ波形撤去に伴う期待値更新漏れ）を直すか判断
- [ ] `GV_ENTRY_RADIUS` の実運用チューニング（S51以来の据え置き候補）
- [ ] **s62-test.mjs を S63〜S65 の変更に合わせて更新する**（granville行撤去・待ち系撤去・空欄ボタン撤去・weight導入・S65の`fiboRoll`→`rollReversal`置換、`en_rollReversal`/`hi_*`×5 の期待値も含む。現状はS62時点の定義を前提にしたまま）
- [ ] s44-test.mjs / s40-test.mjs で `pairWaitCount`/`trendWaitBadgeHtml` 参照が残っていないか確認（S63で削除済み関数）

## ⚠️ 複数環境運用時の注意（S60で発生した教訓）

このプロジェクトは Windows ローカル CLI と iPhone CloudCode の**複数環境**から並行して作業されている。
S60セッション開始時、Windowsローカルのmasterが3セッション分（S57-59）遅れており、
その間に加えた未コミット変更が既にorigin/masterへ別環境からプッシュ済みの内容と重複していた。

**原因**: git pull は自動実行されない。環境を跨ぐと「向こうでコミットされた」ことがローカルには伝わらない。

**対策（必ず実行）**:
1. **セッション開始時**: `git fetch origin && git log origin/master --oneline -3` でリモートの最新を確認
2. **ローカルが遅れていたら**: 未コミット変更があれば `git branch backup-<date>` などで退避 → `git pull --ff-only`
3. **作業終了時**: 必ず `git push` して、次にどの環境で開いても最新を拾えるようにする
4. **セッション引き継ぎプロンプト**（ユーザーがコンテキスト圧迫時に送る定型文）には、この pull 確認ステップを必ず含めること

## Development Notes

**Testing framework:** Playwright (file://) + localStorage 直注入  
**Commit attribution:** `Co-Authored-By: Claude <noreply@anthropic.com>`  
**Branch strategy:** feature → `claude/fx-entry-checklist-s{n}-*` → PR/merge to master  
**CSV round-trip:** All 23 columns tested, backward-compatible with S1 format  

---

For comprehensive details on features, data models, implementation notes, and architectural decisions, see **CLAUDE.md** (748 lines, the authoritative spec).
