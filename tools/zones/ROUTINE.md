# 📍 ネックラインゾーンの定期分析（Routine の手順）

1日2回（日本時間 **6:00 / 17:00**。東京・ロンドンの前。少し前に始める）に Claude の Routine が新しいセッションでこの手順を実行する（S109で4回→2回）。
**土日（日本時間）は仮想通貨（BTCUSDT・ETHUSDT）だけ**を分析し、FX・指数・金・原油は前回（金曜）の結果をそのまま残す。
アプリ（👀監視リスト）は `zones-data` ブランチの `zones.json` を読むだけ。

## 手順（Routine の Claude が行う）

1. リポジトリを最新の master にする
   ```bash
   cd <repo> && git fetch origin master && git checkout -B zones-run origin/master
   ```
2. 今回取得する銘柄を確認する（平日は全銘柄、土日は仮想通貨の2銘柄だけ）
   ```bash
   node tools/zones/zones.mjs --list     # 「通貨名 TradingViewの銘柄」を1行ずつ。この銘柄だけ取得する
   ```
   TradingView MCP の `mcp-tv-get-ohlcv` で、その銘柄 × `1h` / `4h` / `1D` を取得する（平日 25銘柄で **75本**、土日は **6本**）
   - `count: 1500` を必ず付ける。結果が大きいので Claude Code が `tool-results/` にファイルで保存し、会話にはパスだけが返る（＝使用量が小さい）
   - 1回の返信で並列にまとめて呼ぶ（28本ずつ3回程度）
   - **中身を読もうとしないこと**（jq や Read で開かない。スクリプトが読む）
3. ゾーンを計算する
   ```bash
   git show origin/zones-data:zones.json > /tmp/zones.prev.json 2>/dev/null || true   # 前回の結果（無ければ空でよい）
   node tools/zones/zones.mjs ~/.claude/projects/*/*/tool-results --out /tmp/zones.json --since-min 60 --prev /tmp/zones.prev.json
   ```
   `--prev` を付けると、今回取得しなかった銘柄（土日の FX など）は前回の結果が残る（各通貨の `at` が分析した時刻）
   `未取得:` が出たら、その銘柄・足だけもう一度取得して再実行する（2回目も取れなければそのまま進む）
4. `zones-data` ブランチに置く（このブランチはデータ専用。履歴を増やさないよう毎回1コミットで上書きする）
   ```bash
   git checkout --orphan zones-tmp && git rm -rf --cached . >/dev/null && cp /tmp/zones.json ./zones.json \
     && git add zones.json && git commit -m "zones $(date -u +%FT%TZ)" && git push -f origin zones-tmp:zones-data
   ```
5. 最後の返信は、スクリプトが `---` の下に出した通知文をそのまま貼る（スマホに通知される）

## 使用量の目安（S106で実測）

- ローソク足の取得1本あたり、会話に残るのは約650トークン（パスと案内文だけ）→ 平日75本で約4.9万トークン、土日は6本で約0.4万トークン
- 1回の実行で会話の長さは約10万トークン。出力は1万トークン弱（ツール呼び出しの指定がほとんど）
- 手順が機械的なので Sonnet で十分

## 調整のしかた

`tools/zones/zones.mjs` の `PARAMS` だけ触る。

| 症状 | 直すところ |
|---|---|
| ゾーンが広すぎる／狭すぎる | `maxSpan`（幅の上限）／`minW`（幅の下限）。どちらもその足の ATR の倍数 |
| 「付近」が多すぎる／少なすぎる | `nearAtr1h`（1時間足の ATR の何倍以内を付近とするか） |
| 複数足の重なり（★）が多すぎる | `confTol1h` を小さく |
| 反発回数の少ない線まで出る | `minTouch` を 3 に |
| 通知の件数 | `hotMax` |

変えたら `node zones-test.mjs` を通すこと。
