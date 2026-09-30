# TradingView アラート → FX Entry Checklist 自動連携：引き継ぎメモ

別セッション（TradingView接続のあるセッション）で検討した内容の引き継ぎ。
**実装はまだ何もしていない**（コード・Supabase とも未変更）。このメモを前提に、開発セッションで設計・実装を進める。

---

## 1. やりたいこと（将成さんの要望）

- TradingView の「もちぽよアラート【ver.04】」インジケーター条件のアラートが鳴ったら、アプリの 🔭監視リストの該当銘柄に自動でアラートON＋発生時刻を記録したい
- 対象はインジケーター条件が「もちぽよアラート」のアラート（アラート名ではなく条件で判定）
- **1Hアラートはスキャル用**
- 監視リストに無い銘柄は**自動で追加**してよい
- エントリー系シグナルだけ反映し、エグジット系は無視したい
- アラート名の命名ルール：◆＝常設、◇＝一時的

## 2. 分かっている事実

- アクティブなアラートは約170本、全部が同じ「もちぽよアラート【ver.04】」インジケーター
- TradingView API（MCP）で取れる情報：銘柄、時間足（resolution）、条件（condition_type / alert_cond_id）、名前。**メッセージ本文は取得できない**
- 時間足の対応：`60`→`h1`、`240`→`h4`、`1D`→`d`、`1W`→`w`
- エントリー/エグジットの区別は alert_cond_id（plot番号）で行える見込み。前セッションでは plot_2 / plot_3 がエントリー系と判断したが、**要再確認**
- アプリ側：`w.alerts[tf] = { on, at }`（tf = h1/h4/d/w）で時間足ごとのON状態と時刻を保持（S18, S71）
- 同期：Supabase テーブル `trades_checklist`、行 id は `p:<PAIR>` 形式（例 `p:AUDUSD`）、`data` は JSONB。正確な行構造は index.html の同期コードで要確認

## 3. Webhook の制約（重要・前セッションの説明の訂正を含む）

- TradingView はWebhook URLの設定に**2段階認証の確認**を要求する。MCP接続はこれに未対応のため、**Webhook URL の入力は将成さんが TradingView 上で1本ずつ手作業**になる
- 前セッションで「Webhook設定後はAPIで自由に編集できる」と説明したが**誤り**。MCPの説明文によると、**Webhook付きのアラートはMCPから更新できなくなる**（名前・メッセージ変更も tradingview.com での手作業）
- MCPでできること（Webhook無しのアラートに対して）：名前・メッセージ・通知設定・有効期限の変更、作成、削除
- **推奨の順番**：Webhook を入れる前に、MCP で各アラートの「メッセージ」を下記JSONに一括設定しておく → 将成さんは Webhook URL を貼るだけで済む
- 前セッションで示した URL `https://inqvrsfzskjusmbwlimx.supabase.co/functions/v1/handle-tradingview-alert` は**仮のもの。まだ存在しない**

### アラートメッセージ案（TradingViewのプレースホルダー使用）
```json
{"secret":"<共有トークン>","ticker":"{{ticker}}","exchange":"{{exchange}}","interval":"{{interval}}","time":"{{timenow}}","name":"<アラート名>","kind":"entry"}
```
- `{{interval}}` は `60` / `240` / `1D` / `1W` のような値
- `{{ticker}}` は `AUDUSD` など。指数・コモディティ（SPX500, GOLD 等）はブローカーごとに表記が違うので対応表が必要

## 4. 決めること・作るもの（開発セッション向け）

1. **受け口**：Supabase Edge Function（例 `tradingview-alert`）
   - secret 検証 → ticker をアプリの銘柄名に変換 → interval を h1/h4/d/w に変換 → `p:<PAIR>` 行を読み `alerts[tf] = {on:true, at:time}` を書き込み（無ければ監視リストに新規追加）
   - 端末間マージ（updatedAt / tombstone）と矛盾しないこと
2. **アプリ側**：他端末からの更新と同じく、Supabase 同期で自動反映されるか確認。必要なら「自動追加」バッジ等
3. **導入順**：まず 1H（約50本）で試す → 問題なければ 4H/D/W に拡大
4. **Webhook を使わない案**（比較用）：定期実行で TradingView のアラート履歴（alerts log）を取得して反映。手作業ゼロだが遅延あり。クラウド環境から Supabase へは proxy で 403 になったので、実行場所に要検討

## 5. 前提条件の確認事項

- TradingView の有料プラン（Webhook は有料機能）と 2段階認証がアカウントで有効か
- Supabase の Edge Function を使えるか（プロジェクト `inqvrsfzskjusmbwlimx`）
