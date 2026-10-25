# 📅 突き合わせ（Routine の手順）

1日1回（日本時間 **7:00**。ゾーン分析のあと）に Claude の Routine が新しいセッションでこの手順を実行する（S121）。
アプリのデータ（Supabase の表 `trades_checklist`）を読み、ローソク足と突き合わせて結果を書き戻す。

書き戻すもの：
- **📅アラート台帳の「もし入っていたら」**（`vsim`）… アラートのある 見送り・🗑・期限切れ・入った記録。アラートの時刻の足の終値で入り、損切り＝ATR×1.5・利確＝2:1。判定の期間（スキャ4h・デイ24h・スイング72h）が過ぎたものだけ
- **見送りの判定**（`sim`）… 🗂見送った記録の「入っていたら」（⭐の価格があれば自分の 2:1/3:1/4:1）
- **入った記録の突き合わせ**（`fill`）… 決済済みの記録のエントリー時刻・3:1/4:1への到達・最大含み益/含み損

⚠️ 表 `trades` は fx-trade-tracker 用なので触らない（スクリプトは `trades_checklist` だけを読み書きする）。

## 手順（Routine の Claude が行う）

1. リポジトリを最新の master にする
   ```bash
   cd <repo> && git fetch origin master && git checkout -B backfill-run origin/master
   ```
2. 記録を取ってきて、取得するローソク足を確認する
   ```bash
   node tools/backfill/sync.mjs pull /tmp/trades.json
   ```
   `取得するローソク足` の各行（`銘柄 足 本数`）について、TradingView MCP の `mcp-tv-get-ohlcv` を `symbol`・`interval`・`count`（その本数）で呼ぶ
   - 0本なら 4 へ（書き戻すものが無い）
   - 結果が大きいので Claude Code が `tool-results/` にファイルで保存する。**中身を読もうとしないこと**（スクリプトが読む）
   - 1回の返信で並列にまとめて呼ぶ
3. 突き合わせて書き戻す
   ```bash
   node tools/backfill/backfill.mjs /tmp/trades.json ~/.claude/projects/*/*/tool-results --out /tmp/backfill.json
   node tools/backfill/sync.mjs push /tmp/backfill.json
   ```
4. 最後の返信は、`push` が `---` の下に出した1行をそのまま貼る（0件なら「突き合わせ：対象なし」）
5. リポジトリには何もコミットしない

## 調整のしかた

- 物差し（ATR×1.5・2:1・期間）は `tools/backfill/backfill.mjs` の `SIM`、判定に使う足は `SIM_TF`
- 変えたら `node backfill-test.mjs` を通すこと
