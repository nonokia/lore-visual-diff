"use client";

import { useState } from "react";

export interface DiffApiResponse {
  path: string;
  revisionA: string;
  revisionB: string;
  hashA: string;
  hashB: string;
  cacheHit: boolean;
  dimensionsMatch: boolean;
  dimensionsA: { width: number; height: number };
  dimensionsB: { width: number; height: number };
  downscaled: boolean;
  pixelDiff?: { diffPixelCount: number; totalPixels: number; diffRatio: number };
  imageUrlA: string;
  imageUrlB: string;
  diffImageUrl: string | null;
}

type Mode = "2up" | "swipe" | "onion" | "heatmap";

export function DiffViewer({ diff }: { diff: DiffApiResponse }) {
  const [mode, setMode] = useState<Mode>("2up");
  const [swipe, setSwipe] = useState(50);
  const [opacity, setOpacity] = useState(50);

  const modes: { key: Mode; label: string; disabled?: boolean }[] = [
    { key: "2up", label: "2-up" },
    { key: "swipe", label: "Swipe", disabled: !diff.dimensionsMatch },
    { key: "onion", label: "Onion skin", disabled: !diff.dimensionsMatch },
    { key: "heatmap", label: "Pixel diff", disabled: !diff.diffImageUrl },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            disabled={m.disabled}
            style={{ fontWeight: mode === m.key ? "bold" : "normal", opacity: m.disabled ? 0.4 : 1 }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <DimensionBadge diff={diff} />

      <div style={{ marginTop: "1rem" }}>
        {mode === "2up" && <TwoUp diff={diff} />}
        {mode === "swipe" &&
          (diff.dimensionsMatch ? (
            <Swipe diff={diff} value={swipe} onChange={setSwipe} />
          ) : (
            <DimensionMismatchNotice />
          ))}
        {mode === "onion" &&
          (diff.dimensionsMatch ? (
            <Onion diff={diff} value={opacity} onChange={setOpacity} />
          ) : (
            <DimensionMismatchNotice />
          ))}
        {mode === "heatmap" &&
          (diff.diffImageUrl ? <Heatmap diff={diff} /> : <DimensionMismatchNotice />)}
      </div>
    </div>
  );
}

function DimensionBadge({ diff }: { diff: DiffApiResponse }) {
  const { dimensionsA, dimensionsB, dimensionsMatch, downscaled, pixelDiff } = diff;
  const dimsText = dimensionsMatch
    ? `${dimensionsA.width}×${dimensionsA.height}`
    : `${dimensionsA.width}×${dimensionsA.height} → ${dimensionsB.width}×${dimensionsB.height}`;

  return (
    <div style={{ fontSize: "0.9rem", color: "#555", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
      <span>{dimsText}</span>
      {!dimensionsMatch && <span style={badgeStyle}>寸法が異なります</span>}
      {downscaled && <span style={badgeStyle}>縮小版で比較しています</span>}
      {pixelDiff && (
        <span>
          差分ピクセル: {pixelDiff.diffPixelCount.toLocaleString()} /{" "}
          {pixelDiff.totalPixels.toLocaleString()} ({(pixelDiff.diffRatio * 100).toFixed(2)}%)
        </span>
      )}
    </div>
  );
}

const badgeStyle = {
  background: "#fff3cd",
  color: "#664d03",
  padding: "0.1rem 0.5rem",
  borderRadius: "4px",
  fontSize: "0.8rem",
};

function DimensionMismatchNotice() {
  return (
    <p style={{ color: "#664d03" }}>
      寸法が異なるためこのモードは利用できません。2-upで比較してください。
    </p>
  );
}

function TwoUp({ diff }: { diff: DiffApiResponse }) {
  return (
    <div style={{ display: "flex", gap: "1rem" }}>
      <figure style={{ flex: 1, margin: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diff.imageUrlA} alt="Revision A" style={{ maxWidth: "100%" }} />
        <figcaption style={captionStyle}>
          A: {diff.revisionA} ({diff.dimensionsA.width}×{diff.dimensionsA.height})
        </figcaption>
      </figure>
      <figure style={{ flex: 1, margin: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diff.imageUrlB} alt="Revision B" style={{ maxWidth: "100%" }} />
        <figcaption style={captionStyle}>
          B: {diff.revisionB} ({diff.dimensionsB.width}×{diff.dimensionsB.height})
        </figcaption>
      </figure>
    </div>
  );
}

const captionStyle = { fontSize: "0.85rem", color: "#666", marginTop: "0.25rem" };

function Swipe({
  diff,
  value,
  onChange,
}: {
  diff: DiffApiResponse;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div
        style={{
          position: "relative",
          maxWidth: "100%",
          width: diff.dimensionsA.width,
          aspectRatio: `${diff.dimensionsA.width} / ${diff.dimensionsA.height}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={diff.imageUrlB}
          alt="Revision B"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: `inset(0 ${100 - value}% 0 0)`,
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={diff.imageUrlA}
            alt="Revision A"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${value}%`,
            width: "2px",
            background: "#fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", maxWidth: 400, marginTop: "0.75rem" }}
        aria-label="Swipe position"
      />
    </div>
  );
}

function Onion({
  diff,
  value,
  onChange,
}: {
  diff: DiffApiResponse;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div
        style={{
          position: "relative",
          maxWidth: "100%",
          width: diff.dimensionsA.width,
          aspectRatio: `${diff.dimensionsA.width} / ${diff.dimensionsA.height}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={diff.imageUrlA}
          alt="Revision A"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={diff.imageUrlB}
          alt="Revision B"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: value / 100 }}
        />
      </div>
      <label style={{ display: "block", marginTop: "0.75rem", maxWidth: 400 }}>
        A ⟷ B
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label="Onion skin blend"
        />
      </label>
    </div>
  );
}

function Heatmap({ diff }: { diff: DiffApiResponse }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={diff.diffImageUrl!}
      alt="Pixel diff heatmap"
      style={{ maxWidth: "100%", background: "#222" }}
    />
  );
}
