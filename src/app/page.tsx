import Link from "next/link";

import { getWatchedPaths } from "@/config/app";

export default function Home() {
  const paths = getWatchedPaths();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Lore Visual Diff</h1>
      <p style={{ color: "#666" }}>
        Loreリポジトリ内の画像ファイルを2リビジョン間でビジュアル比較します。
      </p>

      {paths.length === 0 ? (
        <p>
          監視対象ファイルが設定されていません。<code>LORE_WATCHED_PATHS</code>{" "}
          環境変数にカンマ区切りでリポジトリ相対パスを設定してください（README参照）。
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {paths.map((path) => (
            <li key={path} style={{ marginBottom: "0.5rem" }}>
              <Link href={`/diff?path=${encodeURIComponent(path)}`}>{path}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
