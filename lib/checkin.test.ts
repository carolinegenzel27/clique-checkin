import { describe, expect, it } from "vitest";
import { getDueMembers, getFollowUps, isHoliday, recommendedWindow } from "./checkin";
import { loadData, type CheckinData, type LastContact, type Member } from "./data";

// Small hand-made fixtures, so each test shows exactly the case it checks.

function member(overrides: Partial<Member> & { memberId: number }): Member {
  return {
    fullName: `Member ${overrides.memberId}`,
    age: 70,
    preferredChannel: "call",
    riskFlags: [],
    ...overrides,
  };
}

function contact(memberId: number, isoUtc: string, outcome = "ok"): LastContact {
  return { memberId, lastContactUtc: new Date(isoUtc), outcome };
}

function data(members: Member[], lastContacts: LastContact[], holidays: string[] = []): CheckinData {
  return { members, lastContacts, holidays };
}

const TODAY = new Date("2025-11-06T10:00:00Z"); // 12:00 in Israel, not a holiday
const ids = (list: { memberId: number }[]) => list.map((m) => m.memberId);

describe("who is due", () => {
  it("returns nobody on a holiday", () => {
    const d = data([member({ memberId: 1 })], [], ["2025-11-06"]);
    expect(getDueMembers(d, TODAY)).toEqual([]);
    expect(getFollowUps(d, TODAY)).toEqual([]);
  });

  it("uses the Israel date for holidays (23:30 UTC on 6 Nov is already 7 Nov)", () => {
    expect(isHoliday(new Date("2025-11-06T23:30:00Z"), ["2025-11-07"])).toBe(true);
  });

  it("includes a member with no contact record, scored as 28 days", () => {
    const d = data([member({ memberId: 1 })], []);
    const [result] = getDueMembers(d, TODAY);
    expect(result.memberId).toBe(1);
    expect(result.priorityScore).toBe(4); // 28 / 7, no other points
    expect(result.daysSinceLastContact).toBeNull();
    expect(result.reasons).toContain("No contact yet");
  });

  it("counts 7 days by calendar date, not by hours", () => {
    const d = data(
      [member({ memberId: 1 }), member({ memberId: 2 })],
      [
        contact(1, "2025-10-30T20:00:00Z"), // 30 Oct late evening -> 7 calendar days
        contact(2, "2025-10-31T06:00:00Z"), // 31 Oct -> only 6 days
      ],
    );
    expect(ids(getDueMembers(d, new Date("2025-11-06T00:00:00Z")))).toEqual([1]);
  });

  it("counts calendar days in Israel time, not UTC", () => {
    const d = data(
      [member({ memberId: 1 }), member({ memberId: 2 })],
      [
        contact(1, "2025-10-30T21:30:00Z"), // 23:30 on 30 Oct in Israel -> 7 days
        contact(2, "2025-10-30T22:30:00Z"), // 00:30 on 31 Oct in Israel -> 6 days
      ],
    );
    expect(ids(getDueMembers(d, TODAY))).toEqual([1]);
  });

  it("skips members without a valid preferred channel", () => {
    const d = data(
      [
        member({ memberId: 1, preferredChannel: "" }),
        member({ memberId: 2, preferredChannel: "fax" }),
        member({ memberId: 3, preferredChannel: "whatsapp" }),
      ],
      [],
    );
    expect(ids(getDueMembers(d, TODAY))).toEqual([3]);
  });

  it("skips a contact dated after today", () => {
    const d = data([member({ memberId: 1 })], [contact(1, "2025-11-20T10:00:00Z")]);
    expect(getDueMembers(d, TODAY)).toEqual([]);
  });
});

