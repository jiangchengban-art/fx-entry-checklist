# FX Entry Checklist — Project Memory

**Last Updated:** 2026-10-03（S106 完了後の整理）
**Current State:** ✅ 本番使用可能。最新 S106、`sw.js` CACHE = v78
**Main Branch:** `master`（GitHub Pages は master のルートから配信）
**仕様の正本:** `CLAUDE.md`（このファイルは全環境で共有する「現在地と運用メモ」）

## 今どこにいるか（S97〜S106）

| Session | 内容 |
|---|---|
| S106b | 🎯狙い目：Edge Function がアラート受信時にネックラインゾーン付近×方向一致を判定し `aim[tf]` を書いて ntfy 通知。アプリは🔔未確認に🎯、振り分けタブに「🎯 狙い目」。sw v78 |
| S106 | 📍ネックラインゾーン：Claude Routine が1日4回 1H/4H/D を分析 → `zones-data` ブランチの `zones.json`。監視リストに📍表示、勝／負記録にゾーンを自動で控える。sw v77 |
| S105 | 監視リストに ▲微妙・勝／負の1タップ記録（`kind:'watchlog'`）、→カード撤去 |
| S104 | TradingView Webhook → Supabase Edge Function `tradingview-alert` → 監視リストの🔔未確認アラートへ自動記録 |
| S98〜S103 | 🔔未確認アラート、🔭は時間足ボタン、✅成立、📖使い方の折りたたみ、振り分けタブ、📝メモボタン |
| S97 | 🔭一覧タブを⚡1分足タブと同じ「👀監視リスト｜記録カード」に作り直し（巡回一覧・根拠パネル・波マップを撤去） |

詳細は CLAUDE.md のセッション履歴表。S96 以前は `docs/CHANGELOG_ARCHIVE.md`、撤去済み機能の仕様は `docs/CLAUDE_MD_ARCHIVE.md`。

## 外部連携の状態（2026-10-03）

- **ntfy**：iPhone の ntfy アプリでトピック `fx-neckline-alerts` を購読済み。ntfy.sh の Web から手動送信したテスト通知が iPhone に届くことを確認した
- **未確認（次にやること）**：
  1. Supabase の Edge Functions → Secrets に `NTFY_TOPIC=fx-neckline-alerts` があるか
  2. S106 版の `tradingview-alert` を再 deploy 済みか（`npx supabase functions deploy tradingview-alert --project-ref inqvrsfzskjusmbwlimx --no-verify-jwt`。手順は `docs/TRADINGVIEW_ALERT_SETUP.md`）
  3. 実アラート（または curl）で🎯通知が iPhone に届くか
- **2026-10-04 試行（Windows CLI）**：環境変数 `SUPABASE_ACCESS_TOKEN` は有るが権限不足で、`functions list` は通る一方 **deploy は 403（edge_functions_write 不足）・secrets list は 403（edge_functions_secrets_read 不足）**。本番の `tradingview-alert` は version 1（S106 版は未 deploy）。→ 上の 1〜3 は未実施。権限付きトークンの再発行（Dashboard → Account → Access Tokens）か、ユーザー自身の deploy・Secrets 設定が必要。curl 確認には `TV_WEBHOOK_KEY` も要る
- **ゾーン分析**：`tools/zones/ROUTINE.md` の手順で Routine が `zones-data` に push（最終確認 2026-10-01）

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
