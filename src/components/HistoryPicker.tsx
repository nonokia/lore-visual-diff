"use client";

import type { CSSProperties } from "react";

import type { LoreRevisionSummary } from "@/lib/lore/types";

interface HistoryPickerProps {
  history: LoreRevisionSummary[];
  revisionA: string | null;
  revisionB: string | null;
  onSelectA: (revision: string) => void;
  onSelectB: (revision: string) => void;
}

export function HistoryPicker({
  history,
  revisionA,
  revisionB,
  onSelectA,
  onSelectB,
}: HistoryPickerProps) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={cellStyle}>A</th>
          <th style={cellStyle}>B</th>
          <th style={{ ...cellStyle, textAlign: "left" }}>Revision</th>
          <th style={{ ...cellStyle, textAlign: "left" }}>Message</th>
        </tr>
      </thead>
      <tbody>
        {history.map((rev) => (
          <tr key={rev.revision}>
            <td style={cellStyle}>
              <input
                type="radio"
                name="revisionA"
                checked={revisionA === rev.revision}
                onChange={() => onSelectA(rev.revision)}
                aria-label={`Select ${rev.revision} as A`}
              />
            </td>
            <td style={cellStyle}>
              <input
                type="radio"
                name="revisionB"
                checked={revisionB === rev.revision}
                onChange={() => onSelectB(rev.revision)}
                aria-label={`Select ${rev.revision} as B`}
              />
            </td>
            <td style={{ ...cellStyle, fontFamily: "monospace" }}>{rev.revision}</td>
            <td style={cellStyle}>{rev.message}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const cellStyle: CSSProperties = {
  border: "1px solid #ddd",
  padding: "0.4rem 0.6rem",
  textAlign: "center",
};
