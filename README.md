# Clique Check-ins

A small web tool that shows community coordinators **which members need a check-in today**, in priority order, and lets them log how each call went.

It has both versions the assignment allows:

- **Web API:** `GET /due?top=5` returns the ranked list as JSON.
- **Web page:** a coordinator view of the same list, with contact and outcome buttons.

## How to run

You need **Node.js 20.9 or newer**.

```bash
npm install
npm run dev
```

Then open **http://localhost:3000/?date=2025-11-06**.

> The sample data is from October–November 2025. With today's real date, every contact is over a week old, so **everyone** is due. Use `?date=2025-11-06`, or the **Demo date** link on the page, to see a realistic list.

### API

```bash
curl "http://localhost:3000/due?top=5&date=2025-11-06"
```

| Parameter | Required | Meaning |
|---|---|---|
| `top` | no | How many members to return (a positive whole number). Default: everyone due. |
| `date` | no | The day to calculate for, as `YYYY-MM-DD`. Default: today in Israel time. |

Invalid values (`top=abc`, `date=2025-02-30`) return **HTTP 400** with an error message.

Example response (shortened):

```json
{
  "date": "2025-11-06",
  "time_zone": "Asia/Jerusalem",
  "is_holiday": false,
  "total_due": 37,
  "due": [
    {
      "member_id": 2,
      "full_name": "Isaac Regev",
      "priority_score": 8.6,
      "recommended_window": "afternoon",
      "preferred_channel": "sms",
      "days_since_last_contact": 18,
      "last_outcome": "no_answer",
      "reasons": ["Discharged", "Lives alone", "No answer", "18 days"]
    }
  ],
  "follow_up": [ ... ]
}
```

`member_id`, `full_name`, `priority_score` and `recommended_window` are the fields the assignment asks for. The rest are extras used by the page.

### Tests

```bash
npm test
```

34 tests cover the rules (holiday, missing contact, the 7-day boundary, scoring, sorting, rounding, ties), the follow-up list, data parsing, API input validation, the check-in log, and the expected top 5 for the real data on 6 Nov 2025.

## How it works

| File | What it does |
|---|---|
| `lib/data.ts` | Reads `members.csv`, `last_contacts.csv` and `holidays.json` into typed objects. |
| `lib/checkin.ts` | **All the business rules**: who is due, the priority score, the time window, sorting, and the follow-up list. Pure functions, no file or network access. |
| `lib/due-api.ts` | Validates `?top` and `?date` and shapes the JSON response. |
| `app/due/route.ts` | The `GET /due` endpoint (about 10 lines; it calls the two files above). |
| `app/page.tsx` | The coordinator page. It calls the same functions as the API, so both always agree. |
| `app/checkin-board.tsx` | The interactive tables: contact buttons, outcome buttons and "Done today". |
| `lib/checkin-log.ts` | Logging and undoing outcomes (saved in the browser). |

**Rules (from the assignment):** a member is due if they haven't been contacted for 7+ days (or never), today isn't a holiday, and they have a preferred channel. The score is +3 recent discharge, +2 lives alone, +1 age 80+, +1 last outcome `no_answer`, plus `days_since_last_contact / 7`. The list is sorted highest first. Age 80+ gets `morning`, everyone else gets `afternoon`.

## Assumptions

Where the assignment left something open, I made these choices:

1. **"Today" is a calendar date in Israel time** (`Asia/Jerusalem`), since that's where the coordinators work. This applies to both "who is due" and the holiday check. For example, 23:30 UTC on 6 Nov is already 7 Nov in Israel.
2. **"7 days" is counted in calendar days, not hours.** A member called on 30 Oct at any hour is due on 6 Nov. With hours, someone called at 20:52 would only count as 6.1 days, so they'd stay hidden for an extra day. The **score** still uses exact fractional days, as the formula asks.
3. **No contact record:** the member is due, and the score treats them as 28 days since contact (+4.0). That puts them high on the list without automatically beating everyone. It's one constant (`NO_CONTACT_ASSUMED_DAYS`) and easy to change.
4. **Holiday:** both lists are empty, and the page and API say clearly that it's a holiday.
5. **Valid channel** means `call`, `sms` or `whatsapp`. An empty or unknown channel is skipped.
6. **A contact dated after "today"** (possible when looking at a past date) means the member is not due.
7. **Several contact rows for one member:** the most recent is used.
8. **Scores are rounded to 1 decimal** for display, like the example output. Sorting uses the exact score, and ties go to the lower `member_id`, so the order is always the same.
9. **`top` is optional.** Without it, everyone due is returned.
10. **Names are not unique** in the data (for example, there are two "Sarah Levi"s), so everything uses `member_id`, and the page shows the ID under each name.

### What I added beyond the spec

- **"Worth a follow-up" list.** The 7-day rule hides people *because* they were contacted recently, even when that call went badly. On 6 Nov, 8 members were escalated or didn't answer in the last week (for example, someone just discharged who lives alone, escalated 3 days ago). They appear in a separate list, scored with the same formula. The spec's list is unchanged.
- **Short "Why" tags** on each member (e.g. `Discharged · Lives alone · 18 days`), so a coordinator can see at a glance why someone is on the list.
- **Contact and outcome buttons.** Each member has a button for their preferred channel and **OK / No answer / Escalate** buttons. Logged members move to **Done today** (with Undo), and a "Top N" list refills with the next person.

### Known limits

- **There are no phone numbers in the data**, so contact buttons open the phone, SMS or WhatsApp app without a recipient.
- **Logged outcomes are saved in this browser only** (localStorage, one log per date). They aren't shared between coordinators and don't update `last_contacts.csv`.
- **`escalate` adds no points**, as specified, even though it's the most worrying outcome. It's shown as a tag and drives the follow-up list. I'd raise this with the team before changing the formula.

## Why I chose each tool

| Tool | Why |
|---|---|
| **Next.js (App Router)** | One project gives both an API and a page. I already know it, so the time went into the logic, not setup. |
| **TypeScript** | Types catch mistakes like a misspelled field or a string where a number belongs before the code runs. That matters when the data comes from CSV, where everything starts as text. |
| **Plain functions in `lib/`** | The rules don't depend on Next.js, React or files, so they're easy to test, easy to explain, and shared by the page and the API. |
| **No CSV library** | The files are simple (no quotes or commas inside values), so a 10-line parser is enough, in line with "not fancy libraries". |
| **Vitest** | A fast test runner that works with TypeScript without extra setup. |
| **Tailwind CSS** | Quick, consistent styling written next to the HTML. |
| **localStorage** | Saves "Done today" with no database or login, which is enough to show the idea in a short task. |

## What I'd do with more time

1. **Save outcomes to a real backend.** Today, "Done today" lives in one browser. With a small database, each logged outcome would update the member's last contact, so **tomorrow's list reflects today's calls**, and every coordinator sees the same, up-to-date data.
2. **Assign members to coordinators.** With several coordinators, each would see only their own members, with a way to hand someone over. That prevents two people calling the same member, or nobody calling them.
3. **Add notes and history per member.** A short note after each call ("sounded tired, call again Friday") and a timeline of past calls. The next person who calls has context, and the conversation feels personal instead of starting from zero.
