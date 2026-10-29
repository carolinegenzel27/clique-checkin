import type { CheckinData, LastContact, Member } from "./data";

// All the business rules from the assignment live in this file.
// Pure functions only (no file or network access), so they are easy to test.

export const VALID_CHANNELS = ["call", "sms", "whatsapp"];
export const MIN_DAYS_SINCE_CONTACT = 7;
// Assumption: a member with no contact record is scored as if their last
// contact was 28 days ago (+4.0), so they rank high without beating everyone.
export const NO_CONTACT_ASSUMED_DAYS = 28;
// Assumption: coordinators work in Israel, so "today" and holidays are
// calendar dates in Israel time, not UTC.
export const TIME_ZONE = "Asia/Jerusalem";
// Outcomes that mean the last contact did not go well (see getFollowUps).
const FOLLOW_UP_OUTCOMES = ["escalate", "no_answer"];
const MORNING_MIN_AGE = 80;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type Window = "morning" | "afternoon";

export type DueMember = {
  memberId: number;
  fullName: string;
  priorityScore: number; // rounded to 1 decimal
  recommendedWindow: Window;
  preferredChannel: string;
  daysSinceLastContact: number | null; // calendar days, null = no record
  lastOutcome: string | null;
  reasons: string[]; // short tags for the "Why" column
};

export type FollowUpMember = {
  memberId: number;
  fullName: string;
  recommendedWindow: Window;
  preferredChannel: string;
  daysSinceLastContact: number;
  lastContactDate: string; // "YYYY-MM-DD", Israel time
  lastOutcome: string; // "escalate" | "no_answer"
  reasons: string[];
};

// "YYYY-MM-DD" of a moment as a calendar date in Israel,
// the same format as holidays.json. ("en-CA" formats dates as YYYY-MM-DD.)
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
export function toDateKey(date: Date): string {
  return dateKeyFormatter.format(date);
}

export function isHoliday(today: Date, holidays: string[]): boolean {
  return holidays.includes(toDateKey(today));
}

export function hasValidChannel(member: Member): boolean {
  return VALID_CHANNELS.includes(member.preferredChannel);
}

// Fractional days between two moments. Used for the score's days/7 bonus.
// Negative if the contact is after "today" (possible with a past ?date=).
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

// Whole calendar days between two moments, ignoring the time of day:
// contacted on 30 Oct (any hour) -> 6 Nov is 7 days. Used for "who is due",
// because that is how a coordinator counts "a week ago".
export function calendarDaysBetween(from: Date, to: Date): number {
  const fromDay = Date.parse(toDateKey(from));
  const toDay = Date.parse(toDateKey(to));
  return Math.round((toDay - fromDay) / MS_PER_DAY);
}

export function recommendedWindow(age: number): Window {
  return age >= MORNING_MIN_AGE ? "morning" : "afternoon";
}

// Spec scoring. daysSince is null when there is no contact record.
export function priorityScore(
  member: Member,
  lastContact: LastContact | undefined,
  daysSince: number | null,
): number {
  let score = 0;
  if (member.riskFlags.includes("recent_discharge")) score += 3;
  if (member.riskFlags.includes("lives_alone")) score += 2;
  if (member.age >= 80) score += 1;
  if (lastContact?.outcome === "no_answer") score += 1;
  score += (daysSince ?? NO_CONTACT_ASSUMED_DAYS) / 7;
  return score;
}

// Short, human tags explaining why a member is on a list.
function reasonTags(
  member: Member,
  lastContact: LastContact | undefined,
  calendarDays: number | null,
): string[] {
  const tags: string[] = [];
  if (member.riskFlags.includes("recent_discharge")) tags.push("Discharged");
  if (member.riskFlags.includes("lives_alone")) tags.push("Lives alone");
  if (member.age >= 80) tags.push("80+");
  if (lastContact?.outcome === "no_answer") tags.push("No answer");
  // Not scored by the spec, but a coordinator should see it.
  if (lastContact?.outcome === "escalate") tags.push("Escalated");
  if (calendarDays === null) tags.push("No contact yet");
  else tags.push(calendarDays === 1 ? "1 day" : `${calendarDays} days`);
  return tags;
}

