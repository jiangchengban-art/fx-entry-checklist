# TradingView アラート自動連携：導入手順（将成さん向け）

設計は `docs/TRADINGVIEW_ALERT_DESIGN.md`。ここは「やること」だけ。

## A. 開発セッションから deploy できるようにする（1回だけ）

1. Claude Code のセッション画面のタイトルバー → クラウド環境メニュー → **Edit**
2. **Network access** に次の2つを許可ドメインとして追加（またはアクセスレベルを広げる）
   - `inqvrsfzskjusmbwlimx.supabase.co`
   - `api.supabase.com`
3. **環境シークレット**に `SUPABASE_ACCESS_TOKEN` を追加
   - 値：Supabase ダッシュボード → 右上のアカウント → **Access Tokens** → Generate new token（名前は `claude-code` など）
4. 新しいセッションを起動して「Edge Function を deploy して」と言う。開発側で行うコマンド：
   ```bash
   npx supabase functions deploy tradingview-alert --project-ref inqvrsfzskjusmbwlimx --no-verify-jwt
   npx supabase secrets set TV_WEBHOOK_KEY=<ランダム32文字以上> --project-ref inqvrsfzskjusmbwlimx
   ```
   `TV_WEBHOOK_KEY` は開発側で生成してこの手順書の末尾に **書かない**（チャットで1回だけ伝える）

## B. 動作確認（deploy 直後・開発側）

```bash
curl -sS -X POST "https://inqvrsfzskjusmbwlimx.supabase.co/functions/v1/tradingview-alert?key=<TV_WEBHOOK_KEY>" \
  -H "Content-Type: text/plain; charset=utf-8" \
  --data-binary '❶ short sign 188.337 | CHFJPY 60 2026-09-30T11:00:00Z'
```
→ `{"ok":true,"pair":"CHFJPY","tf":"1H","side":"short",...}` が返り、30秒以内に ⚡👀監視リストの「🔔 未確認アラート」に `CHFJPY 1H ▼` が出れば OK（無ければ自動追加される）。確認したら ✓ で消す。

## C. アラートのメッセージを一括設定（開発側が MCP で実施・Webhook を貼る **前**）

162本すべてを次の形にする（左半分は今の文面、右に解析用の3語）：
```
❶ short sign {{close}} | {{ticker}} {{interval}} {{timenow}}
```
印：60→❶、240→④、1D→Ⓓ、1W→Ⓦ。long/short はアラートの条件（plot_2=long / plot_3=short）から入れる。
push 通知の文面は `❶ short sign 188.337 | CHFJPY 60 2026-09-30T11:00:00Z` のようになる。

## D. Webhook URL を貼る（将成さんの手作業・TradingView の画面で）

前提：有料プラン（Essential 以上）で **2段階認証が有効**であること。

URL（`<TV_WEBHOOK_KEY>` は開発側から受け取った値）：
```
https://inqvrsfzskjusmbwlimx.supabase.co/functions/v1/tradingview-alert?key=<TV_WEBHOOK_KEY>
```

1. TradingView 右パネルの **アラート** 一覧 → 対象アラートの ✎（編集）
2. **通知** タブ → **Webhook URL** にチェック → 上の URL を貼る → 保存
3. まず **60（1時間足）の48本**だけ行う。1〜2日運用して問題なければ 240 → 1D → 1W（計114本）

⚠️ Webhook を入れたアラートは MCP から編集できなくなる（メッセージ変更も手作業）。だから C を先に。

## E. 届いているかの確認

- アプリ：⚡👀／🔭👀 の「🔔 未確認アラート」に自動で行が増える（▲long／▼short 付き）。下部タブに赤バッジ
- TradingView：アラート一覧の「ログ」で各発火の Webhook 配送結果（開発側は MCP `get-alerts-log` の `webhook` 列で見られる）
- Supabase：ダッシュボード → Edge Functions → tradingview-alert → Logs に `[tv] CHFJPY 1H short updated sw_…` の行

## F. 困ったとき

| 症状 | 見るところ |
|---|---|
| 発火したのにアプリに出ない | TradingView のログで Webhook が失敗していないか → Supabase の Functions Logs に 403（key 違い）／`unparsed`（メッセージの形が違う）／`unknown interval` が無いか |
| 別の通貨名で追加される | `core.mjs` の `PAIR_MAP`（いまは `WTICOUSD→OIL` だけ）に対応を足す |
| 1H を🔭にも出したい | `core.mjs` の `TF_MAP['60']` を変える（設計上は⚡のみ） |
| 秘密が漏れた | `npx supabase secrets set TV_WEBHOOK_KEY=<新しい値>` → 貼った URL をすべて更新 |
