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

Contributor: `/start`, `/register <twitter_handle>`, `/tasks`, `/claim <id>`, `/submit <id> <content|link>`, `/status <id>`

Admin (global admins in `ADMIN_TELEGRAM_IDS`, or room admins for tasks belonging to their room — see [Multi-admin / room permissions](#multi-admin--room-permissions)):
- `/newtask <title> | <description> | <reward> | <required output> | [category] | [skill1,skill2]`
- `/approve <id>` — Draft → Approved
- `/route <id>` — Approved → Routed, ranks registered contributors via the matching engine and suggests the top match
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

Pipeline per message: a cheap length/word-count pre-filter runs first (no API cost), then a per-chat rate limit (`SIGNAL_MAX_PER_HOUR`, default 20/hour, in-memory — resets on restart), then Claude (Haiku) scores it 0–10 and drafts a title/description/category/skills if it clears `SIGNAL_SCORE_THRESHOLD` (default 6). Every evaluated message is stored as a `Signal` row regardless of outcome (`status: DRAFTED` or `DISCARDED`), so discarded signals stay auditable.

## Candidate evaluation

`/register <twitter_handle>` marks a contributor `isRegistered` and computes:
- `telegramScore` — real signal from profile completeness + in-system track record (`src/candidateEvaluation.js`)
- `twitterScore` — stubbed until `TWITTER_BEARER_TOKEN` is configured (returns `null`, not fabricated)
- `socialTrustScore` / `eligibilityTier` — derived from the above

Only registered contributors can `/claim` tasks.

## Matching engine

`src/matching.js` computes a composite match score per PROPOSAL_V2.md's weighting (skill fit, reputation, past performance, social trust, availability, preference) and ranks registered candidates for a task. `/route` uses it to suggest a contributor, but routing is a **suggestion, not a lock** in this version — any registered contributor can still `/claim` a routed task. Hard-locking + reroute-on-timeout would need a background scheduler and is deferred to a later stage.

## Multi-admin / room permissions

Two problems come up once a group has more than one admin: two admins acting on the same task at once, and admins from unrelated rooms being able to touch each other's tasks.

- **Race safety.** `/approve`, `/route`, `/review`, `/amplify`, and `/complete` all use an atomic `updateMany` guarded on the task's current status (same pattern `/claim` already used against double-claims). If two admins act on the same task within the same instant, only one write succeeds — the other gets `"Task #X is already <status> - someone else may have just handled it"` instead of silently overwriting the first decision or sending the contributor contradictory notifications.
- **Room-scoped admins.** Every task created inside a group is tagged with that group's `Room` (`Task.roomId`). A `RoomAdmin` roster (separate from the global `ADMIN_TELEGRAM_IDS` superadmins) controls who can `/approve`/`/route`/`/review`/etc. tasks belonging to that room — see `src/bot/roomAuth.js`. Whoever adds the bot to a group automatically becomes that room's first admin; `/addroomadmin` (reply to a user's message — Telegram bots can't resolve `@username` to an ID any other way) adds more. Tasks created via DM (no room) are only manageable by global admins.

## Not done yet

- File/screenshot submissions (currently `/submit` only accepts text/link; links are auto-converted via Jina Reader)
- Multi-step wizard for `/newtask` (currently a single-line, `|`-delimited syntax)
- Wiring `suggestTaskDescription` / `summarizeSubmission` (`src/ai/claude.js`) into the task-creation / review flow
- Real Twitter/X API scoring (needs a paid API tier decision — see `computeTwitterScore` in `src/candidateEvaluation.js`)
- Hard routing locks / reroute-on-timeout (needs a scheduler)
- Signal rate-limit counters are in-memory only (reset on restart/redeploy, not shared across instances)
- Non-Telegram signal sources (Twitter, Discord, GitHub, news) — only in-chat messages are watched today
- `/newtask`, `/drafts`-style listing of pending drafts across rooms doesn't exist yet — admins currently rely on the ID from the creation/notification message
