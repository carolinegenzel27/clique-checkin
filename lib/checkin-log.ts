// The coordinator's log of today's check-ins (who was reached, and how it went).
// Pure functions only; the page stores the log in the browser's localStorage,
// one entry per date, so each day starts empty.

export const OUTCOMES = ["ok", "no_answer", "escalate"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type LogEntry = { outcome: Outcome; loggedAt: string }; // loggedAt = ISO time
export type CheckinLog = Record<string, LogEntry>; // key = member_id

export function storageKey(date: string): string {
  return `clique-checkins:${date}`;
}

// Never trust stored data: anything malformed is ignored instead of crashing the page.
export function parseLog(raw: string | null): CheckinLog {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const log: CheckinLog = {};
    for (const [memberId, entry] of Object.entries(parsed)) {
      const { outcome, loggedAt } = (entry ?? {}) as Partial<LogEntry>;
      if (OUTCOMES.includes(outcome as Outcome) && typeof loggedAt === "string") {
        log[memberId] = { outcome: outcome as Outcome, loggedAt };
      }
    }
    return log;
  } catch {
    return {};
  }
}

export function logOutcome(log: CheckinLog, memberId: number, outcome: Outcome, at: Date): CheckinLog {
  return { ...log, [memberId]: { outcome, loggedAt: at.toISOString() } };
}

export function undoOutcome(log: CheckinLog, memberId: number): CheckinLog {
  const next = { ...log };
  delete next[memberId];
  return next;
}
