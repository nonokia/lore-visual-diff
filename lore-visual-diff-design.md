# Lore Visual Diff — 設計ドキュメント

LoreをラップしたWebベースの画像ビジュアルDiffツール。個人プロジェクト／ポートフォリオとして開発する。

> **命名に関する注意:** 「lore」という同名の別VCS（lorevcs.com、intent管理CLI）が存在し検索が汚染されている。リポジトリ名は `lore-visual-diff` のようにEpic側のLoreを対象と分かる形にする。

---

## 1. 背景・動機

Epic GamesがOSSとしてリリースしたVCS「Lore」は、バイナリファイルをfirst-classで扱う設計だが、**ビジュアルなdiff機能は意図的にスコープ外**（`lore diff` / `lore file diff` はunified diff＝テキスト前提であることをCLIリファレンスで確認済み）。この空白を埋めるWeb UIを構築する。

### Loreの特徴（設計に関係するもの）
- Rust製、MITライセンス、pre-1.0（v0.8.x）
- content-addressed storage（BLAKE3ハッシュ、Merkleツリー）＋ immutable revision chain
- バイナリをopaque byte streamとして扱い、chunk単位で差分管理・重複排除
- CLIで全機能にアクセス可能。JS含む多言語バインディングも提供

---

## 2. 検証済みのLore CLIプリミティブ（設計の根幹）

デモモード実機確認前だが、公式CLIリファレンスで以下を確認済み。

| 目的 | コマンド | 備考 |
|---|---|---|
| 任意リビジョンのファイル取得 | `lore file write --path <PATH> --revision <REV> --output <OUT>` | ワークスペースsync不要で直接書き出し |
| コンテンツハッシュ直指定の取得 | `lore file write --address <ADDRESS>` | キャッシュヒット時の再取得などに |
| ファイル単位の履歴 | `lore file history <PATH> [LENGTH] --oneline` | UIの履歴リスト表示に使用 |
| DLなしでファイル情報取得 | `lore file info --revision <REV>` | ハッシュが取れる → キャッシュキー生成 |
| 実体なしクローン | `lore clone --bare` | リビジョンツリーのみ保持 |

### 実機で確認すべき残項目（最初のスパイク）
- [ ] 各コマンドの実出力形式（`--json` 相当が見当たらないため、テキストパース前提になる可能性大）
- [ ] `--revision` の指定形式（フルハッシュ／短縮形／相対指定の可否）
- [ ] `file write` の大容量ファイルでの挙動・速度
- [ ] `file history` がリネーム（`stage move`）をどう追跡するか

---

## 3. アーキテクチャ

```
┌─────────────────────────────────────────────┐
│ Frontend: Next.js (TypeScript)              │
│  ├── リポジトリ/ファイルブラウザ              │
│  ├── ファイル履歴ビュー                      │
│  └── Diffビューア                            │
│       ├── 2-up（サイドバイサイド）           │
│       ├── Swipe（スライダー境界）            │
│       └── Onion skin（オーバーレイ）          │
│       └── Pixel diff ヒートマップ            │
├─────────────────────────────────────────────┤
│ Backend: Next.js API Routes (Node.js)       │
│  ├── Lore Adapter（CLI spawn を隔離）        │
│  ├── Image Decode Layer（sharp）             │
│  ├── Diff Engine（pixelmatch）               │
│  └── Diff Cache（hashA:hashB キー）          │
├─────────────────────────────────────────────┤
│ Lore                                        │
│  └── bare クローン（実体なし）                │
│      └── file write でオンデマンド抽出        │
└─────────────────────────────────────────────┘
```

### データフロー（diff表示）
1. UI: ファイル選択 → `file history` で履歴一覧取得
2. UI: リビジョンA/Bを選択
3. API: `file info --revision` で両リビジョンのコンテンツハッシュ取得
4. API: キャッシュに `hashA:hashB` があれば即返却（**Loreのcontent-addressed設計との相性ポイント**）
5. なければ `file write` で両バイナリを一時領域へ抽出
6. sharpでデコード＆正規化（RGBA raw化、必要なら縮小）
7. pixelmatchでdiff画像生成 → キャッシュ保存 → 返却

---

## 4. 技術スタックと方針

