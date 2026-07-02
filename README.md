# lore-visual-diff

Epic GamesのOSS版管理システム [Lore](https://github.com/EpicGames/lore) をラップした、Webベースの画像ビジュアルDiffツール。設計の背景・方針は [`lore-visual-diff-design.md`](./lore-visual-diff-design.md) を参照。

> 「lore」という同名の別VCS（lorevcs.com）が存在するため検索が汚染されがちです。本リポジトリはEpic Games製Loreを対象とします。

## 現在の状態

設計ドキュメントのマイルストーン2〜4（Adapter層／Diff Engine／UI）を実装済みのMVPです。**マイルストーン1「Spike」（実機のLore CLIでの出力形式検証）は未実施** — この開発環境には`lore`バイナリが存在せず、公式CLIリファレンスサイトへのアクセスもできなかったため、CLI出力パーサーは公式ドキュメントに書かれた検証済みプリミティブ（下記表）からの**推測グラマー**で実装しています。詳細は「既知の制約・要検証事項」を参照してください。

### 実装済み

- **Lore Adapter層**（`src/lib/lore/`）: `execFile`ベースのCLI spawn、パス/リビジョンのバリデーション（パストラバーサル・フラグインジェクション対策）、fixtureベースのパーサーテスト
- **Diff Engine**（`src/lib/diff/engine.ts`）: sharpでのRGBAデコード、pixelmatchによるヒートマップ生成、寸法不一致時のpixel diff無効化、大容量画像の自動縮小
- **キャッシュ**（`src/lib/diff/cache.ts`）: `hashA:hashB`キーのファイルシステムキャッシュ
- **API Routes**（`src/app/api/`）: `/api/history`, `/api/file`, `/api/diff`, `/api/diff/image`, `/api/watched-paths`
- **UI**（`src/app/diff`, `src/components/`）: 履歴選択 → 2-up / Swipe / Onion skin / Pixel diffの4モードDiffビューア

実装後、fakeなLore CLIスクリプトを用意してAPI・UI（4モード全て）をブラウザ実機で動作確認済みです。

## セットアップ

```bash
npm install
cp .env.example .env.local   # 値を編集
npm run dev
```

必須環境変数（`.env.example`参照）:

| 変数 | 説明 |
|---|---|
| `LORE_REPO_PATH` | `lore clone --bare` で作成したベアクローンの絶対パス（必須） |
| `LORE_BIN_PATH` | `lore` 実行ファイルのパス（省略時は `PATH` 上の `lore`） |
| `LORE_WATCHED_PATHS` | ブラウズ・Diff対象とする画像ファイルのリポジトリ相対パス（カンマ区切り） |
| `LORE_EXTRACT_DIR` / `LORE_DIFF_CACHE_DIR` | 抽出キャッシュ・Diffキャッシュの保存先（省略可） |

### なぜ`LORE_WATCHED_PATHS`という設定式のファイルブラウザなのか

設計ドキュメント§2で検証済みのLore CLIプリミティブは「特定パス＋リビジョンのファイル取得」「ファイル単位の履歴」「ファイル情報取得」のみで、**リポジトリ全体のファイル一覧を取得するコマンドは未確認**です。実機検証（下記チェックリスト）でリスティング用コマンドを確認でき次第、動的なファイルブラウザに置き換え可能な構造にしてあります（`src/config/app.ts` の `getWatchedPaths` を差し替えるだけで済むようAPI/UI側は抽象化済み）。

## テスト

```bash
npm test        # vitest（Adapter/Diff Engine/Cache/Serviceのユニットテスト、41 tests）
npm run lint
npm run build
```

Lore CLIの呼び出し自体はfixtureベース（`src/lib/lore/__fixtures__/`）でテストしており、実バイナリは不要です。

## 既知の制約・要検証事項（Spike TODO）

設計ドキュメント§2「実機で確認すべき残項目」に対応。実際の`lore`バイナリでdemoモードを起動し、以下を確認・反映してください:

- [ ] `lore file history --oneline` の実出力フォーマット（現在の実装は `git log --oneline` 的な `<revision> <message>` を仮定 — `src/lib/lore/parsers.ts` の `parseFileHistoryOneline` とコメント参照）
- [ ] `lore file info` の実出力フォーマット（現在は `key: value` 形式を仮定 — `parseFileInfo` 参照）
- [ ] `--revision` の指定形式（フルハッシュ／短縮形／相対指定）。`src/lib/lore/safety.ts` の `assertSafeRevision` の許容文字集合が厳しすぎる/緩すぎる可能性あり
- [ ] `file write` の大容量ファイルでの挙動・速度
- [ ] `file history` がリネーム（`stage move`）をどう追跡するか
- [ ] リポジトリ全体のファイル一覧を取得する手段の有無（上記「ファイルブラウザ」参照）

パーサーが実際の出力形式と一致しない場合、`LoreParseError`（生の`stdout`を保持）が投げられ、API側は`502`として返します。エラーメッセージと生出力を見ながら `src/lib/lore/__fixtures__/*.txt` とパーサーを実出力に合わせて更新し、対応するテスト（`parsers.test.ts`）を通してください。

## アーキテクチャ

設計ドキュメント§3のレイヤー構成に対応:

```
src/
├── app/
│   ├── page.tsx              # ファイルブラウザ（監視対象一覧）
│   ├── diff/page.tsx          # 履歴選択 + Diffビューア
│   └── api/
│       ├── history/route.ts
│       ├── file/route.ts      # 指定リビジョンの画像を返す
│       ├── diff/route.ts      # Diffサマリ（JSON）
│       ├── diff/image/route.ts # Pixel diffヒートマップ画像
│       └── watched-paths/route.ts
├── components/
│   ├── HistoryPicker.tsx
│   └── DiffViewer.tsx         # 2-up / Swipe / Onion skin / Pixel diff
├── lib/
│   ├── lore/                  # Lore Adapter層（CLI spawn + パーサー + バリデーション）
│   └── diff/                  # Diff Engine + キャッシュ + Service層
└── config/                    # 環境変数の読み出し
```

## 参考リンク

- [Lore GitHub](https://github.com/EpicGames/lore)
- [Lore CLI command reference](https://epicgames.github.io/lore/reference/lore-cli-commands/)
- [pixelmatch](https://github.com/mapbox/pixelmatch)
- [sharp](https://sharp.pixelplumbing.com/)
