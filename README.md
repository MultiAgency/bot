# MultiAgency Contributor Bot (MVP skeleton)

Telegram bot that coordinates contributor tasks: create → approve → open → claim → submit → review → complete.

## Stack

Telegraf + Prisma (Postgres) + Claude API. LangGraph is scaffolded as the orchestration layer for multi-node AI steps in a later phase (see `src/ai/graphs/candidateScoring.js`); the current MVP calls the Claude API directly for simple suggestions.

## Setup

```bash
cp .env.example .env   # fill in BOT_TOKEN, DATABASE_URL (Neon), ANTHROPIC_API_KEY, ADMIN_TELEGRAM_IDS
npm install
npx prisma migrate dev --name init   # create tables on Postgres
npm run dev
```

## Bot commands

Contributor: `/start`, `/tasks`, `/claim <id>`, `/submit <id> <content|link>`, `/status <id>`

Admin (must be listed in `ADMIN_TELEGRAM_IDS`): `/newtask <title> | <description> | <reward> | <required output>`, `/approve <id>`, `/review <id> approve|reject|revise [note]`

## Task status

`DRAFT → APPROVED → OPEN → CLAIMED → SUBMITTED → REVIEWED → COMPLETED`, with two branches off `SUBMITTED`: `REJECTED` and `REVISION_REQUESTED` (loops back to `SUBMITTED` after resubmission). Transition logic lives in `src/workflow.js`.

## Not done yet (outside this skeleton's scope)

- File/screenshot submissions (currently `/submit` only accepts text/link)
- Multi-step wizard for `/newtask` (currently a single-line, `|`-delimited syntax)
- Wiring `suggestTaskDescription` / `summarizeSubmission` (`src/ai/claude.js`) into the task-creation / review flow
