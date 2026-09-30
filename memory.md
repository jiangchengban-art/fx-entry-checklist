# FX Entry Checklist — Project Memory & Session Log

**Last Updated:** 2026-09-30 (S105 complete — TradingView Webhook integration design & implementation pending)  
**Current State:** ✅ Production-ready (S105: ▲微妙判定・勝／負1タップ記録完成、全テスト通過). 👀監視リスト・⚡1分足・🔭記録カード完成, TradingView Edge Functions実装待ち  
**Main Branch:** `master`  
**Active Development Branch:** none — S105 merged directly to master

## Project Health

| Aspect | Status | Notes |
|--------|--------|-------|
| Core Features | ✅ Complete | ⚡1分足・👀監視リスト・🔭記録カード・📚統計・⚙設定（5段階タブ）完成 |
| Testing | ✅ Passing | s105(65)+s104(34 Node pure functions)+s103(50)+s102(20)+s101-100(n/a)+s99(31)+s98(30)+s97(38)+s96(16)+s95(15)+s94(36)+s93(35)+s92(65)+s91(53)+s90(51)+s89(37)+s88(26)+s84-83-82-81-80(updated)+s78-sync(17 mock)+s55(13)+s44(64)+s43(35)+s42(45)+s60(17)+s59(31) all green. S80で全テスト整理・本番Supabase送信の安全弁バグ修正 |
| Data Model | ✅ Stable | localStorage `mochipoyo_*_v1` keys, Supabase JSONB sync |
| Accessibility | ✅ OK | PWA-capable, iOS/Android responsive, dark/light theme |
| Performance | ✅ OK | Single HTML file (~50KB gzip), zero CDN deps for app logic |
| File Size | ✅ Optimized | 0.41MB (80% reduction since S26, images WebP) |

## Recent Changes (S78-105, Latest Major Features)

