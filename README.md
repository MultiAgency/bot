# MultiAgency Contributor Bot

Telegram bot that coordinates contributor tasks through three independent state machines:

```
Task:        Draft --approve--> Open --close--> Closed --reopen--> Open

Application:  Applied --assign--> Assigned        (admin, up to max_assignees)
                 |  ──decline──▶ Declined          (not selected; may re-apply)
                 |  ──withdraw─▶ Withdrawn
              Assigned ──unassign──▶ Applied       (admin, records a reason)
              Assigned ──work approved──▶ Completed (terminal; slot stays consumed)
              Assigned ──work rejected──▶ Rejected (terminal; slot freed)

Submission:  Submitted ──approve──▶ Approved       (each revision = a new version)
                       ──reject───▶ Rejected       (terminal — also closes the assignment)
                       ──revise───▶ Needs revision  → contributor submits a new version
```

A Task can have multiple contributors working on it in parallel (`max_assignees`); each contributor's candidacy is its own `Application`; each attempt they submit is its own versioned `Submission`. See [PROPOSAL_V2.md](PROPOSAL_V2.md) for the original architecture rationale (note: the workflow section there describes an earlier design — this README and `src/workflow.js` are the current source of truth), [DEPLOY.md](DEPLOY.md) for deployment steps, and [TESTING.md](TESTING.md) for a full manual test script.

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

