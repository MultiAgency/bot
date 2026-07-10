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
   | `TWITTER_BEARER_TOKEN` | optional, leave blank (Twitter scoring stays stubbed) |

4. Trigger a deploy (Railway redeploys automatically after variables are saved). On startup, `npm start` runs `prisma migrate deploy` against `DATABASE_URL` before launching the bot — tables are created automatically on first deploy.
5. Check **Deployments → View Logs**; you should see `Bot is running (long polling).`

## 6. Verify

1. Message your bot `/start` on Telegram — you should get the welcome message with the admin command list (since your ID is in `ADMIN_TELEGRAM_IDS`)
2. Run the full loop once to confirm the deployment works end to end:
   ```
   /newtask Test task | Say hello | 5 USDT | a reply | content | writing
   /approve <id>
   /route <id>
   /register <your_twitter_handle>   (from a second account, or reuse yours)
   /claim <id>
   /submit <id> https://example.com
   /review <id> approve
   /complete <id>
   ```

## Notes

- **No public URL needed.** Long polling means Railway doesn't need to expose a port for this service — it's fine to leave it as an internal/private service.
- **Single instance only.** Telegram's long-polling API rejects concurrent `getUpdates` calls from more than one process with the same token — do not scale this service beyond 1 replica, and stop any local `npm run dev` instance before checking the deployed logs (both can't poll at once).
- **Migrations run on every deploy.** `prisma migrate deploy` is idempotent (only applies pending migrations), so redeploys are safe. If you change `prisma/schema.prisma` locally, run `npm run prisma:migrate` locally first to generate the migration file, commit it, then push — Railway applies it on the next deploy.
- **Rotate `BOT_TOKEN`** via @BotFather (`/revoke`) if it's ever exposed; update the Railway variable and redeploy.
- **Switching to webhooks later:** if you outgrow long polling (e.g. need multiple regions or lower latency), swap `bot.launch()` in `src/index.js` for `bot.launch({ webhook: { domain, port } })` and expose a port on Railway — not needed at this scale.
