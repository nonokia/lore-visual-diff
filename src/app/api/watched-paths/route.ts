import { NextResponse } from "next/server";

import { getWatchedPaths } from "@/config/app";

export async function GET() {
  return NextResponse.json({ paths: getWatchedPaths() });
}
