import { Telegraf } from 'telegraf';
import { registerStart } from './commands/start.js';
import { registerNewTask } from './commands/newTask.js';
import { registerApprove } from './commands/approve.js';
import { registerTasks } from './commands/tasks.js';
import { registerClaim } from './commands/claim.js';
import { registerSubmit } from './commands/submit.js';
import { registerReview } from './commands/review.js';
import { registerStatus } from './commands/status.js';

export function createBot(token) {
  const bot = new Telegraf(token);

  registerStart(bot);
  registerNewTask(bot);
  registerApprove(bot);
  registerTasks(bot);
  registerClaim(bot);
  registerSubmit(bot);
  registerReview(bot);
  registerStatus(bot);

  bot.catch((err, ctx) => {
    console.error(`Bot error for update ${ctx.update.update_id}:`, err);
    ctx.reply('Something went wrong, please try again.').catch(() => {});
  });

  return bot;
}
