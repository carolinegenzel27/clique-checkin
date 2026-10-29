"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  logOutcome,
  parseLog,
  storageKey,
  undoOutcome,
  type CheckinLog,
  type Outcome,
} from "@/lib/checkin-log";
import type { DueResponse } from "@/lib/due-api";
import { Notice, SectionTitle } from "./ui";

// The interactive part of the page: both member lists with contact buttons,
// outcome buttons, and a "Done today" list. Outcomes are saved in this
// browser only (localStorage), keyed by date.

type DueRow = DueResponse["due"][number];
type FollowUpRow = DueResponse["follow_up"][number];
type Row = DueRow | FollowUpRow;

type Props = {
  date: string;
  due: DueRow[]; // everyone due, already sorted; `top` is applied here after removing done members
  followUp: FollowUpRow[];
  top?: number;
};

export function CheckinBoard({ date, due, followUp, top }: Props) {
  const [log, saveLog] = useCheckinLog(date);
  const isDone = (row: Row) => String(row.member_id) in log;

  const dueLeft = due.filter((row) => !isDone(row));
  const dueShown = top === undefined ? dueLeft : dueLeft.slice(0, top);
  const followUpLeft = followUp.filter((row) => !isDone(row));
  const doneCount = Object.keys(log).length;

  const onLog = (memberId: number, outcome: Outcome) => saveLog(logOutcome(log, memberId, outcome, new Date()));
  const onUndo = (memberId: number) => saveLog(undoOutcome(log, memberId));

  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <SummaryCard emoji="💛" value={dueLeft.length} label="due for a check-in" />
        <SummaryCard emoji="🔁" value={followUpLeft.length} label="worth a follow-up" />
        <SummaryCard emoji="✅" value={doneCount} label="done today" />
      </div>

      <section className="mt-10">
        <SectionTitle
          emoji="💛"
          title="Due for a check-in"
          subtitle={
            dueShown.length === dueLeft.length
              ? `${dueLeft.length} members haven't heard from us in a week or more. Highest priority first.`
              : `Showing the top ${dueShown.length} of ${dueLeft.length} members who haven't heard from us in a week or more.`
          }
        />
        {dueShown.length === 0 ? (
          <Notice emoji="🌿" tone="calm" title="All caught up">
            {due.length === 0 ? "Everyone has been contacted in the last 7 days." : "Everyone due has been checked in on today."}
          </Notice>
        ) : (
          <MemberTable members={dueShown} accent="teal" onLog={onLog} />
        )}
      </section>

      {followUpLeft.length > 0 && (
        <section className="mt-10">
          <SectionTitle
            emoji="🔁"
            title="Worth a follow-up"
            subtitle="Contacted in the last 7 days, but the call was escalated or not answered."
          />
          <MemberTable members={followUpLeft} accent="amber" onLog={onLog} />
        </section>
      )}

      {doneCount > 0 && <DoneToday log={log} rows={[...due, ...followUp]} onUndo={onUndo} />}
    </>
  );
}

// Reads and writes the log in localStorage. useSyncExternalStore keeps the
// server render (empty log) and the browser render in sync without a flash error.
const CHANGE_EVENT = "clique-checkins-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked (e.g. private mode): behave as an empty log
  }
}

function useCheckinLog(date: string): [CheckinLog, (next: CheckinLog) => void] {
  const key = storageKey(date);
  const raw = useSyncExternalStore(subscribe, () => readStorage(key), () => null);
  const log = useMemo(() => parseLog(raw), [raw]);

  const save = (next: CheckinLog) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage blocked: nothing we can persist
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [log, save];
}

function SummaryCard({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      <div className="text-sm text-stone-500">{label}</div>
    </div>
  );
}