| Session | Focus | Impact |
|---------|-------|--------|
| S105 | ▲ **監視リストに「▲微妙」判定・勝／負の1タップ記録** | ユーザー要望「グランビル/RCI/MACDは微妙に成立していなくても他が良ければエントリーするので▲を追加」「記録を簡略化する為→カードは無くし、監視リストのカードに勝ちか負けかタップするマークで対応」。タップ順は✅→▲→✖→未選択。✅エントリーのタブは✖無しで✅か▲が3つ。勝／負は`kind:'watchlog'`（その時の条件つき）で trades に入れ同期・墓標を流用。監視リスト下に条件別の勝率・直近20件・🗑取り消し。s92-test.mjs 65項目全通過 |
| S104 | 📡 **TradingView アラート → 👀監視リスト 自動連携** | 事実確認（plot_2=long/plot_3=short、アクティブ162本、`WTICOUSD→OIL`以外は ticker がそのまま通貨名）。設計は`docs/TRADINGVIEW_ALERT_DESIGN.md`、手順は`docs/TRADINGVIEW_ALERT_SETUP.md`。Webhook→Supabase Edge Function が監視アイテムの`t:`行に`alerts[tf]`／新設`alertSide[tf]`を書く（墓標を見て、無ければ`sw_tv_<PAIR>`/`tw_tv_<PAIR>`で自動追加）。アプリ側は🔔未確認欄に▲long／▼short を表示、✓で消す。新設tv-alert-test.mjs 34項目、s98/s102/s97更新 |
| S103 | 📝 **監視リストのメモ欄を📝ボタン化** | ユーザー要望「メモの枠が広すぎるのでコンパクトに」。2行目はボタンだけにし、📝で入力欄を開く。s92-test.mjs 50項目全通過 |
| S102 | 🗂 **監視リストに振り分けタブ（すべて／✅エントリー／⏳待ち）** | ユーザー要望「✅がタップされたらエントリー、✖が入ったら待ちで振り分け、タブで切り替え」。3つとも✅＝エントリー、✖が1つでも＝待ち。件数つき、選んだタブは端末に記憶。新設s102-test.mjs 20項目通過 |
| S101 | 📖 **監視リストの説明文を折りたたみに** | ユーザー要望「説明文の幅を省略させて」。監視リスト冒頭の説明文を「📖 使い方」に収める |
| S100 | ✅ **監視リストのグランビル/RCI/MACDに「✅成立」を追加** | ユーザー要望「条件が揃っている場合に選ぶ✅を追加」。タップで✅→✖→未選択の3段階。3つとも✅で「揃い」。s92-test.mjs 41項目通過 |
| S99 | 🔔 **🔭監視リストの🔔を「カード内の時間足ボタン」に** | ユーザー要望「🔔を押したら別カードが開くのは見にくいので、カード内に時間足が収まるようにしたい」。2行目（メモ・→カード・🗑）に🔔1H/4H/D/Wの小ボタンを常時並べて直接タップで控える。s98-test.mjs 31項目通過 |
| S98 | 🔔 **監視リストに「未確認アラート」を追加** | ユーザー要望「アラートが鳴ったが条件が揃っておらず後で確認するものが、大量のアラートに埋もれて確認漏れする」。監視リストの🔔で時間足ごとに控え、上部に古い順で表示、✓で確認済み。下部タブに未確認件数のバッジ。新設s98-test.mjs 30項目通過 |
| S97 | 🔭 **一覧タブを⚡1分足タブと同じ作りに作り直し** | ユーザー要望「一覧タブは1分足のタブと同じ作りにして良い。上位足が1時間足以上の取引の際に記録していく」。巡回一覧・根拠パネル・波マップを撤去、👀監視リスト（`kind:'trendwatch'`）＋記録カード（上位足/エントリー足プルダウン・懸念✖・反転形・区分）に。💾はエントリー記録のみ。新設s97-test.mjs 38項目、s28/s55/s78-sync/s88/s92/s95/s96を更新し全通過 |
| S96 | ✏️ **⚡1分足タブに「入力中のみ」表示切替** | ユーザー要望「入力している途中のカードだけ表示させるようにソートできるように」。カード一覧の上にトグルと「入力中 n / 全 m 枚」を追加。新設s96-test.mjs 16項目通過 |
| S95 | ➕ **⚡1分足タブのカードを5枚より増やせるように** | ユーザー要望「カードが5以上になる場合がある」。「＋ カードを追加」で拡張可能に。新設s95-test.mjs 15項目通過 |
| S94 | 📝 **🔭一覧の記録を1分足タブと同じ「パネル内で💾」方式に** | ユーザー要望「一覧タブの記録方法も1分足タブと同じに」。根拠パネルの下に記録欄（区分・方向・結果タグ・損益）を付け、📝記録フォームへボタンとモーダル遷移を撤去。新設s94-test.mjs 36項目通過 |
| S93 | 📱 **⚡タブを「👀監視リスト」「⚡1分足記録」の2画面に分割** | ユーザー要望「監視リストは横にスライドとかで別画面に表示できる？」。上に貼り付く切替ボタン＋横スワイプで切替。s92-test.mjs 35項目更新 |
| S92 | 👀 **⚡1分足タブの最上部に監視リストを追加** | ユーザー要望「監視通貨の中でも絞り込みをして、メモのように書いたり条件が外れたら消すような簡易的な箇所がほしい」。通貨ごとに1時間足の不成立トグル3つ＋メモ＋→カード＋🗑。trades に`kind:'scalpwatch'`で置く。新設s92-test.mjs 26項目通過 |
| S91 | ⏰ **1分足タブの⏰は「カードに控えるだけ・💾で記録」を明確化** | ユーザー要望「アラートが鳴ったの段階ではまだ入るか未定なので、見送るなら🧹で捨てる」。仕組みはS90で既にそうなっていたが、文言を明確化。s88-test.mjs 53項目更新 |
| S90 | ⏰ **1分足タブに1時間足アラート時刻を追加・表記の見直し** | ユーザー要望「アラート発生時刻から現在までの経過時間を表示したい」。ヘッダに⏰ボタン、タップした時刻を00分に切り捨て。記録一覧に「エントリーまで n分」、サマリーに平均・中央値。文言を「1H」「1M」から「1時間」「1分」に、RCI▲→✖、MACDプルダウン→トグル。s88-test.mjs 51項目通過 |
| S89 | ⚡ **1分足タブをコンパクトなカード5枚のタップ記録に作り直し** | ユーザー要望「一覧タブのようなコンパクトな見た目で絵文字をタップして記録したい。エントリータイミングが重なる通貨も同時に記録」。縦長フォームを撤去し、カード5枚（ヘッダ＝通貨/▲▼/📷📝🧹💾、1H行＝短▲中▲長▲・MACD、1M行＝形状・🐋●✖・〽●✖）に。s88-test.mjs 37項目に書き直し |
| S88 | ⚡ **1分足スキャル専用タブを新設** | ユーザー要望「1時間足×1分足は取引回数が多いので、確認事項を絞った別タブで記録したい」。下部タブバーに「⚡1分足」を追加（4タブ）。懸念点だけ記録、💾で trades に保存。新設s88-test.mjs 26項目通過 |
| S84 | 🐛✏️ **結果タグ/建値タッチのタップ反映バグ修正・日時手入力対応** | 3件のユーザー報告に対応。①`.result-btn.active`のCSS欠落で見た目に反映されなかったバグ修正②日時入力欄に手入力用テキスト欄を併設（`datetime-local`のホイール選択しか無い環境向け）③結果「その他」の理由をRCI/ネックライン/経済指標/閉場前/ルール違反の5択に差し替え。既存全スイート通過 |
| S83 | ✏️ **エントリー足❷❸の項目差し替え** | ユーザー指摘「②をアラートに、③をグランビルに変更」。❷は●/✖、❸はダマシ/ヒゲ発生に。方向非依存になった。既存s62-test.mjs更新・全スイート通過 |
| S82 | 🎯 **エントリー足のFibo選択に指値/逆指値の前置き選択を追加** | ユーザー要望「まず指値か逆指値かの選択をさせて、指値ならFIBOの選択へ」。entryFibo行はentryOrderTypeが「指値」のときだけ表示。新設s82-test.mjs 13項目通過 |
| S81 | 🐛 **3端末で「消した記録が同期のたびに復活」不具合の修正** | ①🧹クリアが時刻を打たず必ず同期で負けていた問題修正②🗑削除の墓標がプリセット自動再生成で無視されていた問題修正。削除操作が3端末すべてに正しく伝わるように。新設s81-test.mjs 26項目通過 |
| S80 | 📊 **確度%帯別/根拠項目別の成績、リスク額＋R倍率、見送りの振り返り** | 📚統計に確度スコア帯別・各根拠項目値ごとの成績検証を追加。フォームに「リスク額」入力とR倍率表示。保留/スルーに事後振り返りボタン。本番Supabaseへの書き込みテストの安全弁バグ修正。新設s80-test.mjs 19項目、既存全スイート通過 |
| S79 | 🎯 **🎯チップからエントリー距離%を削除** | ユーザー指摘「距離%と確度%が並んで紛らわしい」。確度%のみ表示に。sw.js: v49→v50 |
| S78 | ☁ **端末間同期を fx-trade-tracker 方式（ログインなし・1記録1行）に置換** | マジックリンク実用性の課題対応。表`trades_checklist`に`t:/p:/j:/s:/tomb`行で保存、差分取得＋変更行のみ送信で通信量抑制。新設s78-sync-test.mjs 17項目通過。sw.js: v47→v49 |
| S77 | ✕ **通貨名検索欄に✕クリアボタンを追加** | ユーザー要望「検索バーの右側に❌マークを設けてタップで即クリアしたい」に対応。`#trendSearchInput`を`.trend-search-wrap`で包み右端に`#trendSearchClear`ボタンを配置。入力があれば表示、クリックで値リセット＋フォーカス復帰。s77-test.mjs 7項目通過。sw.js: v46→v47 |
| S76 | 🔍 **🔭一覧ツールバーに通貨名検索機能を追加** | ユーザー要望「通貨の頭文字を入力したらその通貨だけ検索できる検索機能を設けて」に対応。①カテゴリ選択（`#trendCategorySelect`）の隣に検索入力欄（`#trendSearchInput`, placeholder「🔍 通貨名で検索（例: JPY）」）を新設 ②`input`イベントで`trendSearchQuery`を更新し即時絞り込み（大文字小文字は区別しない） ③`trendApplyFilters()`（一覧・波マップ共有の絞り込み合流点）に1行追加するだけで実装。GO/未更新/カテゴリと同じAND条件、🗺波マップのライブ表示（`trendMapLiveEntries()`）にもコード変更なしで自動反映 ④波マップの過去日表示（`trendMapDayEntries()`）は`items`が`p`（ペア名）のみ保持するため、カテゴリと同様に個別で検索条件を追加 ⑤`renderTrendList()`は`trendListEl`のみ再構築し検索`<input>`要素自体は作り直さないため、連続入力中もフォーカス・カーソル位置を保持 ⑥GO/未更新/カテゴリと同じく永続化しない（巡回中の一時的な絞り込み）。データモデル・CSV・端末間マージ・統計・並び順ロジック・根拠パネルは無変更。新設s76-test.mjs 11項目通過、既存s42/s43/s44/s55/s59/s60全通過（205項目）。sw.js: v45→v46 |
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
  └─ v76: network-first HTML / cache-first assets / cross-origin素通し（S105で最終更新）

