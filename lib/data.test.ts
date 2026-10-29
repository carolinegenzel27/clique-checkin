import { describe, expect, it } from "vitest";
import { loadData, parseLastContacts, parseMembers } from "./data";

describe("data loading", () => {
  it("parses risk flags, including an empty value and Windows line endings", () => {
    const csv =
      "member_id,full_name,age,preferred_channel,risk_flags\r\n" +
      "1,Ruth Cohen,82,call,lives_alone;recent_discharge\r\n" +
      "2,Joseph Levi,76,sms,\r\n";
    expect(parseMembers(csv)).toEqual([
      {
        memberId: 1,
        fullName: "Ruth Cohen",
        age: 82,
        preferredChannel: "call",
        riskFlags: ["lives_alone", "recent_discharge"],
      },
      { memberId: 2, fullName: "Joseph Levi", age: 76, preferredChannel: "sms", riskFlags: [] },
    ]);
  });

  it("skips a contact row with an unreadable date instead of crashing", () => {
    const csv =
      "member_id,last_contact_utc,outcome\n" +
      "1,2025-10-30T08:00:00Z,ok\n" +
      "2,oops,no_answer\n";
    expect(parseLastContacts(csv).map((c) => c.memberId)).toEqual([1]);
  });

  it("loads the real assignment files", () => {
    const { members, lastContacts, holidays } = loadData();
    expect(members).toHaveLength(50);
    expect(lastContacts).toHaveLength(50);
    expect(holidays).toContain("2025-11-07");
    expect(lastContacts.every((c) => !Number.isNaN(c.lastContactUtc.getTime()))).toBe(true);
  });
});
