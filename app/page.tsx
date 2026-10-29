import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
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
      <header className="mb-6">
        <p className="text-sm font-medium text-teal-700">Clique · Coordinator</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Who needs a check-in today?</h1>
      </header>
      {/* searchParams and the current time are only known per request */}
      <Suspense fallback={<p className="text-stone-500">Loading members…</p>}>
        <CheckinView searchParams={searchParams} />
      </Suspense>
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

  const parsed = parseDueQuery(params, new Date());
  if (!parsed.ok) {
    return (
      <>
        <Controls date="" top="" />
        <Notice tone="error">{parsed.error}</Notice>
      </>
    );
  }

  const response = buildDueResponse(loadData(), parsed.query);
  const allDue = response.total_due === response.due.length;

  return (
    <>
      <Controls date={response.date} top={params.get("top") ?? ""} />

      {response.is_holiday ? (
        <Notice tone="info">
          {formatDate(response.date)} is a holiday, so no check-ins are scheduled.
        </Notice>
      ) : (
        <>
          {response.follow_up.length > 0 && <FollowUpSection members={response.follow_up} />}

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Due for a check-in</h2>
            <p className="mt-1 text-sm text-stone-600">
              {allDue
                ? `${response.total_due} members, highest priority first.`
                : `Top ${response.due.length} of ${response.total_due} members, highest priority first.`}{" "}
              Not contacted for 7+ days, or never.
            </p>
            {response.due.length === 0 ? (
              <Notice tone="info">Nobody is due on {formatDate(response.date)}.</Notice>
            ) : (
              <DueTable members={response.due} />
            )}
          </section>
        </>
      )}
    </>
  );
}

// Plain HTML GET form: changing the date or limit just reloads the page with new query params.
function Controls({ date, top }: { date: string; top: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
        Date
        <input
          type="date"
          name="date"
          defaultValue={date}
          className="rounded-lg border border-stone-300 px-3 py-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-stone-700">
        Show
        <select
          name="top"
          defaultValue={top}
          className="rounded-lg border border-stone-300 px-3 py-2 text-base"
        >
          <option value="">Everyone due</option>
          {TOP_OPTIONS.map((n) => (
            <option key={n} value={n}>
              Top {n}
            </option>
          ))}
        </select>
      </label>
      <button className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800">
        Update
      </button>
      <div className="ml-auto flex gap-3 text-sm">
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

function FollowUpSection({ members }: { members: DueResponse["follow_up"] }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-amber-900">Needs follow-up ({members.length})</h2>
      <p className="mt-1 text-sm text-stone-600">
        Contacted in the last 7 days, but the call was escalated or not answered.
      </p>
      <MemberTable members={members} accent="amber" />
    </section>
  );
}

function DueTable({ members }: { members: DueResponse["due"] }) {
  return <MemberTable members={members} accent="stone" />;
}

type Row = DueResponse["due"][number] | DueResponse["follow_up"][number];

// One table for both lists so the columns line up; the score column only
// appears for the spec list (follow-ups are not scored).
function MemberTable({ members, accent }: { members: Row[]; accent: "stone" | "amber" }) {
  const showScore = members.length > 0 && "priority_score" in members[0];
  const frame = accent === "amber" ? "border-amber-300" : "border-stone-200";
  const head = accent === "amber" ? "bg-amber-50 text-amber-900" : "bg-stone-50 text-stone-500";

  return (
    <div className={`mt-3 overflow-x-auto rounded-xl border bg-white ${frame}`}>
      <table className="w-full text-left">
        <thead className={`border-b text-xs uppercase tracking-wide ${frame} ${head}`}>
          <tr>
            <th className="px-4 py-3">Member</th>
            {showScore && <th className="px-4 py-3 text-right">Score</th>}
            <th className="px-4 py-3">Window</th>
            <th className="px-4 py-3">Why</th>
            <th className="px-4 py-3">Channel</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {members.map((m) => (
            <tr key={m.member_id}>
              <td className="px-4 py-3">
                <div className="font-medium whitespace-nowrap">{m.full_name}</div>
                {/* Names repeat in the data (e.g. two Sarah Levi), so always show the ID */}
                <div className="text-xs text-stone-500">#{m.member_id}</div>
              </td>
              {"priority_score" in m && (
                <td className="px-4 py-3 text-right font-mono text-lg tabular-nums">
                  {m.priority_score.toFixed(1)}
                </td>
              )}
              <td className="px-4 py-3 capitalize">{m.recommended_window}</td>
              <td className="px-4 py-3">
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

function Notice({ tone, children }: { tone: "info" | "error"; children: React.ReactNode }) {
  const colors =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-900"
      : "border-stone-200 bg-stone-50 text-stone-700";
  return <p className={`mt-6 rounded-xl border p-4 ${colors}`}>{children}</p>;
}

function channelLabel(channel: string): string {
  return { call: "📞 Call", sms: "💬 SMS", whatsapp: "🟢 WhatsApp" }[channel] ?? channel;
}

// "2025-11-06" -> "6 Nov 2025" (read as UTC so the day never shifts)
function formatDate(dateKey: string): string {
  return new Date(dateKey).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
