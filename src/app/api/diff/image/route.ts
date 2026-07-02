import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/error-response";
import { getWatchedPaths } from "@/config/app";
import { getDiff } from "@/lib/diff/service";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const revisionA = request.nextUrl.searchParams.get("revisionA");
  const revisionB = request.nextUrl.searchParams.get("revisionB");

  if (!path || !revisionA || !revisionB) {
    return NextResponse.json(
      { error: "Missing required query params: path, revisionA, revisionB" },
      { status: 400 },
    );
  }
  if (!getWatchedPaths().includes(path)) {
    return NextResponse.json({ error: `Path is not in the watched list: ${path}` }, { status: 404 });
  }

  try {
    const { diffPng } = await getDiff(path, revisionA, revisionB);
    if (!diffPng) {
      return NextResponse.json(
        { error: "No pixel diff available for this pair (dimensions differ or content is identical)" },
        { status: 404 },
      );
    }
    return new NextResponse(new Uint8Array(diffPng), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
