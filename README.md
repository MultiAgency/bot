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

`SUBMITTED` also branches to `REJECTED` or `REVISION_REQUESTED` (loops back to `SUBMITTED` after resubmission). `REVIEWED` can go straight to `COMPLETED` if amplification isn't needed. Transition logic lives in `src/workflow.js`. `SIGNAL` exists in the schema for a future automated signal collector (Stage 2); `/newtask` currently creates a task directly in `DRAFT`.

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
- Automated signal collection (`Signal` model exists but nothing populates it yet)
- Hard routing locks / reroute-on-timeout (needs a scheduler)
