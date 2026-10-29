import fs from "node:fs";
import path from "node:path";

// Typed shapes of the raw data. Validation (e.g. "does the channel exist?")
// is business logic and lives in checkin.ts, not here.

export type Member = {
  memberId: number;
  fullName: string;
  age: number;
  preferredChannel: string; // may be "" if missing in the CSV
  riskFlags: string[]; // e.g. ["lives_alone", "recent_discharge"]
};

export type LastContact = {
  memberId: number;
  lastContactUtc: Date;
  outcome: string; // "ok" | "no_answer" | "escalate" in the given data
};

export type CheckinData = {
  members: Member[];
  lastContacts: LastContact[];
  holidays: string[]; // "YYYY-MM-DD"
};

// turbopackIgnore: the folder is shipped via outputFileTracingIncludes in next.config.ts,
// so the bundler should not try to trace this runtime path.
const DATA_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data");

// Minimal CSV parser: the files have no quoted fields or commas inside values,
// so splitting on "," is enough. Returns one object per row, keyed by header.
export function parseCsv(text: string): Record<string, string>[] {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map((h) => h.trim());

  return lines
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const values = line.split(",");
      const row: Record<string, string> = {};
      headers.forEach((header, i) => (row[header] = (values[i] ?? "").trim()));
      return row;
    });
}

export function parseMembers(text: string): Member[] {
  return parseCsv(text).map((row) => ({
    memberId: Number(row.member_id),
    fullName: row.full_name,
    age: Number(row.age),
    preferredChannel: row.preferred_channel,
    // risk_flags uses ";" between flags and can be empty
    riskFlags: row.risk_flags ? row.risk_flags.split(";").filter(Boolean) : [],
  }));
}

export function parseLastContacts(text: string): LastContact[] {
  return (
    parseCsv(text)
      .map((row) => ({
        memberId: Number(row.member_id),
        lastContactUtc: new Date(row.last_contact_utc),
        outcome: row.outcome,
      }))
      // A row with an unreadable date is skipped, so that member counts as
      // "no contact record" instead of one bad row breaking the whole list.
      .filter((contact) => !Number.isNaN(contact.lastContactUtc.getTime()))
  );
}

// Reads all three files from /data. Server-side only (uses the file system).
export function loadData(dataDir: string = DATA_DIR): CheckinData {
  const read = (file: string) => fs.readFileSync(path.join(dataDir, file), "utf8");

  return {
    members: parseMembers(read("members.csv")),
    lastContacts: parseLastContacts(read("last_contacts.csv")),
    holidays: JSON.parse(read("holidays.json")),
  };
}
