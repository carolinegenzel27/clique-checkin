import type { NextRequest } from "next/server";
import { loadData } from "@/lib/data";
import { buildDueResponse, parseDueQuery } from "@/lib/due-api";

// GET /due?top=5&date=2025-11-06
// Both parameters are optional: no date = today (Israel time), no top = everyone due.
export function GET(request: NextRequest) {
  const parsed = parseDueQuery(request.nextUrl.searchParams, new Date());
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  // Files are read on every request; they are tiny, and edits show up without a restart.
  return Response.json(buildDueResponse(loadData(), parsed.query));
}
