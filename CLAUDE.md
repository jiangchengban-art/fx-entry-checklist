# fx-entry-checklist プロジェクト

もちぽよアラート式 FXエントリーチェックリスト＆トレード記録ツール

## プロジェクト概要

- **ファイル**: `index.html` （単一ファイル、CDN依存なし、完全オフライン動作）
- **技術スタック**: HTML5 + CSS3 + Vanilla JavaScript
- **データ永続化**: localStorage (キー: `mochipoyo_trades_v1`, `mochipoyo_theme`)
- **独立性**: FX Trade Tracker とは完全に分離（別の localStorage キーを使用）

## ユースケース

FX トレーダーがエントリー前に15項目のチェックリストで根拠を確認（OK/NG選択） → トレード記録フォームで詳細を入力 → 過去の履歴を参照して統計分析

## 機能リスト

### 1. エントリーチェックリスト（15項目、OK/NG選択式）
グループ別アコーディオン表示

**上位足（7項目）:**
- 環境認識 / ボラティリティ / 上位足トレンド / 上位足値動き / 上位足RCI / 上位足MACD / 上位足高安ライン

**エントリー足（6項目）:**
- EMA確認 / エントリー足トレンド勢い / MACD確認 / RCI確認 / ロールリバーサル / ラウンドナンバー

**その他（2項目）:**
- 損切り位置 / マインド

選択方式：各項目に「OK」「NG」ボタン（トグル式、未選択も可能）
- 保存前警告：NG項目がある場合のみ表示
- 進捗表示：「OK n/合計（NG n）」の形式
- チェック状態をスナップショットとして記録に含める

### 2. エントリーパターン
トレード記録フォーム最初の必須項目。4パターン選択：
- 15分足×4時間足
- 1時間足×日足
- 4時間足(8時間足)×週足
- 日足×週足(月足)

### 3. トレード記録フォーム
- エントリーパターン、日時、通貨ペア（主要8ペア + 自由入力）、スタイル、上位足/エントリー足、方向、エントリー/損切り/決済価格、pips、振り返り
- 決済価格・pips は任意入力（未確定時は空欄のまま保存可）

### 4. 履歴一覧
- 新しい順のカード表示、方向別色分け、NG項目をバッジで表示、削除機能

### 5. 統計サマリー（タブ化）
- 下部タブバー「📊統計」として独立
- トレード数、勝率、合計pips、平均pips、チェック遵守率
- 決済済み（pips入力済み）のトレードを対象に集計

### 6. 追加機能
- CSV エクスポート/インポート（BOM付きUTF-8、id重複検出、互換性あり）
- ダーク/ライト切替（localStorage保存）
- タブベースUI（4タブ：✅チェック / 📝記録する / 📚履歴 / 📊統計）、画面下部固定ナビ

## タブ構成

| タブ | アイコン | 機能 |
|------|---------|------|
| チェック | ✅ | 15項目チェックリスト（グループアコーディオン） |
| 記録する | 📝 | トレード記録フォーム |
| 履歴 | 📚 | 過去のトレード記録一覧 |
| 統計 | 📊 | 統計サマリー（新設） |

## カラーパレット

dataviz スキル準拠。ライト/ダーク両モード対応。

- **ダークモード**: surface #1a1a19 / accent #3987e5 / good #0ca30c / bad #e66767
- **ライトモード**: surface #fcfcfb / accent #2a78d6 / good #006300 / bad #d03b3b

## 実装状態
**✅ 本番使用可能** | 全機能検証済み（2026-07-26）

詳細は [`MEMORY.md` → verification-2026-07-26](../../.claude/projects/c--Users-owner-fx-entry-checklist/memory/verification_2026_07_26.md) を参照

### 検証済み機能
- ✅ チェックリスト（OK/NGボタン、アコーディオン、進捗表示）
- ✅ トレード記録フォーム（全フィールド入力、バリデーション）
- ✅ トレード記録保存（localStorage）
- ✅ 履歴表示（カード形式、NG項目バッジ）
- ✅ 統計計算（正確な統計表示）
- ✅ テーマ切り替え（ダーク/ライト）
- ✅ レスポンシブ（PC/モバイル対応）
- ✅ CSV機能（エクスポート）

## 開発上の注意点

### 編集時の確認項目
- JS 構文チェック: `node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const m=html.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log('OK')"`
- **次のテスト推奨項目**（メモリ参照）:
  - CSV ラウンドトリップテスト（OK/NG選択値の往復確認）
  - 複数トレードでの統計検証
  - エッジケース（空履歴、全NG、大量データ）
- スマホレスポンシブ確認（タブバーのセーフエリア対応、notch対応、下部パディング100px）
- OK/NG状態の視覚的な区別確認（緑/赤背景）

### CSV列構成
`id`, `entryPattern`, `datetime`, `pair`, `style`, `tfHigher`, `tfEntry`, `direction`, `entryPrice`, `slPrice`, `exitPrice`, `pips`, `notes`, `check1～check15` (ok/ng/空欄), `createdAt`

互換性：旧形式の `1`/`0` も読込可能（`1`→`ok`に変換）

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