| レイヤー | 選定 | 理由・方針 |
|---|---|---|
| フロント | TypeScript + Next.js | 手が最も動くスタック |
| Lore連携 | まずCLI spawn → 安定後JS bindingへ | pre-1.0リスクを見てから深入り |
| 画像デコード | sharp | PNG以外（JPEG/WebP等）の raw RGBA 化 |
| pixel diff | pixelmatch | 実績・軽量 |
| キャッシュ | ファイルシステム（`hashA_hashB.png`） | MVPでは十分。後でRedis等に差し替え可 |

### Lore Adapter層の設計原則
- **Lore CLIの呼び出し・出力パースはこの1モジュールに完全に閉じ込める**（pre-1.0で出力形式・インターフェースが変わる前提）
- Lore CLIのバージョンをピン留めし、READMEに検証済みバージョンを明記
- `child_process.execFile` を使用し引数は配列渡し。**シェル経由禁止**（パス・リビジョンIDへのインジェクション対策）
- パスは正規化してリポジトリルート外への脱出を拒否（パストラバーサル対策）

---

## 5. 画像Diffの仕様

### 対応フォーマット（MVP）
- PNG / JPEG のみ。sharpでraw RGBAにデコードして比較
- WebP / AVIF / TGA / PSD 等は将来拡張（デコーダ差し替えで対応可能な構造にする）

### 寸法が異なる場合の仕様（要決定事項 → 決定済み）
- pixelmatchは同一寸法前提のため、**寸法が異なる場合はpixel diffを無効化し、2-up / Swipe / Onion skinのみ提供**
- 寸法差はUI上にバッジ表示（例: `1200×630 → 1280×720`）
- パディング比較は誤解を生むためやらない

### 大容量画像の扱い
- 閾値（例: 長辺4096px または 20MB）超過時はサーバー側で縮小版を生成してdiff
- 「縮小版で比較しています」の注記をUIに表示
- 原寸pixel diff（タイル分割処理）は将来課題

### Diff表示モード（GitHubの画像diffを参考）
1. **2-up**: 左右並列＋メタデータ（サイズ・寸法・コミット情報）
2. **Swipe**: スライダーで境界を動かして比較
3. **Onion skin**: 透明度スライダーで重ね合わせ
4. **Pixel diff**: pixelmatch出力のヒートマップ（変化箇所を強調色で）

---

## 6. MVPスコープ

**やる**
- ローカルのLoreサーバー（demoモード）1台・1リポジトリへの接続
- ファイルブラウザ＋画像ファイルの履歴一覧
- 2リビジョン選択 → 4モードのdiff表示
- ハッシュベースのdiffキャッシュ

**やらない（明示的に外す）**
- 認証・マルチユーザー（個人ツール前提）
- 書き込み系操作（commit/push/branch）— **完全読み取り専用**
- 画像以外のバイナリ（3Dモデル・音声）
- 社内展開・マルチテナント

読み取り専用に絞ることで、Loreのロック機構・競合解決・認可まわりを一切考えなくてよくなる。

## 7. マイルストーン

1. **Spike**: demoモードでLoreを起動し、§2の残確認項目を潰す（出力パース形式の確定）
2. **Adapter**: Lore Adapter層＋ユニットテスト（CLI出力のfixtureベース）
3. **Diff Engine**: file write → sharp → pixelmatch のパイプライン＋キャッシュ
4. **UI**: 履歴リスト → 2-up → Swipe/Onion skin → ヒートマップの順で実装
5. **仕上げ**: README・スクリーンショット・Zenn記事（ポートフォリオ価値の回収）

## 8. リスクと対応

| リスク | 対応 |
|---|---|
| pre-1.0でCLI出力・API破壊的変更 | Adapter層に隔離＋バージョンピン留め |
| CLI出力に構造化形式がない | fixtureベースのパーサーテストで変更検知 |
| Epic純正の「OSS Web client」がロードマップに存在 | 競合したら「先に作って学んだ」がポートフォリオ価値。むしろコントリビュートの入口になりうる |
| 巨大画像でのメモリ枯渇 | 縮小版diffで割り切り（§5） |

## 9. 参考リンク

- [Lore GitHub](https://github.com/EpicGames/lore)
- [Lore CLI command reference](https://epicgames.github.io/lore/reference/lore-cli-commands/)
- [Lore System Design](https://epicgames.github.io/lore/explanation/system-design/)
- [Lore Quickstart](https://epicgames.github.io/lore/tutorials/quickstart/)
- [pixelmatch](https://github.com/mapbox/pixelmatch)
- [sharp](https://sharp.pixelplumbing.com/)
