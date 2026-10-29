import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TIME_ZONE } from "@/lib/checkin";
import { loadData } from "@/lib/data";
import { buildDueResponse, parseDueQuery, type DueResponse } from "@/lib/due-api";

// The coordinator's page. It reuses the same functions as GET /due
// (no HTTP call to ourselves), so the page and the API always agree.

const DEMO_DATE = "2025-11-06"; // the data is from Oct-Nov 2025
const TOP_OPTIONS = ["5", "10", "20"];

type SearchParams = PageProps<"/">["searchParams"];

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      {/* searchParams and the current time are only known per request */}
      <Suspense fallback={<p className="text-stone-500">Loading members…</p>}>
        <CheckinView searchParams={searchParams} />
      </Suspense>
      <footer className="mt-12 text-center text-xs text-stone-400">
        Clique · helping communities stay connected 🌿
      </footer>
    </main>
  );
}

async function CheckinView({ searchParams }: { searchParams: SearchParams }) {
  // Tell Next.js this part runs per request: it uses the current time (new Date() below).
  await connection();
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["date", "top"]) {
    const value = raw[key];
    if (typeof value === "string" && value !== "") params.set(key, value);
  }

  const now = new Date();
  const parsed = parseDueQuery(params, now);
  if (!parsed.ok) {
    return (
      <>
        <Welcome now={now} date={null} />
        <Controls date="" top="" />
        <Notice emoji="⚠️" tone="error" title="That link doesn't look right">
          {parsed.error}
        </Notice>
      </>
    );
  }

  const response = buildDueResponse(loadData(), parsed.query);

  return (
    <>
      <Welcome now={now} date={response.date} />
      <Controls date={response.date} top={params.get("top") ?? ""} />

      {response.is_holiday ? (
        <Notice emoji="🎉" tone="calm" title="It's a holiday">
          No check-ins are scheduled for {formatDate(response.date)}. Enjoy the day!
        </Notice>
      ) : (
        <>
          <Summary response={response} />

          <section className="mt-10">
            <SectionTitle
              emoji="💛"
              title="Due for a check-in"
              subtitle={
                response.total_due === response.due.length
                  ? `${response.total_due} members haven't heard from us in a week or more. Highest priority first.`
                  : `Showing the top ${response.due.length} of ${response.total_due} members who haven't heard from us in a week or more.`
              }
            />
            {response.due.length === 0 ? (
              <Notice emoji="🌿" tone="calm" title="All caught up">
                Everyone has been contacted in the last 7 days.
              </Notice>
            ) : (
              <MemberTable members={response.due} accent="teal" />
            )}
          </section>

          {response.follow_up.length > 0 && (
            <section className="mt-10">
              <SectionTitle
                emoji="🔁"
                title="Worth a follow-up"
                subtitle="Contacted in the last 7 days, but the call was escalated or not answered."
              />
              <MemberTable members={response.follow_up} accent="amber" />
            </section>
          )}
        </>
      )}
    </>
  );
}

// Friendly header: greeting by the coordinator's local time (Israel) and the date being shown.
function Welcome({ now, date }: { now: Date; date: string | null }) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TIME_ZONE }).format(now),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header className="rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-500 px-6 py-8 text-white shadow-sm sm:px-8">
      <p className="text-sm font-medium text-teal-50/90">Clique · Community check-ins</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{greeting} 👋</h1>
      <p className="mt-2 max-w-xl text-teal-50">
        Here&apos;s who would love to hear from you
        {date ? ` on ${formatDate(date, true)}` : " today"}. A short call can make someone&apos;s day.
      </p>
    </header>
  );
}

