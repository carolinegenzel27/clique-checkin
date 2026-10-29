import { describe, expect, it } from "vitest";
import { loadData } from "./data";
import { buildDueResponse, parseDueQuery } from "./due-api";

const NOW = new Date("2025-11-06T10:00:00Z");
const parse = (query: string) => parseDueQuery(new URLSearchParams(query), NOW);

describe("GET /due query parsing", () => {
  it("defaults to now and no top", () => {
    expect(parse("")).toEqual({ ok: true, query: { today: NOW, top: undefined } });
  });

  it("reads date and top", () => {
    expect(parse("date=2025-11-01&top=5")).toEqual({
      ok: true,
      query: { today: new Date("2025-11-01"), top: 5 },
    });
  });

  it.each(["top=0", "top=-1", "top=abc", "top=2.5", "top="])("rejects %s", (query) => {
    expect(parse(query)).toEqual({ ok: false, error: "top must be a positive whole number" });
  });

  it.each(["date=hello", "date=2025-02-30", "date=6/11/2025", "date="])("rejects %s", (query) => {
    expect(parse(query).ok).toBe(false);
  });
});

describe("GET /due response", () => {
  const data = loadData();

  it("uses the spec field names and applies top", () => {
    const response = buildDueResponse(data, { today: new Date("2025-11-06"), top: 2 });
    expect(response.date).toBe("2025-11-06");
    expect(response.total_due).toBe(37);
    expect(response.due).toHaveLength(2);
    expect(response.due[0]).toMatchObject({
      member_id: 2,
      full_name: "Isaac Regev",
      priority_score: 8.6,
      recommended_window: "afternoon",
    });
    expect(response.follow_up).toHaveLength(8);
  });

  it("says when today is a holiday", () => {
    const response = buildDueResponse(data, { today: new Date("2025-11-07") });
    expect(response.is_holiday).toBe(true);
    expect(response.due).toEqual([]);
  });
});
