import { Telegraf } from 'telegraf';
import { registerStart } from './commands/start.js';
import { registerRegister } from './commands/register.js';
import { registerNewTask } from './commands/newTask.js';
import { registerDraftTask } from './commands/draftTask.js';
import { registerApprove } from './commands/approve.js';
import { registerRoute } from './commands/route.js';
import { registerTasks } from './commands/tasks.js';
import { registerMyTasks } from './commands/myTasks.js';
import { registerAllTasks } from './commands/allTasks.js';
import { registerClaim } from './commands/claim.js';
import { registerSubmit } from './commands/submit.js';
import { registerSubmitMedia } from './commands/submitMedia.js';
import { registerReview } from './commands/review.js';
import { registerAmplify } from './commands/amplify.js';
import { registerComplete } from './commands/complete.js';
import { registerStatus } from './commands/status.js';
import { registerDrafts } from './commands/drafts.js';
import { registerSignalChatAdmin } from './commands/signalChatAdmin.js';
import { registerRoomAdmin } from './commands/roomAdmin.js';
import { registerPendingTextDispatcher } from './commands/pendingTextDispatcher.js';
import { registerSignalListener } from './commands/signalListener.js';

export function createBot(token) {
  const bot = new Telegraf(token);

  registerStart(bot);
  registerRegister(bot);
  registerNewTask(bot);
  registerDraftTask(bot);
  registerApprove(bot);
  registerRoute(bot);
  registerTasks(bot);
  registerMyTasks(bot);
  registerAllTasks(bot);
  registerClaim(bot);
  registerSubmit(bot);
  registerSubmitMedia(bot);
  registerReview(bot);
  registerAmplify(bot);
  registerComplete(bot);
  registerStatus(bot);
  registerDrafts(bot);
  registerSignalChatAdmin(bot);
  registerRoomAdmin(bot);
  // Must run before the signal listener: a message fulfilling a pending
  // flow (submission, /newtask wizard) should never be treated as a chat
  // signal. It calls next() for anything that isn't its concern.
  registerPendingTextDispatcher(bot);
  // Must be registered last: it's a catch-all `on('text')` listener and
  // would otherwise shadow unmatched-command fallthrough to other handlers.
  registerSignalListener(bot);

  bot.catch((err, ctx) => {
    console.error(`Bot error for update ${ctx.update.update_id}:`, err);
    ctx.reply('Something went wrong, please try again.').catch(() => {});
  });

  return bot;
}