Contributor: `/start` or `/help` (command guide), `/onboard` (fully button-driven wizard: role, desired income, skills — see [Candidate evaluation](#candidate-evaluation)), `/tasks` (open tasks), `/apply <id>`, `/withdraw <id>` (only while unassigned), `/mytasks` (your applications and their status), `/submit <id> [content or link]` (only while assigned), `/status <id>` (a task's applications/history), `/cancel`. To submit a video, photo, or file, either send it with `/submit <id>` as the caption, or send `/submit <id>` alone and then the file/text within 5 minutes (see [Submissions](#submissions)).

Admin (global admins in `ADMIN_TELEGRAM_IDS`, or room admins for tasks belonging to their room — see [Multi-admin / room permissions](#multi-admin--room-permissions)):
- `/newtask <title> | <description> | <reward> | <required output> | [category] | [skill1,skill2] | [max_assignees]`, or just `/newtask` for a step-by-step wizard
- `/drafttask <short prompt>` — Claude expands a short request into a full draft
- `/drafts` — list tasks awaiting approval (all of them for global admins, your rooms' for room admins)
- `/alltasks [status]` — list every task regardless of status (optionally filtered, e.g. `/alltasks OPEN`), same room-scoping as `/drafts`
- `/approve <id>` — Draft → Open, and nudges top-matched registered contributors to `/apply` (see [Matching](#matching-engine))
- `/close <id>` / `/reopen <id>` — Open ↔ Closed
- `/applicants <id>` — list a task's `Applied` applications ranked by match score
- `/assign <application_id>` — Applied → Assigned, blocked once `max_assignees` is reached
- `/decline <application_id> [note]` — Applied → Declined
- `/unassign <application_id> <reason>` — Assigned → Applied, frees the slot
- `/review <application_id> approve|reject|revise [note]` — decides that application's latest submission; approve/reject also close the application (Completed/Rejected)
- `/addroomadmin` / `/removeroomadmin` — reply to a user's message inside a group to grant/revoke room-admin status there
- `/roomadmins` — list a room's admins

## Data model

- **Task** — the work itself: title, description, reward, required output, `maxAssignees`, status (`DRAFT`/`OPEN`/`CLOSED`). `/newtask` creates one directly in `DRAFT`; tasks auto-drafted from chat signals are linked back to their `Signal` row via `Task.signalId`.
- **Contributor** — `jobRole` (`JobRole` enum), `desiredIncome` (string — one of a fixed set of button labels, see [Candidate evaluation](#candidate-evaluation)), `skillTags` (array), plus the trust/reputation fields set by `/onboard` and task completions.
- **Application** — one contributor's candidacy for one task (`src/workflow.js` `APPLICATION_STATUS`). A contributor can hold multiple `Application` rows against the same task over time (e.g. re-applying after being declined), but the command layer blocks a second *active* (`APPLIED`/`ASSIGNED`) one.
- **Submission** — one versioned attempt under an `Application` (`SUBMISSION_STATUS`). Resubmitting after `NEEDS_REVISION` creates a new row (`version` + 1) rather than overwriting — full revision history stays queryable.
- `TaskHistory` / `ApplicationHistory` / `SubmissionHistory` — one audit trail per entity, same shape (`fromStatus`, `toStatus`, `actorTelegramId`, optional `note`).

## Signal detection (auto-drafting tasks from chat)

The bot can passively watch group chats and auto-draft a task when a message looks like a real opportunity (`src/signalDetection.js` + `evaluateSignal` in `src/ai/claude.js`). It never auto-approves — auto-drafted tasks land in `DRAFT` exactly like `/newtask`, and an admin still has to `/approve` them.

**Disabled by default, opt-in per chat, no redeploy needed.** To enable it for a chat:
1. Message [@BotFather](https://t.me/BotFather) → `/setprivacy` → select your bot → **Disable**, once, for the bot account. With Privacy Mode **on** (the default), the bot only reliably receives: commands addressed to it, and replies to its own messages — **not** plain @mentions and not ordinary chat messages, even though mentions can look like they should get through. Disabling it lets the bot see every message in the group (existing group members must be aware of this).
2. **If the bot is already in the group, remove it and re-add it after disabling Privacy Mode.** Telegram only applies the new privacy setting when the bot (re-)joins a chat — toggling `/setprivacy` for a bot that's already a member does nothing until it's removed and re-invited. This is the most common reason "I disabled privacy mode but the bot still ignores messages/mentions" happens.
3. Add (or re-add) the bot to the group. It auto-detects the invite (`my_chat_member` update, handled in `src/bot/commands/signalChatAdmin.js`), creates a `Room` row for that chat, makes whoever added the bot a room admin, and DMs every global admin with the chat's name/ID and what to do next.
4. A room admin (or global admin) opens that group and runs `/enablesignals` there. This sets `Room.signalsEnabled = true` (`src/rooms.js`) — no env var, no redeploy. `/disablesignals` turns it back off (also happens automatically if the bot is removed from the group); `/signalstatus` checks the current chat's state.

Slash commands work in a group regardless of Privacy Mode — that part never needed this. What *does* need it: signal detection (above) and the @mention acknowledgment (`src/bot/commands/mentionReply.js`) — replies "Hey, I'm here! Use /help..." whenever the bot is @mentioned with a non-command message, so tagging the bot never looks like it's being ignored. Both require Privacy Mode disabled *and* the remove/re-add step to actually receive the message in the first place.

Pipeline per message: a cheap length/word-count pre-filter runs first (no API cost), then a per-room rate limit (`SIGNAL_MAX_PER_HOUR`, default 20/hour — backed by a DB count of that room's `Signal` rows in the last hour, so it survives restarts/redeploys), then Claude (Haiku) scores it 0–10 and drafts a title/description/category/skills if it clears `SIGNAL_SCORE_THRESHOLD` (default 6). Every evaluated message is stored as a `Signal` row regardless of outcome (`status: DRAFTED` or `DISCARDED`), so discarded signals stay auditable. Use `/drafts` to review everything currently sitting in `DRAFT`, whether auto-drafted or created manually.

**Decided, not just deferred: Telegram is the only signal source for now.** Twitter, Discord, GitHub, and news would each need their own credential/service decision (a Discord bot token, a GitHub App, a news API). Revisit if/when there's a concrete need.

## Candidate evaluation

`/onboard` runs a short wizard (`src/bot/commands/onboard.js`, state tracked via `src/bot/pendingActions.js`) that is **entirely button-driven, no free text**:
1. **Role** — inline keyboard, single choice: Developer / Designer / Writer / Marketing / Community / Research / Video / Other. Stored as `Contributor.jobRole` (`JobRole` enum).
2. **Desired income/rate** — inline keyboard, single choice from fixed buckets (`< $100/mo` through `$3000+/mo`, plus `Per-task / negotiable`). Stored as `Contributor.desiredIncome` (the button's label text).
3. **Skills** — inline keyboard, multi-select: tap to toggle (✅ marks selected), tap **Done** to finish. The options shown depend on the chosen role (e.g. Developer sees Solidity/Rust/JS-TS/..., Designer sees UI Design/UX Design/...; see `SKILLS_BY_ROLE` in `onboard.js`). Stored in the existing `Contributor.skillTags`, which is what `src/matching.js` already scores tasks against.

**Why no free text:** in a group, a plain text message only reaches the bot if Privacy Mode is disabled *and* the bot was removed/re-added after that (see [Signal detection](#signal-detection-auto-drafting-tasks-from-chat)) — a button press (callback query) reaches the bot regardless of that setting. An earlier text-based version of this wizard would silently never receive the contributor's answer in a group that hadn't done that setup; the button-only version works everywhere out of the box.

On finishing, it marks the contributor `isRegistered` and computes:
- `telegramScore` — real signal from profile completeness + in-system track record (`src/candidateEvaluation.js`)
- `socialTrustScore` / `eligibilityTier` — derived from `telegramScore`

Only registered contributors can `/apply` to tasks.

**Twitter/X handle collection was removed from onboarding** (previously `/onboard <twitter_handle>`) in favor of the role/income/skills flow above. The cookie-based scoring infrastructure (`src/twitterClient.js`, `computeTwitterScore` in `src/candidateEvaluation.js`, `TWITTER_COOKIES` env var) is still there and still functional — `computeTwitterScore` just returns `null` immediately since `Contributor.twitterHandle` is never set by the current flow, which `computeSocialTrustScore` already treats as "unscored" rather than "zero trust." It's dead code from the product's perspective right now, kept in case Twitter-based evaluation is wired back in later (e.g. as a separate opt-in command) rather than deleted outright.

## Matching engine

`src/matching.js` computes a composite match score per PROPOSAL_V2.md's weighting (skill fit, reputation, past performance, social trust, availability, preference); `src/routing.js` wraps it with the real DB queries. Availability is the count of a contributor's currently `ASSIGNED` applications, not a task-level lock — since applying is non-exclusive (anyone can apply to an `OPEN` task, admin picks who to `/assign`), there's no more "reserved for one candidate" concept. Two ways it's used:

- **On `/approve`** — ranks the whole registered pool and DMs the top 5 matches, nudging them to `/apply`. Purely a suggestion; anyone can still apply regardless.
- **On `/applicants <task_id>`** — ranks that task's actual `Applied` applications by match score, to help an admin decide who to `/assign` (respecting `max_assignees`).

## Submissions

Text and links go through `/submit <id> <content>` (links auto-convert via Jina Reader, see above) — only works if you have an `ASSIGNED` application for that task. Two ways to submit a video, photo, or document:
1. Send the file to the bot with `/submit <id> [optional note]` as its **caption**.
2. Send `/submit <id>` alone first, then send the text/link/video/photo/document as your next message within 5 minutes (`src/bot/pendingActions.js` tracks this per user, in-memory — `/cancel` aborts it).

Either way, `src/bot/commands/submitMedia.js` (for files) or the pending-text dispatcher (for a bare follow-up message) picks it up, creating a new `Submission` row (versioned — resubmitting after `NEEDS_REVISION` doesn't overwrite the previous attempt). The Telegram `file_id` is stored directly as `submissionFileId` (already a stable, standardized reference — no conversion step needed, unlike URLs). Photos are tagged `SCREENSHOT`, video/documents are tagged `FILE`. The original message is also forwarded (via `copyMessage`) to that task's admins/room admins alongside the text notification, so reviewers see the actual file immediately instead of having to ask for it.

## AI pre-review

Every submission gets a best-effort AI pre-review (`src/ai/reviewSubmission.js`), sent as a follow-up message to that task's admins/room admins once ready and stored in `Submission.aiReviewNote` (visible via `/status`). It's an aid for the human reviewer, not a decision — it never approves, rejects, or blocks anything, and a failed/slow AI call never breaks the submission itself (it runs after the submission is already recorded and notified, fire-and-forget).

Coverage by submission type:
- `TEXT` / `LINK` — Claude (Haiku) summarizes the content against the task's title/description/required output (`summarizeSubmission` in `src/ai/claude.js`). For links, it reviews the Jina-Reader-converted text, not the raw URL.
- `SCREENSHOT` — the image is downloaded from Telegram and sent to Claude's vision input (`reviewSubmissionImage`), which describes what it shows and whether it looks like it satisfies the task.
- `FILE`, PDF documents — downloaded and sent to Claude's document input (`reviewSubmissionDocument`).
- `FILE`, `.docx`/`.txt`/`.md`/`.csv` documents — text is extracted **locally** (via `mammoth` for `.docx`, plain decode for the rest — no API cost, no external service) and reviewed the same way as a text submission.
- `FILE`, video or other document types (legacy `.doc`, `.xlsx`, etc.) — **not covered.** Video is a real Claude API limitation (no video input at all); the remaining document types just aren't parsed yet and could be added the same way `.docx` was, with the right library.

The document's mime type is captured in `submissionFileMetadata` at upload time (`src/bot/commands/submitMedia.js`) so `reviewSubmission.js` knows which branch to use.

## AI-assisted task drafting

`/drafttask <short prompt>` sends the prompt to Claude (`draftTask` in `src/ai/claude.js`) and creates a `DRAFT` task from the structured result (title, description, required output, category, skill tags) — same status and same `/approve` gate as a manually-created task, it just skips typing out the pipe-delimited syntax. If Claude's response doesn't parse or is missing a title/description, it tells you to use `/newtask` instead rather than creating a broken task.

## Multi-admin / room permissions

Two problems come up once a group has more than one admin: two admins acting on the same task/application/submission at once, and admins from unrelated rooms being able to touch each other's tasks.

- **Race safety.** `/approve`, `/close`, `/reopen`, `/assign`, `/decline`, `/unassign`, and `/review` all use an atomic `updateMany` guarded on the current status. If two admins act on the same thing within the same instant, only one write succeeds — the other gets a clear "already handled" message instead of silently overwriting the first decision or sending the contributor contradictory notifications.
- **Room-scoped admins.** Every task created inside a group is tagged with that group's `Room` (`Task.roomId`); commands that act on an `Application` resolve permission via its parent task. A `RoomAdmin` roster (separate from the global `ADMIN_TELEGRAM_IDS` superadmins) controls who can act on tasks belonging to that room — see `src/bot/roomAuth.js`. Whoever adds the bot to a group automatically becomes that room's first admin; `/addroomadmin` (reply to a user's message — Telegram bots can't resolve `@username` to an ID any other way) adds more. Tasks created via DM (no room) are only manageable by global admins.
- **Room-aware notifications.** New-application, new-submission, and new-signal-drafted-task alerts go to that task's room admins as well as global admins (`notifyTaskManagers` in `src/bot/notifyAdmins.js`) — a room admin who isn't in `ADMIN_TELEGRAM_IDS` still gets pinged for tasks they're allowed to act on. The bot-added-to-group notification stays global-only since a brand-new room has no other admins yet.

## Not done yet

Genuinely blocked on a decision or resource this repo can't provide on its own:

- **AI review of video submissions** — a real Claude API limitation, Claude has no video input at all. (Document coverage was extended at no extra cost — video is the one that's actually stuck.)
- **Non-Telegram signal sources** (Discord, GitHub, news) — each needs its own credential/service decision. Decided to stay Telegram-only for now, see [Signal detection](#signal-detection-auto-drafting-tasks-from-chat).

Smaller known limitations:

- No hard lock on applying/routing — since `/apply` is non-exclusive by design (anyone can apply, admin picks who to `/assign`), there's no more "reserved for one candidate, times out, rerouts" mechanism the earlier design had. If that turns out to be needed (e.g. to stop a flood of low-quality applicants), it would have to be re-added as an opt-in restriction on top of `/apply`, not a revival of the old task-level lock.
- Two-step submission and the `/newtask` wizard use in-memory pending state (`src/bot/pendingActions.js`) — resets on restart/redeploy, and doesn't work across multiple bot instances (not an issue at the current single-instance scale, see DEPLOY.md).
- AI review still doesn't cover every document type (legacy `.doc`, `.xlsx`, etc.) — only PDF (via Claude) and `.docx`/`.txt`/`.md`/`.csv` (via local extraction) are wired up.
- `/mytasks`, `/alltasks`, and `/applicants` are capped at their most recent results with no pagination — fine at pilot scale, but older items will scroll out of view once volume grows.
- Twitter cookie-based scoring code (`src/twitterClient.js`) is currently unreachable from any command — `/onboard` no longer collects a Twitter handle (see [Candidate evaluation](#candidate-evaluation)). Kept in place rather than deleted in case it's wired back in later.
- `/mytasks` has no status filter (unlike `/alltasks [status]`) — for a contributor with many applications there's no way to narrow the list yet.
- The applicant-ranking formula's "availability" signal only tracks `ASSIGNED` application count, not deadline pressure or contributor-declared capacity.
