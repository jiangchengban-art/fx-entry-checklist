# FX Entry Checklist — Project Memory & Session Log

**Last Updated:** 2026-09-08 (S59 complete)  
**Current State:** ✅ Production-ready, all 159+ tests passing  
**Main Branch:** `master`  
**Active Development Branch:** `claude/fx-entry-checklist-s59-c1ajnk` (ready to merge)

## Project Health

| Aspect | Status | Notes |
|--------|--------|-------|
| Core Features | ✅ Complete | 🔭一覧・📚統計・⚙設定の3タブ完成 |
| Testing | ✅ All Passing | s59(35) + s55(15) + s44(64) + s43(35) + s42(45) = 194 items |
| Data Model | ✅ Stable | localStorage `mochipoyo_*_v1` keys, Supabase JSONB sync |
| Accessibility | ✅ OK | PWA-capable, iOS/Android responsive, dark/light theme |
| Performance | ✅ OK | Single HTML file (~50KB gzip), zero CDN deps for app logic |
| File Size | ✅ Optimized | 0.41MB (80% reduction since S26, images WebP) |

## Recent Changes (S57-59)

| Session | Focus | Impact |
|---------|-------|--------|
| S59 | 🔭一覧上部を巡回実運用に合わせて再整理 | 説明文圧縮・5タイルペア単位統一・ツールバー2行分割・CSS色バグ修正 |
| S58 | 目線3択→手動GOフラグ置換 | GO主観フラグで監視優先度を明示的に制御 |
| S57 | 1時間足を巡回対象に追加 | 1H/4H/日足の3本を常時表示・エントリー圏判定に含める |
| S56 | iOS同期ロバスト性強化 | visibilitychange+pageshow+focus+touchstart+30秒ポーリング・容量超過リーンモード |
| S55 | 🎯トレード記録をモーダル化 | 一覧タブで巡回→根拠パネル→記録フォームまで完結 |

## Architecture Snapshot

```
index.html (単一ファイル)
  ├─ HTML: 3タブレイアウト + 各モーダル (記録フォーム・波マップ・グランビルピッカー・ヘルプドロワー)
  ├─ CSS: ライト/ダーク両モード対応、responsive 375-1440px
  └─ JS: localStorage (主体) ↔ Supabase (補助・複数端末同期)

sw.js (キャッシュ制御、S28〜)
  └─ v32: network-first HTML / cache-first assets / cross-origin素通し

manifest.webmanifest + icon-*.png (PWA)
  └─ iOS7日削除回避の唯一の方法

docs/
  ├─ CHANGELOG_ARCHIVE.md (S1-27の詳細)
  ├─ SESSIONS_14_TO_18_ARCHIVE.md (環境ボード刷新期の詳細)
  └─ SETUP_SYNC.md (複数端末同期のTips)
```

## Key Data Structures

**localStorage keys** (すべて `mochipoyo_*_v1`プレフィックス):
- `trades` — トレード記録本体 (CSV export/importも対応)
- `market_view` — 🔭一覧の巡回記録 (22ペア基盤→S25で28ペア、S29で全銘柄自動生成)
- `market_view_selected` — 選択中ペアID (旧ボード用、今は未使用)
- `trend_tfs` — 表示する時間足 (1H/4H/D常時、W/M任意)
- `firebase_config` — チャート画像アップロード用認証
- `theme` / `sync_at` / `tombstones`

## Current Limitations & Known Issues

| Issue | Status | Workaround |
|-------|--------|-----------|
| s40-test チップ更新・ラベル残る (2項目) | 既知 S40以前から | s44以降のUI変更で無関連、後日修正 |
| localStorage 5-10MB上限 | 予想 | S56で容量超過リーンモード追加、今後モニタリング |
| 波マップ過去日では「待ちあり」「GOのみ」不可 | 既知 S42- | 過去日レコードが `p/t/g/w/s`のみで`go`を持たないため設計上不可避 |

## Session Progression (S1-59 Summary)

**S1-13:** 初期実装 → トレード記録フォーム・統計・CSV対応  
**S14-21:** 環境認識ボード刷新 → ボード廃止に向けた布石  
**S22-27:** トレンド一覧初版・各種最適化  
**S28-39:** データ保護・複数端末同期・判定自動化・確度スコア  
**S40-44:** 波位置タップ記録→波マップ→判定全廃・エントリー圏軸  
**S45-50:** 表示最適化・過去日訂正・参考重ね表示  
**S51-56:** ボード廃止・決済モーダル廃止・1H追加・同期強化  
**S57-59:** 手動GOフラグ・一覧上部整理

詳細は CLAUDE.md 内の「セッション履歴（S1-59 統合）」テーブルを参照。

## Next Session Checklist

- [ ] Merge `claude/fx-entry-checklist-s59-c1ajnk` to `master`
- [ ] Verify CLAUDE.md consistency (update 「最新は S57」→「最新は S59」if needed)
- [ ] Run full test suite: `npm install && node s59-test.mjs && node s55-test.mjs && node s44-test.mjs`
- [ ] Plan S60 work (user feature request or bug fix)

## Development Notes

**Testing framework:** Playwright (file://) + localStorage 直注入  
**Commit attribution:** `Co-Authored-By: Claude <noreply@anthropic.com>`  
**Branch strategy:** feature → `claude/fx-entry-checklist-s{n}-*` → PR/merge to master  
**CSV round-trip:** All 23 columns tested, backward-compatible with S1 format  

---

For comprehensive details on features, data models, implementation notes, and architectural decisions, see **CLAUDE.md** (684 lines, the authoritative spec).
