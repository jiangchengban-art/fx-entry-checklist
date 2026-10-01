# 📍 ネックラインゾーンの定期分析（Routine の手順）

1日4回（日本時間 7:00 / 13:00 / 17:00 / 21:00 の少し前）に Claude の Routine が新しいセッションでこの手順を実行する。
アプリ（👀監視リスト）は `zones-data` ブランチの `zones.json` を読むだけ。

## 手順（Routine の Claude が行う）

1. リポジトリを最新の master にする
   ```bash
   cd <repo> && git fetch origin master && git checkout -B zones-run origin/master
   ```
2. TradingView MCP の `mcp-tv-get-ohlcv` で、`tools/zones/zones.mjs` の `SYMBOLS` にある28銘柄 × `1h` / `4h` / `1D` の **84本**を取得する
   - `count: 1500` を必ず付ける。結果が大きいので Claude Code が `tool-results/` にファイルで保存し、会話にはパスだけが返る（＝使用量が小さい）
   - 1回の返信で並列にまとめて呼ぶ（28本ずつ3回程度）
   - **中身を読もうとしないこと**（jq や Read で開かない。スクリプトが読む）
3. ゾーンを計算する
   ```bash
   node tools/zones/zones.mjs ~/.claude/projects/*/*/tool-results --out /tmp/zones.json --since-min 60
   ```
   `未取得:` が出たら、その銘柄・足だけもう一度取得して再実行する（2回目も取れなければそのまま進む）
4. `zones-data` ブランチに置く（このブランチはデータ専用。履歴を増やさないよう毎回1コミットで上書きする）
   ```bash
   git checkout --orphan zones-tmp && git rm -rf --cached . >/dev/null && cp /tmp/zones.json ./zones.json \
     && git add zones.json && git commit -m "zones $(date -u +%FT%TZ)" && git push -f origin zones-tmp:zones-data
   ```
5. 最後の返信は、スクリプトが `---` の下に出した通知文をそのまま貼る（スマホに通知される）

## 使用量の目安（S106で実測）

- ローソク足の取得1本あたり、会話に残るのは約650トークン（パスと案内文だけ）→ 84本で約5.5万トークン
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
