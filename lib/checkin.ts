import type { CheckinData, LastContact, Member } from "./data";

// All the business rules from the assignment live in this file.
// Pure functions only (no file or network access), so they are easy to test.

export const VALID_CHANNELS = ["call", "sms", "whatsapp"];
export const MIN_DAYS_SINCE_CONTACT = 7;
// Assumption: a member with no contact record is scored as if their last
// contact was 28 days ago (+4.0), so they rank high without beating everyone.
export const NO_CONTACT_ASSUMED_DAYS = 28;
const MORNING_MIN_AGE = 80;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type Window = "morning" | "afternoon";

export type DueMember = {
  memberId: number;
  fullName: string;
  priorityScore: number; // rounded to 1 decimal
  recommendedWindow: Window;
  preferredChannel: string;
  daysSinceLastContact: number | null; // whole days, null = no record
  lastOutcome: string | null;
  reasons: string[]; // short tags for the "Why" column
};

// "YYYY-MM-DD" of a date in UTC, the same format as holidays.json.
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isHoliday(today: Date, holidays: string[]): boolean {
  return holidays.includes(toDateKey(today));
}

export function hasValidChannel(member: Member): boolean {
  return VALID_CHANNELS.includes(member.preferredChannel);
}

// Fractional days between the last contact and "today".
// Negative if the contact is after "today" (possible with a past ?date=).
export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
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

// Short, human tags explaining why a member is on the list.
function reasonTags(
  member: Member,
  lastContact: LastContact | undefined,
  daysSince: number | null,
): string[] {
  const tags: string[] = [];
  if (member.riskFlags.includes("recent_discharge")) tags.push("Discharged");
  if (member.riskFlags.includes("lives_alone")) tags.push("Lives alone");
  if (member.age >= 80) tags.push("80+");
  if (lastContact?.outcome === "no_answer") tags.push("No answer");
  // Not scored by the spec, but a coordinator should see it.
  if (lastContact?.outcome === "escalate") tags.push("Escalated");
  tags.push(daysSince === null ? "No contact yet" : `${Math.floor(daysSince)} days`);
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

// Main entry point: who needs a check-in on `today`, highest priority first.
export function getDueMembers(data: CheckinData, today: Date, top?: number): DueMember[] {
  if (isHoliday(today, data.holidays)) return [];

  const contacts = latestContactByMember(data.lastContacts);
  // Keep the unrounded score next to each member so sorting stays exact.
  const due: { member: DueMember; rawScore: number }[] = [];

  for (const member of data.members) {
    if (!hasValidChannel(member)) continue;

    const lastContact = contacts.get(member.memberId);
    const daysSince = lastContact ? daysBetween(lastContact.lastContactUtc, today) : null;

    // No record -> due. Otherwise due only after 7+ days
    // (this also skips contacts dated after "today").
    if (daysSince !== null && daysSince < MIN_DAYS_SINCE_CONTACT) continue;

    const rawScore = priorityScore(member, lastContact, daysSince);
    due.push({
      rawScore,
      member: {
        memberId: member.memberId,
        fullName: member.fullName,
        priorityScore: Math.round(rawScore * 10) / 10,
        recommendedWindow: recommendedWindow(member.age),
        preferredChannel: member.preferredChannel,
        daysSinceLastContact: daysSince === null ? null : Math.floor(daysSince),
        lastOutcome: lastContact?.outcome ?? null,
        reasons: reasonTags(member, lastContact, daysSince),
      },
    });
  }

  // Highest score first; ties broken by member_id so the order is stable.
  due.sort((a, b) => b.rawScore - a.rawScore || a.member.memberId - b.member.memberId);

  const sorted = due.map((entry) => entry.member);
  return top === undefined ? sorted : sorted.slice(0, top);
}
