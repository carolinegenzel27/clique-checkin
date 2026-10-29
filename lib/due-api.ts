import {
  getDueMembers,
  getFollowUps,
  isHoliday,
  TIME_ZONE,
  toDateKey,
  type DueMember,
  type FollowUpMember,
} from "./checkin";
import type { CheckinData } from "./data";

// Everything GET /due needs, kept apart from the Next.js route so it can be
// tested without a server: reading the query string and shaping the JSON.

export type DueQuery = { today: Date; top?: number };
export type ParseResult = { ok: true; query: DueQuery } | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ?date=YYYY-MM-DD (optional, defaults to `now`) and ?top=N (optional, positive integer).
// A date becomes midnight UTC, which is 02:00-03:00 in Israel: still the same calendar day.
export function parseDueQuery(params: URLSearchParams, now: Date): ParseResult {
  let today = now;
  const dateParam = params.get("date");
  if (dateParam !== null) {
    const parsed = new Date(dateParam);
    // The round-trip check rejects impossible dates like 2025-02-30.
    if (!DATE_PATTERN.test(dateParam) || Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== dateParam) {
      return { ok: false, error: "date must be a real date in YYYY-MM-DD format" };
    }
    today = parsed;
  }

  let top: number | undefined;
  const topParam = params.get("top");
  if (topParam !== null) {
    top = Number(topParam);
    if (!/^\d+$/.test(topParam) || top < 1) {
      return { ok: false, error: "top must be a positive whole number" };
    }
  }

  return { ok: true, query: { today, top } };
}

// The API uses the spec's snake_case field names (member_id, priority_score, ...).
function toDueJson(m: DueMember) {
  return {
    member_id: m.memberId,
    full_name: m.fullName,
    priority_score: m.priorityScore,
    recommended_window: m.recommendedWindow,
    preferred_channel: m.preferredChannel,
    days_since_last_contact: m.daysSinceLastContact,
    last_outcome: m.lastOutcome,
    reasons: m.reasons,
  };
}

function toFollowUpJson(m: FollowUpMember) {
  return {
    member_id: m.memberId,
    full_name: m.fullName,
    recommended_window: m.recommendedWindow,
    preferred_channel: m.preferredChannel,
    days_since_last_contact: m.daysSinceLastContact,
    last_contact_date: m.lastContactDate,
    last_outcome: m.lastOutcome,
    reasons: m.reasons,
  };
}

export function buildDueResponse(data: CheckinData, { today, top }: DueQuery) {
  const allDue = getDueMembers(data, today);
  return {
    date: toDateKey(today),
    time_zone: TIME_ZONE,
    is_holiday: isHoliday(today, data.holidays),
    total_due: allDue.length, // before applying top
    due: (top === undefined ? allDue : allDue.slice(0, top)).map(toDueJson),
    // Extra, not in the spec: recent escalations / no answers (see getFollowUps).
    follow_up: getFollowUps(data, today).map(toFollowUpJson),
  };
}

export type DueResponse = ReturnType<typeof buildDueResponse>;
