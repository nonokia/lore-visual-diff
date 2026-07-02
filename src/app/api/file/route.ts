import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/error-response";
import { getWatchedPaths } from "@/config/app";
import { getFileAt } from "@/lib/diff/service";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const revision = request.nextUrl.searchParams.get("revision");

  if (!path || !revision) {
    return NextResponse.json(
      { error: "Missing required query params: path, revision" },
      { status: 400 },
    );
  }
  if (!getWatchedPaths().includes(path)) {
    return NextResponse.json({ error: `Path is not in the watched list: ${path}` }, { status: 404 });
  }

  try {
    const file = await getFileAt(path, revision);
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Lore-Content-Hash": file.hash,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
