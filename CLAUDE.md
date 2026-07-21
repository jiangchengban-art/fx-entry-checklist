# fx-entry-checklist プロジェクト

もちぽよアラート式 FXエントリーチェックリスト＆トレード記録ツール

## プロジェクト概要

- **ファイル**: `index.html` （単一ファイル、CDN依存なし、完全オフライン動作）
- **技術スタック**: HTML5 + CSS3 + Vanilla JavaScript
- **データ永続化**: localStorage (キー: `mochipoyo_trades_v1`, `mochipoyo_theme`)
- **独立性**: FX Trade Tracker とは完全に分離（別の localStorage キーを使用）

## ユースケース

FX トレーダーがエントリー前に8項目のチェックリストで根拠を確認 → トレード記録フォームで詳細を入力 → 過去の履歴を参照して統計分析

## 機能リスト

### 1. エントリーチェックリスト（8項目）
- 環境認識 / ボラティリティ / 上位足指標 / EMA確認 / MACD確認 / RCI確認 / 損切り位置 / マインド
- 未チェックでも保存可（警告モーダル表示）
- チェック状態をスナップショットとして記録に含める

### 2. トレード記録フォーム
- 日時、通貨ペア（主要8ペア + 自由入力）、スタイル、上位足/エントリー足、方向、エントリー/損切り/決済価格、pips、振り返り
- 決済価格・pips は任意入力（未確定時は空欄のまま保存可）

### 3. 履歴一覧
- 新しい順のカード表示、方向別色分け、削除機能

### 4. 統計サマリー
- トレード数、勝率、合計pips、平均pips、チェック遵守率

### 5. 追加機能
- CSV エクスポート/インポート（BOM付きUTF-8、id重複検出）
- ダーク/ライト切替（localStorage保存）
- タブベースUI（✅チェック / 📝記録する / 📚履歴）、画面下部固定ナビ

## カラーパレット

dataviz スキル準拠。ライト/ダーク両モード対応。

- **ダークモード**: surface #1a1a19 / accent #3987e5 / good #0ca30c / bad #e66767
- **ライトモード**: surface #fcfcfb / accent #2a78d6 / good #006300 / bad #d03b3b

## 開発上の注意点

### 編集時の確認項目
- JS 構文チェック: `node -e "new Function(src)"`
- CSV ラウンドトリップテスト（特殊文字・改行・引用符対応）
- スマホレスポンシブ確認（タブバーのセーフエリア対応、下部パディング100px）

### 拡張計画（実装されていない）
- 📝 **記録の後日編集モーダル** → 決済価格/pips の事後入力
- 📊 **期間フィルター** → 統計画面で日付範囲指定
- 🏷 **タグ・カテゴリ** → 手法ごとの分類集計
- 📤 **FX Trade Tracker 連携** → データエクスポート時の形式変換
- 📱 **PWA化** → Web App Manifest 追加、Service Worker 強化

### 既知の制限
- 記録の編集機能なし（削除して再作成が必要）
- ブラウザの localStorage 容量上限（通常 5-10MB、数千件のトレード記録で注意）

## URL

| 環境 | URL |
|------|-----|
| jsDelivr CDN（推奨） | https://cdn.jsdelivr.net/gh/jiangchengban-art/fx-entry-checklist@master/index.html |
| GitHub Pages | https://jiangchengban-art.github.io/fx-entry-checklist/ |
| GitHub 本体 | https://github.com/jiangchengban-art/fx-entry-checklist |

## ローカル実行

```bash
cd fx-entry-checklist
python -m http.server 8000
# http://localhost:8000 で開く
```

## メモリ

[[fx_entry_checklist_project.md]] を参照。
