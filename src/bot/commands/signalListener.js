import { processSignalMessage } from '../../signalDetection.js';

function notifyAdmins(ctx, text) {
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Promise.allSettled(admins.map((adminId) => ctx.telegram.sendMessage(adminId, text)));
}

function monitoredChatIds() {
  return (process.env.SIGNAL_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Passively watches configured group chats and auto-drafts tasks from
// promising messages (see src/signalDetection.js). Disabled unless
// SIGNAL_CHAT_IDS is set - opt-in per chat, not on by default, since it
// requires disabling Telegram's bot privacy mode (see DEPLOY.md).
export function registerSignalListener(bot) {
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // commands are handled elsewhere
    if (ctx.from?.is_bot) return;

    const watched = monitoredChatIds();
    if (watched.length === 0) return;
    if (!watched.includes(String(ctx.chat.id))) return;

    const task = await processSignalMessage({
      text: ctx.message.text,
      source: `telegram:${ctx.chat.title || ctx.chat.id}`,
      chatId: ctx.chat.id,
      actorTelegramId: BigInt(ctx.from.id),
    }).catch((err) => {
      console.error('processSignalMessage failed:', err);
      return null;
    });

    if (!task) return;

    await notifyAdmins(
      ctx,
      `New signal in "${ctx.chat.title || ctx.chat.id}" auto-drafted task #${task.id}: "${task.title}"\n` +
        `Use /approve ${task.id} to review it.`
    );
  });
}
