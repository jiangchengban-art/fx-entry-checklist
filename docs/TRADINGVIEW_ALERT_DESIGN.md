# TradingView アラート → 👀監視リスト 自動連携：設計（S104）

`docs/TRADINGVIEW_ALERT_HANDOFF.md` を受けて、2026-09-30 の開発セッションで確認した事実と設計。**まだ実装していない。**

---

## 0. 引き継ぎメモからの訂正（重要）

| メモの記述 | 実際（S97以降の現行アプリ） |
|---|---|
| `w.alerts[tf] = { on, at }`（tf = h1/h4/d/w）に書く | それは旧🔭巡回一覧（market_view）のモデルで、S97で画面ごと撤去済み。**今の書き込み先は👀監視リストのアイテム**：`trades` 配列の `{ kind:'scalpwatch'｜'trendwatch', pair, ng, ok, notes, alerts:{ '1H': ISO, '4H': ISO, 'D': ISO, 'W': ISO }, createdAt, updatedAt }` |
| Supabase の行 id は `p:<PAIR>` | 監視アイテムは **`t:<id>` 行**（id は `sw_…`/`tw_…`）。`data` にアイテム丸ごと、マージは `updatedAt` の新しい方が**アイテム単位**で勝つ（`mergeTrades`）。削除は `tomb` 行の `trades[id] = 時刻` |
| plot_2 / plot_3 がエントリー系（要再確認） | **確認済み**：`plot_2`=long sign、`plot_3`=short sign（エントリー）、`plot_0`=LONG EXIT、`plot_1`=SHORT EXIT |
| 156本 | アクティブ 156本＝1W 48 / 60 28 / 240 48 / 1D 32。**すべて銘柄×足につき long+short の2本**（直近3日のログにも EXIT の発火は無し）→ エグジット系アラートは現状存在しない模様 |

- 監視アイテムの `alerts[tf]` は「鳴った時刻の ISO 文字列」だけ（ON/OFF は キーの有無）。🔔未確認欄はこれを古い順に並べ、✓で消す。**この形に書けば、アプリ側は同期で受けるだけで自動表示される**
- アプリは表示中30秒ごとに差分取得している（`syncPullIfVisible`）ので、クラウドに書けば最大30秒＋αで端末に届く。定期取得の追加は不要

## 1. TradingView 側で確認した事実

- 全アラートが同じインジケーター `もちぽよアラート【ver.04】`（`PUB;7f6763c7e15949dc81783bae0ac1fea2`）、`has_webhook: false`、email/push/popup ON
- 現在のメッセージは足ごとの印つきで手入力されている：60→`❶short sign {{close}}`、240→`④short sign …`（ログで確認。get-alerts ではメッセージ本文は見えない）。**メッセージを書き換えると、スマホの push 通知の文面も変わる**
- 銘柄表記 → アプリの通貨名：`{{ticker}}` がそのまま一致（USDJPY, GOLD, SILVER, SPX500, NAS100, US30, JP225, UK100, DAX40, BTCUSDT, ETHUSDT …）。**例外は `WTICOUSD` → `OIL` だけ**
- `{{interval}}` → `60` / `240` / `1D` / `1W`。`{{timenow}}` は UTC の ISO
- MCP の制約：Webhook 付きアラートは作成も更新もできない（2FA 検証が MCP 未対応）。**Webhook URL を入れる前に MCP でメッセージを一括設定 → 将成さんは URL を貼るだけ**、の順番は引き継ぎどおり
- Webhook を使わない案：TradingView の alerts log は MCP からしか読めない（Supabase から TradingView へは取りに行けない）。Claude の定期実行（Routine）で毎時ログを読んで書き込む形になり、**毎時1セッション＝トークン消費が大きく、遅延も最大1時間**。比較用としては非推奨

## 2. この開発環境の制約

- **このクラウド環境から `*.supabase.co` / `api.supabase.com` へは 403（ネットワークポリシーで遮断）**。Edge Function の deploy・動作確認・本番表の読み書きはここからはできない
  - 対処A：Supabase ダッシュボードの Edge Functions エディタに、こちらで書いたコードを貼って deploy（将成さんの手作業）
  - 対処B：環境のネットワーク許可リストに `inqvrsfzskjusmbwlimx.supabase.co` と `api.supabase.com` を足し、環境シークレットに `SUPABASE_ACCESS_TOKEN` を入れる → こちらから `npx supabase functions deploy` できる