describe("priority score and order", () => {
  it("adds up every rule from the spec", () => {
    const d = data(
      [member({ memberId: 1, age: 85, riskFlags: ["recent_discharge", "lives_alone"] })],
      [contact(1, "2025-10-23T10:00:00Z", "no_answer")], // exactly 14 days -> +2
    );
    const [result] = getDueMembers(d, TODAY);
    // 3 discharge + 2 alone + 1 age 80+ + 1 no_answer + 14/7
    expect(result.priorityScore).toBe(9);
    expect(result.recommendedWindow).toBe("morning");
  });

  it("sorts by score (highest first) and respects top", () => {
    const d = data(
      [
        member({ memberId: 1 }),
        member({ memberId: 2, riskFlags: ["recent_discharge"] }),
        member({ memberId: 3, riskFlags: ["lives_alone"] }),
      ],
      [
        contact(1, "2025-10-23T10:00:00Z"),
        contact(2, "2025-10-23T10:00:00Z"),
        contact(3, "2025-10-23T10:00:00Z"),
      ],
    );
    expect(ids(getDueMembers(d, TODAY))).toEqual([2, 3, 1]);
    expect(ids(getDueMembers(d, TODAY, 2))).toEqual([2, 3]);
  });

  it("rounds the score to 1 decimal", () => {
    const d = data([member({ memberId: 1 })], [contact(1, "2025-10-27T10:00:00Z")]);
    // 10 days / 7 = 1.428... -> 1.4
    expect(getDueMembers(d, TODAY)[0].priorityScore).toBe(1.4);
  });

  it("breaks score ties by member_id", () => {
    const d = data(
      [member({ memberId: 5 }), member({ memberId: 3 })],
      [contact(5, "2025-10-23T10:00:00Z"), contact(3, "2025-10-23T10:00:00Z")],
    );
    expect(ids(getDueMembers(d, TODAY))).toEqual([3, 5]);
  });

  it("gives the expected top 5 for the real data on 6 Nov 2025", () => {
    const top5 = getDueMembers(loadData(), new Date("2025-11-06"), 5);
    expect(top5.map((m) => [m.memberId, m.priorityScore])).toEqual([
      [2, 8.6], // Isaac Regev
      [6, 7.9], // Sarah Israel
      [28, 7.8], // Ruth Levi
      [23, 7.7], // Daniel Adler
      [8, 7.4], // Rachel Baruch
    ]);
  });

  it("recommends morning from age 80", () => {
    expect(recommendedWindow(80)).toBe("morning");
    expect(recommendedWindow(79)).toBe("afternoon");
  });
});

describe("follow-ups (escalated or no answer in the last 7 days)", () => {
  it("lists recent bad outcomes, escalations first, and ignores ok", () => {
    const d = data(
      [member({ memberId: 1 }), member({ memberId: 2 }), member({ memberId: 3 })],
      [
        contact(1, "2025-11-04T10:00:00Z", "no_answer"),
        contact(2, "2025-11-05T10:00:00Z", "escalate"),
        contact(3, "2025-11-04T10:00:00Z", "ok"),
      ],
    );
    expect(ids(getFollowUps(d, TODAY))).toEqual([2, 1]);
    // They are not on the spec list yet (contacted less than 7 days ago).
    expect(getDueMembers(d, TODAY)).toEqual([]);
  });

  it("scores follow-ups with the spec formula and sorts by score within each outcome", () => {
    const d = data(
      [
        member({ memberId: 1 }),
        member({ memberId: 2, age: 85, riskFlags: ["recent_discharge", "lives_alone"] }),
      ],
      [
        contact(1, "2025-11-04T10:00:00Z", "escalate"), // 2 days -> 2/7
        contact(2, "2025-11-04T10:00:00Z", "escalate"), // 3 + 2 + 1 + 2/7
      ],
    );
    const followUps = getFollowUps(d, TODAY);
    expect(ids(followUps)).toEqual([2, 1]);
    expect(followUps.map((m) => m.priorityScore)).toEqual([6.3, 0.3]);
  });

  it("does not repeat members who are already due", () => {
    const d = data([member({ memberId: 1 })], [contact(1, "2025-10-20T10:00:00Z", "escalate")]);
    expect(getFollowUps(d, TODAY)).toEqual([]);
    expect(ids(getDueMembers(d, TODAY))).toEqual([1]);
  });
});