// If a member somehow has several contact rows, keep only the most recent.
function latestContactByMember(contacts: LastContact[]): Map<number, LastContact> {
  const latest = new Map<number, LastContact>();
  for (const contact of contacts) {
    const current = latest.get(contact.memberId);
    if (!current || contact.lastContactUtc > current.lastContactUtc) {
      latest.set(contact.memberId, contact);
    }
  }
  return latest;
}

// Main entry point (the spec list): who needs a check-in on `today`,
// highest priority first.
export function getDueMembers(data: CheckinData, today: Date, top?: number): DueMember[] {
  if (isHoliday(today, data.holidays)) return [];

  const contacts = latestContactByMember(data.lastContacts);
  // Keep the unrounded score next to each member so sorting stays exact.
  const due: { member: DueMember; rawScore: number }[] = [];

  for (const member of data.members) {
    if (!hasValidChannel(member)) continue;

    const lastContact = contacts.get(member.memberId);
    const calendarDays = lastContact
      ? calendarDaysBetween(lastContact.lastContactUtc, today)
      : null;

    // No record -> due. Otherwise due only after 7+ calendar days
    // (this also skips contacts dated after "today").
    if (calendarDays !== null && calendarDays < MIN_DAYS_SINCE_CONTACT) continue;

    const exactDays = lastContact ? daysBetween(lastContact.lastContactUtc, today) : null;
    const rawScore = priorityScore(member, lastContact, exactDays);
    due.push({
      rawScore,
      member: {
        memberId: member.memberId,
        fullName: member.fullName,
        priorityScore: Math.round(rawScore * 10) / 10,
        recommendedWindow: recommendedWindow(member.age),
        preferredChannel: member.preferredChannel,
        daysSinceLastContact: calendarDays,
        lastOutcome: lastContact?.outcome ?? null,
        reasons: reasonTags(member, lastContact, calendarDays),
      },
    });
  }

  // Highest score first; ties broken by member_id so the order is stable.
  due.sort((a, b) => b.rawScore - a.rawScore || a.member.memberId - b.member.memberId);

  const sorted = due.map((entry) => entry.member);
  return top === undefined ? sorted : sorted.slice(0, top);
}

// Extra (not in the spec): members the 7-day rule hides even though their
// last contact went badly (escalated or no answer in the last 7 days).
// Kept separate so the spec list and score stay exactly as defined.
// Order: escalations first, then whoever has waited longest.
export function getFollowUps(data: CheckinData, today: Date): FollowUpMember[] {
  if (isHoliday(today, data.holidays)) return [];

  const contacts = latestContactByMember(data.lastContacts);
  const followUps: FollowUpMember[] = [];

  for (const member of data.members) {
    if (!hasValidChannel(member)) continue;

    const lastContact = contacts.get(member.memberId);
    if (!lastContact || !FOLLOW_UP_OUTCOMES.includes(lastContact.outcome)) continue;

    const calendarDays = calendarDaysBetween(lastContact.lastContactUtc, today);
    // 7+ days -> already on the spec list; negative -> contact is after "today".
    if (calendarDays < 0 || calendarDays >= MIN_DAYS_SINCE_CONTACT) continue;

    followUps.push({
      memberId: member.memberId,
      fullName: member.fullName,
      recommendedWindow: recommendedWindow(member.age),
      preferredChannel: member.preferredChannel,
      daysSinceLastContact: calendarDays,
      lastContactDate: toDateKey(lastContact.lastContactUtc),
      lastOutcome: lastContact.outcome,
      reasons: reasonTags(member, lastContact, calendarDays),
    });
  }

  const outcomeRank = (outcome: string) => (outcome === "escalate" ? 0 : 1);
  followUps.sort(
    (a, b) =>
      outcomeRank(a.lastOutcome) - outcomeRank(b.lastOutcome) ||
      b.daysSinceLastContact - a.daysSinceLastContact ||
      a.memberId - b.memberId,
  );
  return followUps;
}