- パースとマージのロジックは Node で単体テストできる形（純関数）に切り出す。deploy 後の疎通は curl で確認

## 3. 設計（推奨：Webhook → Supabase Edge Function）

```
TradingView(alert fire) ──POST(message)──▶ Edge Function tradingview-alert
                                              │ 1) ?key= を検証（本文には秘密を入れない）
                                              │ 2) message を解析 → ticker/interval/timenow/side/kind
                                              │ 3) kind≠entry は無視、ticker→通貨名、interval→(kind,tf)
                                              │ 4) trades_checklist から該当アイテムの t: 行と tomb 行を読む
                                              │ 5) 生きているアイテムがあれば alerts[tf]=time、無ければ新規作成
                                              │ 6) updatedAt=now で upsert（updated_at=now）
                                              ▼
                                       trades_checklist（t:sw_…／t:tw_…）
                                              │ 差分取得（30秒ごと）→ mergeTrades → renderAll
                                              ▼
                              3端末の 👀監視リスト／🔔未確認アラート／タブの赤バッジ
```

### 3.1 アラートメッセージ（MCP で一括設定）

秘密トークンは **URL のクエリ（`?key=…`）** に置き、本文は人が読める形のまま解析可能にする（push 通知の文面を JSON の塊にしない）：

```
❶ short sign {{close}} | {{ticker}} {{interval}} {{timenow}}
④ long sign {{close}} | {{ticker}} {{interval}} {{timenow}}
```

- `|` の左＝いまの文面のまま（印・long/short・価格）、右＝解析用の3語。関数は `^(.*)\|\s*(\S+)\s+(\S+)\s+(\S+)\s*$` で読み、左側に `long`/`short`、`exit` の有無で side/kind を決める
- long/short は plot（plot_2/plot_3）に合わせて MCP 側で埋める（`{{ticker}}` 等は TradingView が発火時に置換）
- 印：60→❶、240→④、1D→Ⓓ、1W→Ⓦ（いまの命名に合わせる。1W は名前が「週足⬆️long」なので印は任意）

### 3.2 対応表

| `{{interval}}` | 監視リスト | tf | 自動追加時の id |
|---|---|---|---|
| `60` | ⚡ `scalpwatch`（**1Hはスキャル用**、🔭には書かない） | `1H` | `sw_tv_<PAIR>` |
| `240` | 🔭 `trendwatch` | `4H` | `tw_tv_<PAIR>` |
| `1D` | 🔭 `trendwatch` | `D` | 〃 |
| `1W` | 🔭 `trendwatch` | `W` | 〃 |

ticker→通貨名：`WTICOUSD→OIL`、それ以外はそのまま。対応表に無い ticker は 200 で無視してログに残す（TradingView は 4xx/5xx で再送・停止するため、拒否は key 不一致だけ 403）。

### 3.3 行の読み書き（Edge Function の中）

1. `GET /rest/v1/trades_checklist?select=id,data&data->>kind=eq.<kind>&data->>pair=eq.<PAIR>` と `?id=eq.tomb`
2. 各候補について `tomb.trades[id] >= (updatedAt||createdAt)` なら削除済みとして除外（クラウドの `t:` 行は削除されず残るため、**必ず墓標を見る**）
3. 生きている候補のうち `updatedAt` 最新のものを採用。無ければ新規 `{ id:'<sw|tw>_tv_<PAIR>', kind, pair, ng:{granville:false,rci:false,macd:false}, ok:{…false}, notes:'', alerts:{}, createdAt:now, updatedAt:now }`（同じ id を使い回すので、削除→再発火でも二重にならない。墓標より新しい `updatedAt` なので復活は正しく通る）
4. `alerts[tf] = timenow`、`alertSide[tf] = 'long'|'short'`（新フィールド、任意）、`updatedAt = now`
5. `POST` `Prefer: resolution=merge-duplicates` で `{ id:'t:'+id, data, updated_at: now }`。認証は Edge Function に自動で入る `SUPABASE_SERVICE_ROLE_KEY`

