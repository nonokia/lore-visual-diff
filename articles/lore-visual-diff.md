---
title: "Epic製VCS「Lore」に無いビジュアルDiffをWebでラップして作った話"
emoji: "🖼️"
type: "tech"
topics: ["nextjs", "typescript", "sharp", "pixelmatch", "個人開発"]
published: false
---

## きっかけ

Epic GamesがOSSとして公開したVCS [Lore](https://github.com/EpicGames/lore) は、バイナリファイルをfirst-classで扱う設計が特徴です。content-addressed storage（BLAKE3ハッシュ＋Merkleツリー）でバイナリをchunk単位で差分管理・重複排除する、というゲーム開発向けVCSらしい割り切りをしています。

ただしCLIリファレンスを読むと `lore diff` / `lore file diff` はunified diff、つまりテキスト前提です。バイナリをfirst-classで扱う設計思想の一方で、**ビジュアルなdiff機能は意図的にスコープ外**になっている。ここに空白があったので、それを埋めるWeb UIを個人開発として作ってみました。

> 「lore」という名前の別のVCS（lorevcs.com、intent管理CLI）が存在し検索が汚染されているので、リポジトリ名は `lore-visual-diff` としてEpic側のLoreを対象と分かるようにしています。

## 設計判断で書いておきたいポイント

### 1. Lore Adapter層に「CLI呼び出しの全て」を閉じ込める

Loreはpre-1.0（v0.8.x）で、CLIの出力形式が今後変わりうる前提です。しかも `--json` 相当の構造化出力オプションが見当たらず、テキストパース前提になります。

そこで「`lore` CLIの呼び出し・出力パースは1モジュールに完全に閉じ込める」というルールを最初に決めました（`src/lib/lore/adapter.ts`）。上位のAPI層・UI層はこのAdapterが返す型だけを見ていて、CLIの出力形式が変わってもAdapter内部の修正で吸収できる構造にしています。

```ts
// src/lib/lore/adapter.ts (抜粋)
async fileHistory(path: string, length?: number): Promise<LoreRevisionSummary[]> {
  const safePath = assertSafeRepoRelativePath(path);
  const args = ["file", "history", safePath];
  if (length !== undefined) args.push(String(length));
  args.push("--oneline");

  const stdout = await this.run(args);
  return parseFileHistoryOneline(stdout);
}
```

`child_process.execFile` を配列引数で呼び、シェルを経由しません。パス・リビジョンは正規表現とパストラバーサル対策のバリデーションを通してから渡しています（フラグインジェクション対策として `-`始まりの値も拒否）。

### 2. 出力フォーマットが未検証でも壊れないパーサー設計

正直に書くと、この開発環境には実機の `lore` バイナリが無く、公式CLIリファレンスのページにもネットワーク制約でアクセスできませんでした。つまり `file history --oneline` や `file info` の実際の出力フォーマットは**検証できていません**。

これをごまかさずに設計へ反映するため、パーサーは以下の方針にしました。

- ドキュメントに書かれた検証済みプリミティブから**最も妥当な推測グラマー**を立てる（`--oneline` は `git log --oneline` 的な `<revision> <message>`、`file info` は `key: value` 形式、など）
- 想定と違う出力が来たら黙って間違ったデータを返すのではなく、生の `stdout` を保持した `LoreParseError` を投げて**大声で落ちる**
- fixtureファイル（`src/lib/lore/__fixtures__/*.txt`）を用意し、パーサーのユニットテストをfixtureベースで書く

```ts
export class LoreParseError extends Error {
  constructor(message: string, public readonly rawOutput: string) {
    super(message);
  }
}
```

実機で確認できた時点で、fixtureとパーサーの正規表現を実際の出力に合わせて更新すればいい。README に「Spike TODO」チェックリストとして残しています。「未検証です」で終わらせず、検証が来た時に一箇所を直せば済む形にしておく、というのがこの手のpre-1.0外部CLIに依存する設計のコツだと思います。

### 3. 寸法が異なる画像はpixel diffを諦める

GitHubの画像diffのような2-up/Swipe/Onion skinに加えて、pixelmatchによるpixel diffヒートマップも実装しました。ただし [pixelmatch](https://github.com/mapbox/pixelmatch) は同一寸法の画像しか比較できません。

寸法が異なる場合にパディングして無理やり比較すると誤解を生むだけなので、**寸法が異なる場合はpixel diffモードを無効化し、2-up/Swipe/Onion skinだけ提供する**という割り切りにしました。UIには寸法差をバッジ表示します（`1200×630 → 1280×720` のように）。

```ts
const dimensionsMatch =
  dimensionsA.width === dimensionsB.width && dimensionsA.height === dimensionsB.height;

if (!dimensionsMatch) {
  return { dimensionsMatch, dimensionsA, dimensionsB, downscaled: false };
}
```

### 4. content-addressedとの相性を活かしたDiffキャッシュ

Loreはcontent-addressed storageなので、同じ内容のファイルは同じハッシュを持ちます。この特性を活かして、Diffキャッシュのキーを `hashA:hashB`（の組み合わせ）にしています。異なるリビジョン間の比較でも、中身が同じなら過去に計算したpixel diffをそのまま使い回せます。

```ts
if (a.hash === b.hash) {
  // 中身が同一ならpixelmatchすら不要
  return { summary: { ...base, dimensionsMatch: true, pixelDiff: { diffPixelCount: 0, ... } }, diffPng: null };
}
```

## 技術スタック

| レイヤー | 選定 |
|---|---|
| フロント/バック | Next.js (App Router) + TypeScript |
| Lore連携 | CLI spawn（`execFile`、シェル非経由） |
| 画像デコード | [sharp](https://sharp.pixelplumbing.com/) |
| pixel diff | [pixelmatch](https://github.com/mapbox/pixelmatch) |
| キャッシュ | ファイルシステム（`hashA:hashB`キー） |
| テスト | Vitest（fixtureベースのCLIパーサーテスト含め41テスト） |

読み取り専用ツールとして割り切っている（commit/push/branchなど書き込み系操作は一切やらない）ので、Loreのロック機構・競合解決・認可まわりを考えなくてよくなり、スコープをかなり小さく保てました。

## 今後

- 実機の `lore` バイナリでdemoモードを起動し、パーサーの推測グラマーを実出力に合わせて検証・修正する（本命のSpike）
- リポジトリ全体のファイル一覧を取得するLore CLIコマンドの有無を確認し、現状の「設定ファイルで監視対象パスを列挙する」方式から動的なファイルブラウザに置き換える
- 巨大画像でのタイル分割pixel diff

ソースは [nonokia/lore-visual-diff](https://github.com/nonokia/lore-visual-diff) にあります。設計ドキュメント (`lore-visual-diff-design.md`) にもう少し詳しい検討過程を書いているので、興味があれば覗いてみてください。