manifest.webmanifest + icon-*.png (PWA)
  └─ iOS7日削除回避の唯一の方法

docs/
  ├─ CHANGELOG_ARCHIVE.md (S1-27の詳細)
  ├─ SESSIONS_14_TO_18_ARCHIVE.md (環境ボード刷新期の詳細)
  └─ SETUP_SYNC.md (複数端末同期のTips)
```

## Key Data Structures

**localStorage keys** (すべて `mochipoyo_*_v1`プレフィックス):
- `trades` — トレード記録本体 (`kind:'scalp'|'scalpwatch'|'trendwatch'|'watchlog'`を含む、CSV export/importも対応)
- `market_view` — 🔭一覧の過去記録 (波位置・判定・根拠チェック・アラート・GO・snapshots等)
- `trend_tfs` — 表示する時間足 (1H/4H/D常時、W/M任意)
- `scalp_slots_v1` — ⚡1分足タブの入力途中カード (端末ローカル・非同期、💾で保存)
- `scalp_active_only` — ⚡タブの「入力中のみ」表示切替 (端末ローカル)
- `trend_slots_v1` — 🔭記録カードの入力途中 (端末ローカル・非同期)
- `trend_pane` / `scalp_pane` — ⚡・🔭タブの2画面切替状態 (端末ローカル)
- `firebase_config` — チャート画像アップロード用認証
- `theme` / `sync_at` / `tombstones` — テーマ・最終同期・削除墓標

## Current Limitations & Known Issues

| Issue | Status | Workaround |
|-------|--------|-----------|
| TradingView Edge Functions 実装待ち | ⚠️ S104設計完了 | `supabase/functions/tradingview-alert/`（index.ts+core.mjs）・tv-alert-test.mjs・config.toml の実装、環境ネットワーク許可（`*.supabase.co`）＋`SUPABASE_ACCESS_TOKEN`秘密の設定が必要 |
| localStorage 5-10MB上限 | 予想 | S56で容量超過リーンモード追加。S78で Supabase 同期に変更（1記録1行で通信効率化）したため実運用上はほぼ対策完了 |
| ⚡・🔭タブのカード状態が iOS Safari の戻るボタンで復帰されない | 既知 | 端末ローカル（`scalp_slots_v1`/`trend_slots_v1`）に保存されているため、ページリロード or タブ切替で復帰。PWA化で「戻る」操作自体が少ないため実害は軽微 |

## Session Progression (S1-105 Summary)

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
**S64-66:** 確度%表示・判定ボタン表示を最適化  
**S67:** 並び順をアラート発生時刻順に置換（S44のエントリー圏距離順を撤去）  
**S68:** テスト準備: s62-test.mjs を S63-S65 定義変更に対応  
**S69-75:** アラート手入力・表示最適化・上位足RCI方向絞り込み  
**S76-77:** 🔭一覧に通貨名検索機能＆クリアボタン  
**S78:** 端末間同期を fx-trade-tracker 方式（ログインなし・1記録1行）に置換  
**S79-105:** **Major Feature: ⚡1分足スキャルタブ＆👀監視リスト＆🔭記録カード統合**  
  - **S88-96:** ⚡1分足タブ新設＋カード5枚＋入力中のみ表示  
  - **S92-105:** 👀監視リスト（グランビル/RCI/MACD選択＋✅成立/▲微妙/✖不成立）＋🔔未確認アラート＋✅/▲/✖による振り分けタブ＋勝／負1タップ記録  
  - **S93:** ⚡・🔭の2画面切替＆横スワイプ対応  
  - **S97:** 🔭一覧タブを⚡と同じ作りに作り直し（巡回・根拠パネル・波マップ撤去）  
  - **S104:** TradingView Webhook→Supabase Edge Function 設計完了（実装待ち）

詳細は CLAUDE.md 内の「セッション履歴」テーブル（S78-S105）を参照。
※ S61・S85-87 は欠番。

## Next Session Checklist

### 必須確認項目（毎回実行）
- [ ] **マルチ環境チェック（Windows/iPhone）**: 
  - [ ] `git fetch origin && git log origin/master --oneline -3` でリモート最新確認
  - [ ] ローカルが遅れていれば `git pull origin master --ff-only` で最新化
  - [ ] 未コミット変更があれば `git branch backup-$(date +%Y%m%d)` で退避してから同期
- [ ] `git log --oneline -3` でローカルとリモートの一致を確認
- [ ] **GitHub Pages が正しく反映されているか確認**: https://jiangchengban-art.github.io/fx-entry-checklist/ 
  - 最新の S105 機能（▲微妙判定・勝／負1タップ）が表示されていることを確認

### 優先実装タスク（S105完了後）
#### Phase 1: TradingView Edge Functions（直後実施）
- [ ] 環境設定：ネットワーク許可リストに `inqvrsfzskjusmbwlimx.supabase.co` と `api.supabase.com` を追加
- [ ] 環境秘密：`SUPABASE_ACCESS_TOKEN` を Supabase ダッシュボードで生成・設定
- [ ] 実装：`supabase/functions/tradingview-alert/index.ts`（Deno Webhook ハンドラ）
- [ ] 実装：`supabase/functions/tradingview-alert/core.mjs`（純関数：parseMessage/planUpdate）
- [ ] 実装：`supabase/config.toml` に `[functions.tradingview-alert] verify_jwt = false` を追記
- [ ] テスト：新設 `tv-alert-test.mjs`（34項目・Node）で core.mjs 検証
- [ ] Deploy：`npx supabase functions deploy tradingview-alert` + `npx supabase secrets set TV_WEBHOOK_KEY`
- [ ] 動作確認：curl でアラートメッセージ送信 → 監視リストに自動追加を確認
- [ ] コミット・プッシュ：`supabase/functions/tradingview-alert/` ＋ `supabase/config.toml` ＋ `tv-alert-test.mjs`

#### Phase 2: MCP でアラートメッセージを一括設定（将成さんの手作業前）
- [ ] MCP（TradingView 接続セッション）で全156本のアラートメッセージを形式「`❶ short sign {{close}} | {{ticker}} {{interval}} {{timenow}}`」に一括更新
- [ ] メッセージ設定完了後、将成さんへ Webhook URL を配布してもらう

#### Phase 3: 本番運用開始
- [ ] 1H（28本）で試運用 → 問題なければ 4H/1D/1W に拡大
- [ ] アラート発生を監視、未確認アラート欄・Supabase Logs で配送確認

### オプション確認項目
- [ ] `GV_ENTRY_RADIUS` の実運用チューニング（S51以来の据え置き）
- [ ] Firebase Storage 画像孤児削除の自動実行タイミング検証（S80で実装）

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

### GitHub Pages デプロイ（S76で確立した方法）
⚠️ **毎回確認**: master に commit/push したら、以下の操作で GitHub Pages を確実に反映させること

**ワンショットコマンド（セッション内で一度だけ実行）:**
```bash
# /docs フォルダに最新のファイルをコピー
mkdir -p docs
cp index.html manifest.webmanifest sw.js docs/
cp -r assets docs/
git add docs/ && git commit -m "GitHub Pages: sync from master" && git push origin master
```

**GitHub UI での設定（初回のみ、以後は不要）:**
1. リポジトリの Settings → Pages
2. Source: "Deploy from a branch" に設定
3. Branch: "master" / Folder: "/docs" を選択
4. Save

**確認:**
- https://jiangchengban-art.github.io/fx-entry-checklist/ で最新のコードが表示されるか確認
- キャッシュ反映に数分かかることあり、F5 リロード or Ctrl+Shift+R で強制更新

**失敗時の トラブルシューティング:**
- リポジトリが public になっているか確認
- /docs フォルダに index.html が存在するか確認（`git ls-files docs/`）
- GitHub ストレージ容量に余裕があるか確認  

---

**Full Details:** See **CLAUDE.md** (最新版: S105まで統合、実装状態・セッション履歴・CSV列構成・根拠チェック定義を含む) ＆ **docs/TRADINGVIEW_ALERT_*.md** (Webhook設計・デプロイ手順)

**Archive:** docs/CHANGELOG_ARCHIVE.md (S1-27 detailed)・docs/SESSIONS_14_TO_18_ARCHIVE.md (環境ボード刷新期)
