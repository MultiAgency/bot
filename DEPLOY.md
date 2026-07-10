# Deployment Guide

Stack: **Telegraf (long polling) + Prisma + Postgres on Neon + Railway**. No public HTTP endpoint is required — the bot runs as a background worker process using long polling, which is simpler to deploy than webhooks for this scale.

## 1. Prerequisites

- A GitHub account with access to this repo ([github.com/MultiAgency/bot](https://github.com/MultiAgency/bot))
- A [Neon](https://neon.tech) account (free tier)
- A [Railway](https://railway.com) account
- A Telegram account
- An [Anthropic](https://console.anthropic.com) API key

## 2. Create the Telegram bot

1. Open Telegram, message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`, follow the prompts (choose a name and a `_bot`-suffixed username)
3. BotFather replies with a token like `123456789:AAExampleTokenValue` — save it, this is `BOT_TOKEN`
4. Send `/start` to your new bot from your own Telegram account, then get your numeric Telegram user ID (e.g. via [@userinfobot](https://t.me/userinfobot)) — this becomes your `ADMIN_TELEGRAM_IDS` value
5. **Only if you want auto-drafted tasks from group chat (signal detection), or the bot to acknowledge @mentions:** send BotFather `/setprivacy`, select your bot, choose **Disable**. This lets the bot see every message in groups it's added to, not just commands — make sure group members are aware before enabling. Skip this step if you only plan to use explicit commands. (Enabling signal detection per group is done later, at runtime, via `/enablesignals` — no extra env var or redeploy needed.)
6. **If the bot is already in the target group, remove it and re-add it after step 5.** Telegram only applies a new Privacy Mode setting when the bot (re-)joins a chat — this is the #1 cause of "I disabled privacy mode but nothing changed." Do this once per group where you need it.

## 3. Create the database (Neon)

1. Create a new Neon project (any region close to where Railway will run)
2. Copy the connection string from the Neon dashboard — it looks like:
   ```
   postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require
   ```
3. Save it as `DATABASE_URL`

## 4. Get an Anthropic API key

1. Create a key at [console.anthropic.com](https://console.anthropic.com)
2. Save it as `ANTHROPIC_API_KEY`

## 5. Deploy on Railway

1. In Railway, click **New Project → Deploy from GitHub repo**, select `MultiAgency/bot`
2. Railway auto-detects Node.js and runs `npm install` (which also runs `prisma generate` via `postinstall`) then `npm start`
3. Open the service's **Variables** tab and add:

   | Variable | Value |
   | --- | --- |
   | `BOT_TOKEN` | from step 2 |
   | `ADMIN_TELEGRAM_IDS` | your Telegram user ID (comma-separated if more than one) |
   | `DATABASE_URL` | from step 3 |
   | `ANTHROPIC_API_KEY` | from step 4 |
   | `JINA_API_KEY` | optional, leave blank to use the free keyless tier |
   | `TWITTER_COOKIES` | optional, leave blank to keep `twitterScore` unscored. If set, use a **dedicated/throwaway X account** — see README.md "Candidate evaluation" for why (ToS/ban risk) |
   | `SIGNAL_SCORE_THRESHOLD` | optional, defaults to `6` |
   | `SIGNAL_MAX_PER_HOUR` | optional, defaults to `20` |

4. Trigger a deploy (Railway redeploys automatically after variables are saved). On startup, `npm start` runs `prisma migrate deploy` against `DATABASE_URL` before launching the bot — tables are created automatically on first deploy.
5. Check **Deployments → View Logs**; you should see `Bot is running (long polling).`

## 6. Verify

1. Message your bot `/start` on Telegram — you should get the welcome message with the admin command list (since your ID is in `ADMIN_TELEGRAM_IDS`)
2. Run the full loop once to confirm the deployment works end to end:
   ```
   /newtask Test task | Say hello | 5 USDT | a reply | content | writing
   /approve <id>
   /register <your_twitter_handle>   (from a second account, or reuse yours)
   /apply <id>
   /applicants <id>                  (note the application_id it prints)
   /assign <application_id>
   /submit <id> https://example.com
   /review <application_id> approve
   ```
3. To test signal detection and room admins: add the bot to a Telegram group. You (as a global admin) should get a DM confirming the invite was detected, and whoever added the bot becomes that room's first admin automatically. Open the group and run `/enablesignals`, then post a few sentences describing a real task-shaped request and watch for a "New signal..." DM once it clears the score threshold. Try `/addroomadmin` as a reply to another member's message to grant them room-scoped admin access without adding them to `ADMIN_TELEGRAM_IDS`.
4. See [TESTING.md](TESTING.md) for a fuller manual test script covering every command, decline/withdraw/unassign, revision cycles, and cross-room permission isolation — worth running after any change to the workflow, not just on first deploy.

## Notes

- **No public URL needed.** Long polling means Railway doesn't need to expose a port for this service — it's fine to leave it as an internal/private service.
- **Single instance only.** Telegram's long-polling API rejects concurrent `getUpdates` calls from more than one process with the same token — do not scale this service beyond 1 replica, and stop any local `npm run dev` instance before checking the deployed logs (both can't poll at once). This also matters for `src/bot/pendingActions.js` (two-step submission / `/newtask` wizard state), which runs in-process and assumes exactly one instance.
- **Migrations run on every deploy.** `prisma migrate deploy` is idempotent (only applies pending migrations), so redeploys are safe. If you change `prisma/schema.prisma` locally, run `npm run prisma:migrate` locally first to generate the migration file, commit it, then push — Railway applies it on the next deploy.
- **Rotate `BOT_TOKEN`** via @BotFather (`/revoke`) if it's ever exposed; update the Railway variable and redeploy.
- **Switching to webhooks later:** if you outgrow long polling (e.g. need multiple regions or lower latency), swap `bot.launch()` in `src/index.js` for `bot.launch({ webhook: { domain, port } })` and expose a port on Railway — not needed at this scale.
