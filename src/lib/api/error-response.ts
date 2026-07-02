import { NextResponse } from "next/server";

import { LoreCliError } from "@/lib/lore/adapter";
import { LoreParseError } from "@/lib/lore/parsers";
import { UnsafeInputError } from "@/lib/lore/safety";

/** Maps adapter/parser/validation errors to an appropriate HTTP status + JSON body. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UnsafeInputError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof LoreParseError) {
    return NextResponse.json(
      { error: `Failed to parse Lore CLI output: ${err.message}` },
      { status: 502 },
    );
  }
  if (err instanceof LoreCliError) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Unknown error" },
    { status: 500 },
  );
}
