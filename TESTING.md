# Testing Guide

Manual end-to-end test script for the bot. There's no automated test suite yet (see [Not done yet](README.md#not-done-yet)) — this is what to run by hand after any change to the workflow, before trusting a deploy.

## Prerequisites

- The bot running somewhere reachable by Telegram: either `npm run dev` locally with a real `BOT_TOKEN`, or the deployed Railway instance (see [DEPLOY.md](DEPLOY.md)).
- **Two** Telegram accounts: one in `ADMIN_TELEGRAM_IDS` (the admin), one that isn't (the contributor). Testing with only one account works for most of this, but you won't be able to see cross-account notifications (DMs the bot sends to "the other person") actually arrive.
- A test group with the bot added, Privacy Mode disabled, **and the bot removed + re-added after disabling it** — see README.md "Signal detection" for why that step is non-optional.
- Optional but very useful: `npm run prisma:studio` open in a browser tab so you can watch `Task` / `Application` / `Submission` rows change in real time as you run commands.

## 1. Basic connectivity

| Step | Expect |
| --- | --- |
| DM the bot `/start` | Welcome message; contributor row created (check Prisma Studio) |
| DM the bot `/help` | Same guide, callable any time |
| In the test group, `@yourbotname hello` (not a command) | Bot replies "Hey, I'm here!..." within a couple seconds |
| In the test group, post an unrelated normal sentence | No reply (that's correct — only a mention or a signal-worthy message should get a response) |

## 2. Task creation

As the **admin** account:

```
/newtask Write a launch thread | Summarize the v2 release in 5 tweets | thread link | content | writing,twitter | 2
/newtask
```
The second form (no args) should start the step-by-step wizard — answer each prompt, try `skip` on an optional field, confirm it still creates the task.

```
/drafttask We need someone to record a 2-minute product demo video
```
Should produce a structured draft (title/description/required output) without you typing the pipe syntax.

```
/drafts
```
All three tasks should appear, still in `DRAFT`.

## 3. Approve → candidate nudge

```
/approve <id>
```
Expect: task flips to `OPEN`; reply confirms `(max N assignees)`. If any contributor has already completed `/onboard`, they should get a DM suggesting the task (best done with the contributor account already onboarded from a previous run — see step 4 first, then come back and approve a second task to see the nudge fire).

```
/tasks
```
Should list the task as `0/N assigned`.

## 4. Onboard + apply

As the **contributor** account:

```
/onboard
```
Entirely button-driven — no typing required:
1. Tap a role (Developer/Designer/Writer/Marketing/Community/Research/Video/Other).
2. Tap an income bucket.
3. Tap one or more skills (they show a `✅` when selected, tap again to deselect), then tap **Done**. The skill options shown should match the role you picked in step 1.

Expect a final reply with your role, income, skills, `telegramScore`, and a trust tier. Repeat this in the **test group** too, not just DM — since it's all callback queries (button presses), it should work identically there even without Privacy Mode disabled, unlike an earlier free-text version of this wizard which would silently not receive typed answers in a group.

```
/apply <id>
```
Expect: confirmation with an `application #N`. The admin should get a DM/notification about the new applicant.

Try applying again to the same task — should be rejected ("already have an active application").

## 5. Applicants → assign

As the **admin**:

```
/applicants <id>
```
Should list the application, ranked with a match score.

```
/assign <application_id>
```
Expect: confirmation `(1/N assigned)`; contributor gets a DM telling them they're assigned and can `/submit`.

If `max_assignees` is 1, try applying with a second contributor account and assigning them too — the second `/assign` should be rejected once the cap is hit. (If you only have one test account, you can still verify the rejection message logic by reading `src/bot/commands/assign.js`.)

## 6. Submit

As the **assigned contributor**:

```
/submit <id> https://example.com
```
Expect: confirmation, and shortly after, a separate "AI pre-review" DM to the admin (Claude summarizing the linked content via Jina Reader).

Two-step form:
```
/submit <id>
```
then, within 5 minutes, send a photo/video/document (with or without a caption). Expect the same confirmation, plus the admin receiving both the notification text *and* the forwarded file itself.

Check `/status <id>` — should show the application with `latest submission v1: SUBMITTED` (or `v2` if you submitted twice).

## 7. Review — all three branches

As the **admin**, using the `application_id` from step 5 (create fresh applications via steps 4–6 if you want to test more than one branch — each application can only be reviewed through one branch since two are terminal):

```
/review <application_id> approve
```
Expect: submission → `APPROVED`, application → `COMPLETED`, contributor's `completedTaskCount` increments (check Prisma Studio), contributor gets a DM.

On a **different** application (repeat steps 4–6 to get a fresh one):
```
/review <application_id> reject Not aligned with the brief
```
Expect: submission → `REJECTED`, application → `REJECTED` (slot freed), contributor's `rejectedSubmissionCount` increments, contributor gets the reason.

On a **third** application:
```
/review <application_id> revise Please add a source link
```
Expect: submission → `NEEDS_REVISION`, application stays `ASSIGNED`. As the contributor, `/submit <id> <new content>` again — `/status <id>` should now show `v2`, not an overwritten `v1`.

## 8. Decline / withdraw / unassign

- Fresh application, admin runs `/decline <application_id> some note` → applicant notified, `/apply <id>` again should succeed (a new application row, not a reused one).
- Fresh application (still `Applied`, not assigned), contributor runs `/withdraw <id>` → application → `WITHDRAWN`.
- An `Assigned` application, admin runs `/unassign <application_id> found someone better suited` → application → `APPLIED` again (back in the pool, not deleted), contributor notified with the reason. Confirm `/applicants <id>` shows them again.

## 9. Close / reopen

```
/close <id>
/reopen <id>
```
Task should flip `OPEN → CLOSED → OPEN`. Try `/apply` while `CLOSED` — should be rejected.

## 10. Multi-admin / room permissions

- From a second Telegram group, add the bot fresh — confirm the inviter automatically becomes that room's admin (check the DM confirming the invite).
- In that group, reply to another member's message with `/addroomadmin` → confirm they can now run `/newtask` etc. **in that group**, but get denied if they try to `/approve` a task that belongs to your *first* test group (cross-room isolation).
- `/roomadmins` in each group should list only that room's admins.

## 11. Race safety (optional, harder to test manually)

With two admin accounts, try running `/assign <same application_id>` from both at nearly the same time. Only one should succeed; the other should get "already handled" instead of a silent double-write. (Easiest to actually trigger this by scripting two near-simultaneous API calls rather than manual typing — mentioned here for completeness, not required for a routine smoke test.)

## 12. AI mode

- As a room admin, run `/ai` alone → confirms current state (OFF by default), then `/ai on`.
- Send a plain message (no slash) like "what tasks are open?" → agent should call `list_open_tasks` and reply with a short summary, not a raw dump.
- As an admin, describe a task in natural language ("create a task: write a tweet thread about X, reward 20 USDT") → agent should post the same Approve/Reject/Edit card `/newtask` posts. Tap Approve and confirm it behaves identically to the classic flow.
- As a non-admin, ask the agent to create a task → should be told no (same permission check as `/newtask`), not silently ignored.
- Try typing `/newtask ...` directly while AI mode is on → should NOT create a task (the classic command is intercepted); only `/ai off` should still work as a bare command.
- `/ai off` → confirm `/newtask` etc. work normally again immediately after.
- Tap an existing Approve/Apply/Edit button while AI mode is on → should still work (buttons are a different update type, never intercepted).

## Quick reference: full happy-path in one block

For a fast smoke test after a deploy, this is the shortest path that touches every entity:

```
/newtask Test task | Say hello | 5 USDT | a reply | content | writing | 1
/approve <id>
/onboard                      (contributor account - tap role, income, skills, then Done)
/apply <id>                   (contributor account)
/applicants <id>
/assign <application_id>
/submit <id> https://example.com   (contributor account)
/review <application_id> approve
/status <id>
```
