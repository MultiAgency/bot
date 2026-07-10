import 'dotenv/config';
import { createBot } from './bot/index.js';
import { startRouteScheduler } from './scheduler.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('Missing BOT_TOKEN in .env (get one from @BotFather on Telegram)');
}

const bot = createBot(token);

bot.launch().then(() => console.log('Bot is running (long polling).'));

const scheduler = startRouteScheduler(bot.telegram);

process.once('SIGINT', () => {
  clearInterval(scheduler);
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  clearInterval(scheduler);
  bot.stop('SIGTERM');
});