### 3.4 端末間マージとの整合

- 関数は通常の `t:` 行を書くだけなので、アプリの同期コードは**無改修**で受け取れる（他端末の更新と同じ扱い）。✓で外す・🔔再タップ・🗑削除もそのまま効き、関数は「新しい発火」でしか書かないので消したアラートが復活することはない
- 既知のトレードオフ：`mergeTrades` はアイテム丸ごと後勝ちなので、**発火の数秒以内に同じ通貨の✅✖をタップしていた**と、どちらかが負ける（タップが戻る／アラートが落ちる）。個人ツールとして許容し、実害が出たら「アラートを `a:` の追記行にして端末側で当てる」方式へ上げる（関数は行を1つ insert するだけになり衝突が消えるが、アプリ側に取り込み処理が要る）

### 3.5 セキュリティ・運用

- `verify_jwt = false`（TradingView は Authorization ヘッダを付けない）。代わりに `?key=<ランダム32文字以上>` を必須にし、`TV_WEBHOOK_KEY` は Edge Function の secrets に置く。任意で TradingView の送信元 IP（52.89.214.238 / 34.212.75.30 / 54.218.53.128 / 52.32.178.7）も確認
- 発火時刻が同じ再送は同じ値を書くだけ（冪等）
- 送信ログは Supabase のダッシュボード（Functions → Logs）。TradingView 側は alerts log の `webhook` 列で配送結果が見える（MCP `get-alerts-log` で確認できる）

## 4. アプリ側の変更（小さい）

必須ではないが入れたいもの：
- 🔔未確認欄の行に **▲long／▼short** を出す（`alertSide[tf]`）。文字1つ分で375pxに収まる
- 自動追加されたアイテムの目印（例：id が `_tv_` なら通貨名の右に小さく `TV`）
- `📖 使い方` に「TradingView から自動で入る」旨を1行

CSV・統計・`mainTrades()`・同期コードは無変更。

## 5. 作るもの・置き場所

- `supabase/functions/tradingview-alert/index.ts` … Deno.serve。key 検証・REST 呼び出しだけ
- `supabase/functions/tradingview-alert/core.mjs` … `parseMessage()` / `planUpdate(rows, tomb, parsed, now)` の純関数（Deno からも Node からも import できる）
- `tv-alert-test.mjs` … core の単体テスト（解析・対応表・墓標除外・新規作成・冪等）
- `supabase/config.toml` … `[functions.tradingview-alert] verify_jwt = false`
- `docs/TRADINGVIEW_ALERT_SETUP.md` … 将成さん向けの手順（deploy・secrets・URL 貼り付け・確認方法）

## 6. 導入の順番（1H から）

1. Edge Function を deploy（§2 の対処A or B）、secrets に `TV_WEBHOOK_KEY`、curl で疎通
2. **MCP で 60 のアラート28本のメッセージを §3.1 の形に一括更新**（Webhook を入れる前に！入れた後は MCP から触れない）
3. 将成さんが TradingView で28本に Webhook URL（`https://inqvrsfzskjusmbwlimx.supabase.co/functions/v1/tradingview-alert?key=…`）を貼る。前提：有料プラン＋2FA 有効
4. 次の発火で ⚡👀監視リストの🔔未確認に出るか確認（alerts log の `webhook` 列でも）
5. 問題なければ 240 → 1D → 1W（計114本）へ拡大

## 7. 決定（2026-09-30、将成さん確認済み）

1. **方式**：Webhook＋Edge Function で進める
2. **メッセージ**：§3.1 の時刻付きの形。156本全体を MCP で書き換える（Webhook を貼る前に）
3. **1H は ⚡だけ**に入れる
4. **deploy**：環境のネットワーク許可（`inqvrsfzskjusmbwlimx.supabase.co`・`api.supabase.com`）＋環境シークレット `SUPABASE_ACCESS_TOKEN` で、開発セッションから `npx supabase functions deploy`
