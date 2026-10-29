import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { loadData } from "@/lib/data";
import { buildDueResponse, parseDueQuery } from "@/lib/due-api";
import { CheckinBoard } from "./checkin-board";
import { Notice } from "./ui";

// The coordinator's page. It reuses the same functions as GET /due
// (no HTTP call to ourselves), so the page and the API always agree.
// The interactive lists live in checkin-board.tsx (a client component).

const DEMO_DATE = "2025-11-06"; // the data is from Oct-Nov 2025
const TOP_OPTIONS = ["5", "10", "20"];

type SearchParams = PageProps<"/">["searchParams"];

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <p className="text-sm font-medium text-teal-700">Clique</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Community check-ins</h1>
      </header>
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

  const parsed = parseDueQuery(params, new Date());
  if (!parsed.ok) {
    return (
      <>
        <Controls date="" top="" />
        <Notice emoji="⚠️" tone="error" title="That link doesn't look right">
          {parsed.error}
        </Notice>
      </>
    );
  }

  // Load everyone due; the board applies `top` after hiding members already done today.
  const { today, top } = parsed.query;
  const response = buildDueResponse(loadData(), { today });

  return (
    <>
      <Controls date={response.date} top={params.get("top") ?? ""} />
      {response.is_holiday ? (
        <Notice emoji="🎉" tone="calm" title="It's a holiday">
          No check-ins are scheduled for {formatDate(response.date)}. Enjoy the day!
        </Notice>
      ) : (
        <CheckinBoard date={response.date} due={response.due} followUp={response.follow_up} top={top} />
      )}
    </>
  );
}

// Plain HTML GET form: changing the date or limit just reloads the page with new query params.
function Controls({ date, top }: { date: string; top: string }) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
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

// "2025-11-06" -> "6 Nov 2025" (read as UTC so the day never shifts)
function formatDate(dateKey: string): string {
  return new Date(dateKey).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
