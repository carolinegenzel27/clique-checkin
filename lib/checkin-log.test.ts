import { describe, expect, it } from "vitest";
import { logOutcome, parseLog, undoOutcome } from "./checkin-log";

const AT = new Date("2025-11-06T09:30:00Z");

describe("check-in log", () => {
  it("logs an outcome and undoes it", () => {
    const log = logOutcome({}, 7, "no_answer", AT);
    expect(log).toEqual({ "7": { outcome: "no_answer", loggedAt: "2025-11-06T09:30:00.000Z" } });
    expect(undoOutcome(log, 7)).toEqual({});
  });

  it("round-trips through storage", () => {
    const log = logOutcome({}, 3, "escalate", AT);
    expect(parseLog(JSON.stringify(log))).toEqual(log);
  });

  it("ignores missing or broken stored data", () => {
    expect(parseLog(null)).toEqual({});
    expect(parseLog("not json")).toEqual({});
    expect(parseLog('{"1":{"outcome":"maybe","loggedAt":"x"},"2":null}')).toEqual({});
  });
});