// One table for both lists so the columns line up.
function MemberTable({
  members,
  accent,
  onLog,
}: {
  members: Row[];
  accent: "teal" | "amber";
  onLog: (memberId: number, outcome: Outcome) => void;
}) {
  const frame = accent === "amber" ? "border-amber-200" : "border-stone-200";
  const head = accent === "amber" ? "bg-amber-50 text-amber-800" : "bg-stone-50 text-stone-500";

  return (
    <div className={`mt-4 overflow-x-auto rounded-2xl border bg-white shadow-sm ${frame}`}>
      <table className="w-full text-left">
        <thead className={`border-b text-xs uppercase tracking-wide ${frame} ${head}`}>
          <tr>
            <th className="px-4 py-3">Member</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Why</th>
            <th className="px-4 py-3">Check in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {members.map((m) => (
            <tr key={m.member_id} className="hover:bg-stone-50/60">
              <td className="px-4 py-3">
                <MemberName name={m.full_name} id={m.member_id} />
                <div className="mt-1 pl-12 text-sm whitespace-nowrap text-stone-600">
                  {m.recommended_window === "morning" ? "☀️ Best in the morning" : "🌤️ Best in the afternoon"}
                </div>
              </td>
              <td className="px-4 py-3">
                <ScoreBadge score={m.priority_score} />
              </td>
              <td className="min-w-48 px-4 py-3">
                <Reasons reasons={m.reasons} />
              </td>
              <td className="px-4 py-3">
                <CheckinActions channel={m.preferred_channel} onLog={(outcome) => onLog(m.member_id, outcome)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The data has no phone numbers, so these links open the right app without a recipient.
const CHANNELS: Record<string, { label: string; href: string }> = {
  call: { label: "📞 Call", href: "tel:" },
  sms: { label: "💬 SMS", href: "sms:" },
  whatsapp: { label: "🟢 WhatsApp", href: "https://wa.me/" },
};

const OUTCOME_BUTTONS: { outcome: Outcome; label: string; className: string }[] = [
  { outcome: "ok", label: "✓ OK", className: "border-emerald-200 text-emerald-800 hover:bg-emerald-50" },
  { outcome: "no_answer", label: "No answer", className: "border-stone-200 text-stone-700 hover:bg-stone-50" },
  { outcome: "escalate", label: "⚠ Escalate", className: "border-rose-200 text-rose-800 hover:bg-rose-50" },
];

function CheckinActions({ channel, onLog }: { channel: string; onLog: (outcome: Outcome) => void }) {
  const contact = CHANNELS[channel];
  return (
    <div className="flex min-w-52 flex-col gap-2">
      {contact && (
        <a
          href={contact.href}
          target={channel === "whatsapp" ? "_blank" : undefined}
          rel="noopener noreferrer"
          title="No phone number in the data yet: opens the app without a recipient"
          className="w-fit rounded-xl bg-teal-700 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white hover:bg-teal-800"
        >
          {contact.label}
        </a>
      )}
      <div className="flex flex-wrap gap-1">
        {OUTCOME_BUTTONS.map((button) => (
          <button
            key={button.outcome}
            type="button"
            onClick={() => onLog(button.outcome)}
            className={`rounded-lg border px-2 py-1 text-xs font-medium whitespace-nowrap ${button.className}`}
          >
            {button.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const OUTCOME_BADGES: Record<Outcome, { label: string; className: string }> = {
  ok: { label: "✓ OK", className: "bg-emerald-100 text-emerald-800" },
  no_answer: { label: "No answer", className: "bg-stone-100 text-stone-700" },
  escalate: { label: "⚠ Escalated", className: "bg-rose-100 text-rose-800" },
};

function DoneToday({ log, rows, onUndo }: { log: CheckinLog; rows: Row[]; onUndo: (memberId: number) => void }) {
  // Newest first, so the call you just logged is at the top.
  const entries = Object.entries(log)
    .map(([memberId, entry]) => ({ row: rows.find((r) => String(r.member_id) === memberId), entry }))
    .filter((item): item is { row: Row; entry: (typeof item)["entry"] } => item.row !== undefined)
    .sort((a, b) => b.entry.loggedAt.localeCompare(a.entry.loggedAt));

  return (
    <section className="mt-10">
      <SectionTitle emoji="✅" title="Done today" subtitle="Saved in this browser. Undo if you logged the wrong member." />
      <ul className="mt-4 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white shadow-sm">
        {entries.map(({ row, entry }) => {
          const badge = OUTCOME_BADGES[entry.outcome];
          return (
            <li key={row.member_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <MemberName name={row.full_name} id={row.member_id} />
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>{badge.label}</span>
              <span className="text-sm text-stone-500">at {formatTime(entry.loggedAt)}</span>
              <button
                type="button"
                onClick={() => onUndo(row.member_id)}
                className="ml-auto rounded-lg border border-stone-200 px-3 py-1 text-sm text-stone-700 hover:bg-stone-50"
              >
                Undo
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MemberName({ name, id }: { name: string; id: number }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} id={id} />
      <div>
        <div className="font-medium whitespace-nowrap">{name}</div>
        {/* Names repeat in the data (e.g. two Sarah Levi), so the ID tells them apart */}
        <div className="text-xs text-stone-400">Member ID {id}</div>
      </div>
    </div>
  );
}

// Initials in a soft circle; the color comes from the member ID so it stays the same.
const AVATAR_COLORS = [
  "bg-teal-100 text-teal-800",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-lime-100 text-lime-800",
];
function Avatar({ name, id }: { name: string; id: number }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        AVATAR_COLORS[id % AVATAR_COLORS.length]
      }`}
    >
      {initials}
    </span>
  );
}

// Display only: color bands to make the number easier to scan (the ranking uses the exact score).
function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7 ? "bg-rose-100 text-rose-800" : score >= 4 ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

// Risk tags get a warmer color than the "N days" tag so they stand out.
function Reasons({ reasons }: { reasons: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {reasons.map((reason) => {
        const isTime = reason.endsWith("days") || reason.endsWith("day") || reason === "No contact yet";
        return (
          <span
            key={reason}
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              isTime ? "bg-stone-100 text-stone-600" : "bg-rose-50 text-rose-800"
            }`}
          >
            {reason}
          </span>
        );
      })}
    </span>
  );
}

// "2025-11-06T09:30:00Z" -> "11:30" in Israel time
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
}