// Plain HTML GET form: changing the date or limit just reloads the page with new query params.
function Controls({ date, top }: { date: string; top: string }) {
  return (
    <form className="-mt-5 mx-3 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:mx-6">
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-600">
        Date
        <input
          type="date"
          name="date"
          defaultValue={date}
          className="rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-600">
        Show
        <select
          name="top"
          defaultValue={top}
          className="rounded-xl border border-stone-300 px-3 py-2 text-base text-stone-900"
        >
          <option value="">Everyone due</option>
          {TOP_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Top {n}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-xl bg-teal-700 px-5 py-2.5 font-medium text-white hover:bg-teal-800">
        Update
      </button>
      <div className="ml-auto flex gap-4 text-sm">
        <Link href="/" className="text-teal-700 underline-offset-2 hover:underline">
          Today
        </Link>
        <Link href={`/?date=${DEMO_DATE}`} className="text-teal-700 underline-offset-2 hover:underline">
          Demo date ({formatDate(DEMO_DATE)})
        </Link>
      </div>
    </form>
  );
}

function Summary({ response }: { response: DueResponse }) {
  const cards = [
    { emoji: "💛", value: response.total_due, label: "due for a check-in" },
    { emoji: "🔁", value: response.follow_up.length, label: "worth a follow-up" },
    {
      emoji: "☀️",
      value: response.due.filter((m) => m.recommended_window === "morning").length,
      label: "morning calls in this list",
    },
  ];
  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-2xl">{card.emoji}</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{card.value}</div>
          <div className="text-sm text-stone-500">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold">
        <span className="mr-2">{emoji}</span>
        {title}
      </h2>
      <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
    </div>
  );
}

type Row = DueResponse["due"][number] | DueResponse["follow_up"][number];

// One table for both lists so the columns line up; the score column only
// appears for the spec list (follow-ups are not scored).
function MemberTable({ members, accent }: { members: Row[]; accent: "teal" | "amber" }) {
  const showScore = members.length > 0 && "priority_score" in members[0];
  const frame = accent === "amber" ? "border-amber-200" : "border-stone-200";
  const head = accent === "amber" ? "bg-amber-50 text-amber-800" : "bg-stone-50 text-stone-500";

  return (
    <div className={`mt-4 overflow-x-auto rounded-2xl border bg-white shadow-sm ${frame}`}>
      <table className="w-full text-left">
        <thead className={`border-b text-xs uppercase tracking-wide ${frame} ${head}`}>
          <tr>
            <th className="px-4 py-3">Member</th>
            {showScore && <th className="px-4 py-3">Priority</th>}
            <th className="px-4 py-3">Best time</th>
            <th className="px-4 py-3">Why</th>
            <th className="px-4 py-3">Reach by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {members.map((m) => (
            <tr key={m.member_id} className="hover:bg-stone-50/60">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={m.full_name} id={m.member_id} />
                  <div>
                    <div className="font-medium whitespace-nowrap">{m.full_name}</div>
                    {/* Names repeat in the data (e.g. two Sarah Levi), so the ID tells them apart */}
                    <div className="text-xs text-stone-400">Member ID {m.member_id}</div>
                  </div>
                </div>
              </td>
              {"priority_score" in m && (
                <td className="px-4 py-3">
                  <ScoreBadge score={m.priority_score} />
                </td>
              )}
              <td className="px-4 py-3 whitespace-nowrap">
                {m.recommended_window === "morning" ? "☀️ Morning" : "🌤️ Afternoon"}
              </td>
              <td className="min-w-52 px-4 py-3">
                <Reasons reasons={m.reasons} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{channelLabel(m.preferred_channel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function Notice({
  emoji,
  tone,
  title,
  children,
}: {
  emoji: string;
  tone: "calm" | "error";
  title: string;
  children: React.ReactNode;
}) {
  const colors = tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-stone-200 bg-white text-stone-700";
  return (
    <div className={`mt-8 rounded-2xl border p-6 text-center shadow-sm ${colors}`}>
      <div className="text-3xl">{emoji}</div>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

function channelLabel(channel: string): string {
  return { call: "📞 Call", sms: "💬 SMS", whatsapp: "🟢 WhatsApp" }[channel] ?? channel;
}

// "2025-11-06" -> "6 Nov 2025", or "Thursday, 6 November 2025" when long.
// Read as UTC so the day never shifts.
function formatDate(dateKey: string, long = false): string {
  return new Date(dateKey).toLocaleDateString("en-GB", {
    weekday: long ? "long" : undefined,
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
