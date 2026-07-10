import { processSignalMessage } from '../../signalDetection.js';
import { getRoomByChatId } from '../../rooms.js';
import { notifyTaskManagers } from '../notifyAdmins.js';

// Passively watches group chats that an admin has opted in via
// /enablesignals, and auto-drafts tasks from promising messages (see
// src/signalDetection.js). Opt-in is per chat and stored in the DB
// (src/rooms.js) - see src/bot/commands/signalChatAdmin.js for how chats
// get enabled. Also requires disabling Telegram's bot privacy mode (see
// DEPLOY.md), or the bot never receives non-command messages at all.
export function registerSignalListener(bot) {
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // commands are handled elsewhere
    if (ctx.from?.is_bot) return;

    const room = await getRoomByChatId(ctx.chat.id).catch(() => null);
    if (!room?.signalsEnabled) return;

    const task = await processSignalMessage({
      text: ctx.message.text,
      source: `telegram:${ctx.chat.title || ctx.chat.id}`,
      actorTelegramId: BigInt(ctx.from.id),
      roomId: room.id,
    }).catch((err) => {
      console.error('processSignalMessage failed:', err);
      return null;
    });

    if (!task) return;

    await notifyTaskManagers(
      ctx,
      task,
      `New signal in "${ctx.chat.title || ctx.chat.id}" auto-drafted task #${task.id}: "${task.title}"\n` +
        `Use /approve ${task.id} to review it.`
    );
  });
}
