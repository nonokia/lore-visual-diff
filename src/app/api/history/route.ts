import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api/error-response";
import { getWatchedPaths } from "@/config/app";
import { getHistory } from "@/lib/diff/service";

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  const lengthParam = request.nextUrl.searchParams.get("length");

  if (!path) {
    return NextResponse.json({ error: "Missing required query param: path" }, { status: 400 });
  }
  if (!getWatchedPaths().includes(path)) {
    return NextResponse.json({ error: `Path is not in the watched list: ${path}` }, { status: 404 });
  }

  let length: number | undefined;
  if (lengthParam !== null) {
    length = Number(lengthParam);
    if (!Number.isInteger(length) || length <= 0) {
      return NextResponse.json({ error: "length must be a positive integer" }, { status: 400 });
    }
  }

  try {
    const history = await getHistory(path, length);
    return NextResponse.json({ path, history });
  } catch (err) {
    return errorResponse(err);
  }
}
