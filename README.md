# MultiAgency Contributor Bot

Telegram bot that coordinates contributor tasks through the full lifecycle:
signal → draft → human approval → route → claim → submit → review → amplify → complete.
See [PROPOSAL_V2.md](PROPOSAL_V2.md) for the full architecture rationale and [DEPLOY.md](DEPLOY.md) for deployment steps.

## Stack

Telegraf + Prisma (Postgres) + Claude API. LangGraph is scaffolded as the orchestration layer for multi-node AI steps in a later phase (see `src/ai/graphs/candidateScoring.js`); the current build calls the Claude API directly for simple suggestions. URL submissions are standardized into text via Jina Reader (`src/ai/urlToFile.js`, no API key required).

## Setup

```bash
cp .env.example .env   # fill in BOT_TOKEN, DATABASE_URL (Neon), ANTHROPIC_API_KEY, ADMIN_TELEGRAM_IDS
npm install
npx prisma migrate dev --name init   # create tables on Postgres
npm run dev
```

## Bot commands

Contributor: `/start` or `/help` (shows the command guide), `/register <twitter_handle>`, `/tasks` (open/routed tasks), `/mytasks` (your tasks and their status), `/claim <id>`, `/submit <id> [content or link]`, `/status <id>` (one task's status/history), `/cancel`. To submit a video, photo, or file, either send it with `/submit <id>` as the caption, or send `/submit <id>` alone and then the file/text within 5 minutes (see [Submissions](#submissions)).

Admin (global admins in `ADMIN_TELEGRAM_IDS`, or room admins for tasks belonging to their room — see [Multi-admin / room permissions](#multi-admin--room-permissions)):
- `/newtask <title> | <description> | <reward> | <required output> | [category] | [skill1,skill2]`, or just `/newtask` for a step-by-step wizard
- `/drafttask <short prompt>` — Claude expands a short request into a full draft
- `/drafts` — list tasks awaiting approval (all of them for global admins, your rooms' for room admins)
- `/alltasks [status]` — list every task regardless of status (optionally filtered, e.g. `/alltasks CLAIMED`), same room-scoping as `/drafts`
- `/approve <id>` — Draft → Approved
- `/route <id>` — Approved → Routed, ranks registered contributors via the matching engine and reserves the task for the top match (see [Routing](#routing-lock--reroute-scheduler))
- `/review <id> approve|reject|revise [note]` — Submitted → Reviewed/Rejected/Revision-Requested
- `/amplify <id> [note]` — Reviewed → Amplified
- `/complete <id>` — Reviewed/Amplified → Completed, updates contributor stats
- `/addroomadmin` / `/removeroomadmin` — reply to a user's message inside a group to grant/revoke room-admin status there
- `/roomadmins` — list a room's admins

## Task status

```
SIGNAL → DRAFT → APPROVED → ROUTED → CLAIMED → SUBMITTED → REVIEWED → AMPLIFIED → COMPLETED
```

`SUBMITTED` also branches to `REJECTED` or `REVISION_REQUESTED` (loops back to `SUBMITTED` after resubmission). `REVIEWED` can go straight to `COMPLETED` if amplification isn't needed. Transition logic lives in `src/workflow.js`. `/newtask` creates a task directly in `DRAFT`; tasks auto-drafted from chat signals (see below) are linked back to their `Signal` record via `Task.signalId`.

## Signal detection (auto-drafting tasks from chat)

The bot can passively watch group chats and auto-draft a task when a message looks like a real opportunity (`src/signalDetection.js` + `evaluateSignal` in `src/ai/claude.js`). It never auto-approves — auto-drafted tasks land in `DRAFT` exactly like `/newtask`, and an admin still has to `/approve` them.

**Disabled by default, opt-in per chat, no redeploy needed.** To enable it for a chat:
1. Message [@BotFather](https://t.me/BotFather) → `/setprivacy` → select your bot → **Disable**, once, for the bot account. By default Telegram only delivers commands/mentions to bots in groups; disabling privacy mode lets it see all messages (existing group members must be aware of this).
2. Add the bot to the group. It auto-detects the invite (`my_chat_member` update, handled in `src/bot/commands/signalChatAdmin.js`), creates a `Room` row for that chat, makes whoever added the bot a room admin, and DMs every global admin with the chat's name/ID and what to do next.
3. A room admin (or global admin) opens that group and runs `/enablesignals` there. This sets `Room.signalsEnabled = true` (`src/rooms.js`) — no env var, no redeploy. `/disablesignals` turns it back off (also happens automatically if the bot is removed from the group); `/signalstatus` checks the current chat's state.

Pipeline per message: a cheap length/word-count pre-filter runs first (no API cost), then a per-room rate limit (`SIGNAL_MAX_PER_HOUR`, default 20/hour — backed by a DB count of that room's `Signal` rows in the last hour, so it survives restarts/redeploys), then Claude (Haiku) scores it 0–10 and drafts a title/description/category/skills if it clears `SIGNAL_SCORE_THRESHOLD` (default 6). Every evaluated message is stored as a `Signal` row regardless of outcome (`status: DRAFTED` or `DISCARDED`), so discarded signals stay auditable. Use `/drafts` to review everything currently sitting in `DRAFT`, whether auto-drafted or created manually.

## Candidate evaluation

`/register <twitter_handle>` marks a contributor `isRegistered` and computes:
- `telegramScore` — real signal from profile completeness + in-system track record (`src/candidateEvaluation.js`)
- `twitterScore` — stubbed until `TWITTER_BEARER_TOKEN` is configured (returns `null`, not fabricated)
- `socialTrustScore` / `eligibilityTier` — derived from the above

Only registered contributors can `/claim` tasks.

## Matching engine

`src/matching.js` computes a composite match score per PROPOSAL_V2.md's weighting (skill fit, reputation, past performance, social trust, availability, preference) and ranks registered candidates for a task. `src/routing.js` wraps it with the DB queries needed to actually rank real candidates (fetches registered contributors + their current workload). Both `/route` and the reroute scheduler (below) use it.

## Routing lock + reroute scheduler

`/route` now reserves the task for its top-ranked candidate — a real lock, not just a suggestion. Mechanics:
- `Task.routedContributorId` + `Task.routedAt` mark who it's reserved for and when. `/claim` rejects anyone else until the lock expires (`ROUTE_LOCK_MINUTES`, default 30).
- An in-process scheduler (`src/scheduler.js`, started in `src/index.js` alongside the bot) checks every `ROUTE_CHECK_INTERVAL_MINUTES` (default 10) for `ROUTED` tasks whose lock expired while still unclaimed. It reroutes to the next-best candidate (excluding the one who just missed the window), resets the lock, and notifies both the new candidate and the task's managers.
- After `ROUTE_MAX_REROUTES` attempts (default 3) with no claim, the task opens to any registered contributor instead of continuing to cycle through candidates.
- The scheduler only excludes the *immediately previous* candidate, not everyone ever tried on that task — with a very small registered pool the same person could be re-suggested after a few rounds. `ROUTE_MAX_REROUTES` bounds how long that can drag on.
- No external cron needed: this bot is a single long-running process (see DEPLOY.md), so `setInterval` is sufficient.

## Submissions

Text and links go through `/submit <id> <content>` (links auto-convert via Jina Reader, see above). Two ways to submit a video, photo, or document:
1. Send the file to the bot with `/submit <id> [optional note]` as its **caption**.
2. Send `/submit <id>` alone first, then send the text/link/video/photo/document as your next message within 5 minutes (`src/bot/pendingActions.js` tracks this per user, in-memory — `/cancel` aborts it).

Either way, `src/bot/commands/submitMedia.js` (for files) or the pending-text dispatcher (for a bare follow-up message) picks it up. The Telegram `file_id` is stored directly as `submissionFileId` (already a stable, standardized reference — no conversion step needed, unlike URLs). Photos are tagged `SCREENSHOT`, video/documents are tagged `FILE`. The original message is also forwarded (via `copyMessage`) to that task's admins/room admins alongside the text notification, so reviewers see the actual file immediately instead of having to ask for it.

## AI pre-review

Every submission gets a best-effort AI pre-review (`src/ai/reviewSubmission.js`), sent as a follow-up message to that task's admins/room admins once ready and stored in `Task.aiReviewNote` (visible via `/status`). It's an aid for the human reviewer, not a decision — it never approves, rejects, or blocks anything, and a failed/slow AI call never breaks the submission itself (it runs after the submission is already recorded and notified, fire-and-forget).

Coverage by submission type:
- `TEXT` / `LINK` — Claude (Haiku) summarizes the content against the task's title/description/required output (`summarizeSubmission` in `src/ai/claude.js`). For links, it reviews the Jina-Reader-converted text, not the raw URL.
- `SCREENSHOT` — the image is downloaded from Telegram and sent to Claude's vision input (`reviewSubmissionImage`), which describes what it shows and whether it looks like it satisfies the task.
- `FILE`, PDF documents — downloaded and sent to Claude's document input (`reviewSubmissionDocument`); the document's mime type is stored in `submissionFileMetadata` when it's uploaded so this branch knows which files qualify.
- `FILE`, video or non-PDF documents — **not covered.** This is a real Claude API limitation (no video input; only PDF is supported for documents), not a shortcut — `/status` and reviewers won't see an AI note for these.

## AI-assisted task drafting

`/drafttask <short prompt>` sends the prompt to Claude (`draftTask` in `src/ai/claude.js`) and creates a `DRAFT` task from the structured result (title, description, required output, category, skill tags) — same status and same `/approve` gate as a manually-created task, it just skips typing out the pipe-delimited syntax. If Claude's response doesn't parse or is missing a title/description, it tells you to use `/newtask` instead rather than creating a broken task.

## Multi-admin / room permissions

Two problems come up once a group has more than one admin: two admins acting on the same task at once, and admins from unrelated rooms being able to touch each other's tasks.

- **Race safety.** `/approve`, `/route`, `/review`, `/amplify`, and `/complete` all use an atomic `updateMany` guarded on the task's current status (same pattern `/claim` already used against double-claims). If two admins act on the same task within the same instant, only one write succeeds — the other gets `"Task #X is already <status> - someone else may have just handled it"` instead of silently overwriting the first decision or sending the contributor contradictory notifications.
- **Room-scoped admins.** Every task created inside a group is tagged with that group's `Room` (`Task.roomId`). A `RoomAdmin` roster (separate from the global `ADMIN_TELEGRAM_IDS` superadmins) controls who can `/approve`/`/route`/`/review`/etc. tasks belonging to that room — see `src/bot/roomAuth.js`. Whoever adds the bot to a group automatically becomes that room's first admin; `/addroomadmin` (reply to a user's message — Telegram bots can't resolve `@username` to an ID any other way) adds more. Tasks created via DM (no room) are only manageable by global admins.
- **Room-aware notifications.** New-submission and new-signal-drafted-task alerts go to that task's room admins as well as global admins (`notifyTaskManagers` in `src/bot/notifyAdmins.js`) — a room admin who isn't in `ADMIN_TELEGRAM_IDS` still gets pinged for tasks they're allowed to act on. The bot-added-to-group notification stays global-only since a brand-new room has no other admins yet.

## Not done yet

Genuinely blocked on a decision or resource this repo can't provide on its own:

- **Real Twitter/X API scoring** — needs a paid API tier decision (which tier, whose account/budget). `computeTwitterScore` in `src/candidateEvaluation.js` is a ready-to-fill stub that returns `null` (unscored) rather than fabricating a score until that's chosen.
- **Non-Telegram signal sources** (Twitter, Discord, GitHub, news) — each needs its own credential/service decision (X API, a Discord bot token, a GitHub App, a news API). Only in-chat Telegram messages are watched today.
- **AI review of video and non-PDF document submissions** — a real Claude API limitation (no video input; only PDF is supported for documents), not something more engineering effort fixes today.

Smaller known limitations:

- The route scheduler only excludes the immediately-previous candidate when rerouting, not everyone ever tried on that task (see [Routing](#routing-lock--reroute-scheduler)).
- Two-step submission and the `/newtask` wizard use in-memory pending state (`src/bot/pendingActions.js`) — resets on restart/redeploy, and doesn't work across multiple bot instances (not an issue at the current single-instance scale, see DEPLOY.md).
- `/mytasks` and `/alltasks` are capped at the 20-30 most recently updated tasks with no pagination — fine at pilot scale, but older tasks will scroll out of view once volume grows.
- `/mytasks` has no status filter (unlike `/alltasks [status]`) — for a contributor with many tasks there's no way to narrow the list yet.
