"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { DiffViewer, type DiffApiResponse } from "@/components/DiffViewer";
import { HistoryPicker } from "@/components/HistoryPicker";
import type { LoreRevisionSummary } from "@/lib/lore/types";

export default function DiffPage() {
  return (
    <Suspense fallback={null}>
      <DiffPageRouter />
    </Suspense>
  );
}

/** Reads the ?path= query param and remounts DiffPageContent (fresh state) whenever it changes. */
function DiffPageRouter() {
  const params = useSearchParams();
  const path = params.get("path");
  return <DiffPageContent key={path ?? "__none__"} path={path} />;
}

function DiffPageContent({ path }: { path: string | null }) {
  const [history, setHistory] = useState<LoreRevisionSummary[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [revisionA, setRevisionA] = useState<string | null>(null);
  const [revisionB, setRevisionB] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let ignore = false;

    fetch(`/api/history?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body.history as LoreRevisionSummary[];
      })
      .then((h) => {
        if (ignore) return;
        setHistory(h);
        if (h.length >= 2) {
          setRevisionB(h[0].revision);
          setRevisionA(h[1].revision);
        } else if (h.length === 1) {
          setRevisionA(h[0].revision);
          setRevisionB(h[0].revision);
        }
      })
      .catch((err) => {
        if (!ignore) setHistoryError(String(err.message ?? err));
      });

    return () => {
      ignore = true;
    };
  }, [path]);

  const requestKey = path && revisionA && revisionB ? `${path}::${revisionA}::${revisionB}` : null;
  const [diff, setDiff] = useState<DiffApiResponse | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!requestKey || !path || !revisionA || !revisionB) return;
    let ignore = false;

    fetch(
      `/api/diff?path=${encodeURIComponent(path)}&revisionA=${encodeURIComponent(revisionA)}&revisionB=${encodeURIComponent(revisionB)}`,
    )
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as DiffApiResponse;
      })
      .then((body) => {
        if (ignore) return;
        setDiff(body);
        setDiffError(null);
        setResolvedKey(requestKey);
      })
      .catch((err) => {
        if (ignore) return;
        setDiffError(String(err.message ?? err));
        setResolvedKey(requestKey);
      });

    return () => {
      ignore = true;
    };
  }, [requestKey, path, revisionA, revisionB]);

  const loadingDiff = requestKey !== null && requestKey !== resolvedKey;

  if (!path) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>クエリパラメータ path が必要です。</p>
        <Link href="/">← 一覧に戻る</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <p>
        <Link href="/">← 一覧に戻る</Link>
      </p>
      <h1 style={{ fontFamily: "monospace", fontSize: "1.2rem" }}>{path}</h1>

      {historyError && <p style={{ color: "crimson" }}>履歴の取得に失敗しました: {historyError}</p>}
      {!historyError && !history && <p>履歴を読み込み中...</p>}
      {history && history.length === 0 && <p>このファイルには履歴がありません。</p>}

      {history && history.length > 0 && (
        <>
          <HistoryPicker
            history={history}
            revisionA={revisionA}
            revisionB={revisionB}
            onSelectA={setRevisionA}
            onSelectB={setRevisionB}
          />

          <div style={{ marginTop: "1.5rem" }}>
            {diffError && <p style={{ color: "crimson" }}>Diffの取得に失敗しました: {diffError}</p>}
            {loadingDiff && <p>Diffを計算中...</p>}
            {!loadingDiff && diff && <DiffViewer diff={diff} />}
          </div>
        </>
      )}
    </main>
  );
}
