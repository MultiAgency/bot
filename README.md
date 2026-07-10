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

Admin (must be listed in `ADMIN_TELEGRAM_IDS`):
- `/newtask <title> | <description> | <reward> | <required output> | [category] | [skill1,skill2]`
- `/approve <id>` — Draft → Approved
- `/route <id>` — Approved → Routed, ranks registered contributors via the matching engine and suggests the top match
- `/review <id> approve|reject|revise [note]` — Submitted → Reviewed/Rejected/Revision-Requested
- `/amplify <id> [note]` — Reviewed → Amplified
- `/complete <id>` — Reviewed/Amplified → Completed, updates contributor stats

## Task status

```
SIGNAL → DRAFT → APPROVED → ROUTED → CLAIMED → SUBMITTED → REVIEWED → AMPLIFIED → COMPLETED
```

`SUBMITTED` also branches to `REJECTED` or `REVISION_REQUESTED` (loops back to `SUBMITTED` after resubmission). `REVIEWED` can go straight to `COMPLETED` if amplification isn't needed. Transition logic lives in `src/workflow.js`. `/newtask` creates a task directly in `DRAFT`; tasks auto-drafted from chat signals (see below) are linked back to their `Signal` record via `Task.signalId`.

## Signal detection (auto-drafting tasks from chat)

The bot can passively watch group chats and auto-draft a task when a message looks like a real opportunity (`src/signalDetection.js` + `evaluateSignal` in `src/ai/claude.js`). It never auto-approves — auto-drafted tasks land in `DRAFT` exactly like `/newtask`, and an admin still has to `/approve` them.

**Disabled by default, opt-in per chat, no redeploy needed.** To enable it for a chat:
1. Message [@BotFather](https://t.me/BotFather) → `/setprivacy` → select your bot → **Disable**, once, for the bot account. By default Telegram only delivers commands/mentions to bots in groups; disabling privacy mode lets it see all messages (existing group members must be aware of this).
2. Add the bot to the group. It auto-detects the invite (`my_chat_member` update, handled in `src/bot/commands/signalChatAdmin.js`) and DMs every admin in `ADMIN_TELEGRAM_IDS` with the chat's name/ID and what to do next.
3. An admin opens that group and runs `/enablesignals` there. This upserts a row in the `MonitoredChat` table (`src/monitoredChats.js`) — no env var, no redeploy. `/disablesignals` turns it back off (also happens automatically if the bot is removed from the group); `/signalstatus` checks the current chat's state.

Pipeline per message: a cheap length/word-count pre-filter runs first (no API cost), then a per-chat rate limit (`SIGNAL_MAX_PER_HOUR`, default 20/hour, in-memory — resets on restart), then Claude (Haiku) scores it 0–10 and drafts a title/description/category/skills if it clears `SIGNAL_SCORE_THRESHOLD` (default 6). Every evaluated message is stored as a `Signal` row regardless of outcome (`status: DRAFTED` or `DISCARDED`), so discarded signals stay auditable.

## Candidate evaluation

`/register <twitter_handle>` marks a contributor `isRegistered` and computes:
- `telegramScore` — real signal from profile completeness + in-system track record (`src/candidateEvaluation.js`)
- `twitterScore` — stubbed until `TWITTER_BEARER_TOKEN` is configured (returns `null`, not fabricated)
- `socialTrustScore` / `eligibilityTier` — derived from the above

Only registered contributors can `/claim` tasks.

## Matching engine

`src/matching.js` computes a composite match score per PROPOSAL_V2.md's weighting (skill fit, reputation, past performance, social trust, availability, preference) and ranks registered candidates for a task. `/route` uses it to suggest a contributor, but routing is a **suggestion, not a lock** in this version — any registered contributor can still `/claim` a routed task. Hard-locking + reroute-on-timeout would need a background scheduler and is deferred to a later stage.

## Not done yet

- File/screenshot submissions (currently `/submit` only accepts text/link; links are auto-converted via Jina Reader)
- Multi-step wizard for `/newtask` (currently a single-line, `|`-delimited syntax)
- Wiring `suggestTaskDescription` / `summarizeSubmission` (`src/ai/claude.js`) into the task-creation / review flow
- Real Twitter/X API scoring (needs a paid API tier decision — see `computeTwitterScore` in `src/candidateEvaluation.js`)
- Hard routing locks / reroute-on-timeout (needs a scheduler)
- Signal rate-limit counters are in-memory only (reset on restart/redeploy, not shared across instances)
- Non-Telegram signal sources (Twitter, Discord, GitHub, news) — only in-chat messages are watched today
- `/enablesignals` trusts anyone in `ADMIN_TELEGRAM_IDS`, even if they aren't a member/admin of that specific group
