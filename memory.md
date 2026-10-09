# ネックラインアラートシステム — Project Memory

**Last Updated:** 2026-10-04（S107）
**Current State:** ✅ 本番使用可能。最新 S108、`sw.js` CACHE = v80
**Main Branch:** `master`（GitHub Pages は master のルートから配信）
**仕様の正本:** `CLAUDE.md`（このファイルは全環境で共有する「現在地と運用メモ」）

## 今どこにいるか（S97〜S106）

| Session | 内容 |
|---|---|
| S108 | ゾーン表示をネックライン1本の価格に（`line`）。タップでコピー（TradingView に引く用）。判定は内部のゾーン幅のまま。sw v80 |
| S107 | ネックラインを監視リストの4つ目の条件に。アラート受信時に Edge Function が ✅/▲/✖ を自動で入れる（`neckJudge`）。zones.json に `ladder`（上下複数）。sw v79。Edge Function は 10/05 に deploy 済み |
| S106b | 🎯狙い目：Edge Function がアラート受信時にネックラインゾーン付近×方向一致を判定し `aim[tf]` を書いて ntfy 通知。アプリは🔔未確認に🎯、振り分けタブに「🎯 狙い目」。sw v78 |
| S106 | 📍ネックラインゾーン：Claude Routine が1日4回 1H/4H/D を分析 → `zones-data` ブランチの `zones.json`。監視リストに📍表示、勝／負記録にゾーンを自動で控える。sw v77 |
| S105 | 監視リストに ▲微妙・勝／負の1タップ記録（`kind:'watchlog'`）、→カード撤去 |
| S104 | TradingView Webhook → Supabase Edge Function `tradingview-alert` → 監視リストの🔔未確認アラートへ自動記録 |
| S98〜S103 | 🔔未確認アラート、🔭は時間足ボタン、✅成立、📖使い方の折りたたみ、振り分けタブ、📝メモボタン |
| S97 | 🔭一覧タブを⚡1分足タブと同じ「👀監視リスト｜記録カード」に作り直し（巡回一覧・根拠パネル・波マップを撤去） |

詳細は CLAUDE.md のセッション履歴表。S96 以前は `docs/CHANGELOG_ARCHIVE.md`、撤去済み機能の仕様は `docs/CLAUDE_MD_ARCHIVE.md`。

## 外部連携の状態（2026-10-04）

- **ntfy**：iPhone の ntfy アプリでトピック `fx-neckline-alerts` を購読済み（手動送信のテスト通知は届く）
- **2026-10-04 完了**：S106 版 `tradingview-alert` を deploy。Secrets に `NTFY_TOPIC=fx-neckline-alerts` と `TV_WEBHOOK_KEY`（新規生成。値はチャットで伝えた・ここには書かない）を設定。curl で旧形式・新形式 `【1時間足】…` とも `ok:true` を確認（どちらもゾーン外で `aim:false`）
  - 環境変数の `SUPABASE_ACCESS_TOKEN` は権限不足（deploy / secrets が 403）。作業はユーザーが iPhone で発行したフルアクセストークンで行った（チャットに貼ったので、用が済んだら Dashboard → Access Tokens で削除を勧めた）
  - Windows の Git Bash で curl に日本語を直接書くと文字化けして `unparsed` になる。UTF-8 ファイルを `--data-binary @file` で送る
  - テスト用に本番の監視リストへ `USDJPY 1H short` の行が入っている（不要なら✓で消す）
- **2026-10-05 完了**：S107/S108 版 `tradingview-alert`（`neckJudge` 入り）を再 deploy、`NTFY_TOPIC` を再設定。使ったフルアクセストークンはチャットに貼られたもの。ユーザーに Dashboard → Access Tokens での削除を依頼済み（削除したかは未確認）
- **未確認（次にやること）**：🎯（ゾーン付近×方向一致）の ntfy 通知が iPhone に届くか。TradingView で `tools/tradingview/webhook-test.pine` を使って鳴らす（手順は `docs/TRADINGVIEW_ALERT_SETUP.md` D2）。本番28本への Webhook URL 貼り付けもユーザー作業で未
- **ゾーン分析**：⚠️ 2026-10-04 時点で **定期実行の Routine は登録されていない**（RemoteTrigger の一覧は無関係の「4H重要ライン定点レポート」1件のみ。zones-data の更新は 10/01 の手動実行1回だけだった）。10/04 に手動で再生成して push 済み（ladder つき）。定期化するには Routine を作る必要がある（手順 `tools/zones/ROUTINE.md`、1回で約10万トークン×1日4回）。アプリ・Edge Function は分析が 12 時間より古いと「古い」表示／ネック判定なしにする

## 運用メモ

- **複数環境（Windows CLI / iPhone Claude Code）で並行作業する。** 開始時に `git fetch origin` と `git log origin/master --oneline -3` を見て、遅れていれば未コミット分を `backup-<日付>` ブランチへ退避してから `git pull origin master --ff-only`。終了時は必ず `git push`
  - 2026-10-03：Windows のローカルが S97 のまま S98〜S106 が別環境で進んでいた。ローカルの未コミット S98 試作（`pending*` 系・`trading-view-webhook` 関数）はリモートの実装と重複していたため統合せず、ローカルの `backup-20261003` ブランチに退避（push していない）
- **GitHub Pages は master のルートから配信。** `docs/index.html` などは S77 時点の古いコピーで使われていない（docs/ へコピーする手順は不要。旧手順は誤り）
- `index.html` を変えたら `sw.js` の CACHE を上げる。テストは本番 Supabase に触れない（file:// か `page.route()` でモック）。Supabase のポーリングは30秒未満にしない。表 `trades` は fx-trade-tracker 用なので触らない（使うのは `trades_checklist`）
- `.claude/settings.json` はトークンを含むので `.gitignore` 済み
- Commit attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## アーカイブ

- `docs/MEMORY_ARCHIVE_S105.md` — 書き直す前の memory.md 全文（S56〜S105 の表・旧チェックリスト）
- `docs/CLAUDE_MD_ARCHIVE.md` — CLAUDE.md から移した撤去済み機能の仕様・CSV変更履歴・旧テスト注意
- `docs/CHANGELOG_ARCHIVE.md` — S28〜S96 の履歴
- `docs/SESSIONS_14_TO_18_ARCHIVE.md`・`docs/SESSION_19_PROMPT.md` — 初期の記録
