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
    const { summary } = await getDiff(path, revisionA, revisionB);
    const imageUrl = (revision: string) =>
      `/api/file?path=${encodeURIComponent(path)}&revision=${encodeURIComponent(revision)}`;

    return NextResponse.json({
      ...summary,
      imageUrlA: imageUrl(revisionA),
      imageUrlB: imageUrl(revisionB),
      diffImageUrl: summary.pixelDiff
        ? `/api/diff/image?path=${encodeURIComponent(path)}&revisionA=${encodeURIComponent(revisionA)}&revisionB=${encodeURIComponent(revisionB)}`
        : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
