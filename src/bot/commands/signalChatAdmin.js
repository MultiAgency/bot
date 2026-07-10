import { isAdmin } from '../isAdmin.js';
import { notifyAdmins } from '../notifyAdmins.js';
import { enableChat, disableChat, isMonitored } from '../../monitoredChats.js';

const JOINED_STATUSES = ['member', 'administrator'];
const LEFT_STATUSES = ['left', 'kicked'];

export function registerSignalChatAdmin(bot) {
  // Fires whenever the bot's own membership in a chat changes - lets us
  // detect "just got invited to a group" without any manual chat-ID lookup.
  bot.on('my_chat_member', async (ctx) => {
    const { chat, old_chat_member: oldMember, new_chat_member: newMember } = ctx.myChatMember;

    const justJoined = LEFT_STATUSES.includes(oldMember.status) && JOINED_STATUSES.includes(newMember.status);
    const justLeft = JOINED_STATUSES.includes(oldMember.status) && LEFT_STATUSES.includes(newMember.status);

    if (justJoined) {
      await notifyAdmins(
        ctx,
        `Bot was added to "${chat.title || chat.id}" (chat id: ${chat.id}).\n` +
          `To auto-draft tasks from messages in this group, an admin should open that group and run /enablesignals there. ` +
          'Make sure Telegram bot Privacy Mode is disabled via @BotFather first (see DEPLOY.md), or the bot will only see commands.'
      );
    } else if (justLeft) {
      await disableChat(chat.id).catch(() => {});
    }
  });

  bot.command('enablesignals', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Only admins can enable signal detection.');
    if (ctx.chat.type === 'private') {
      return ctx.reply('Run this inside the group you want monitored, not in a DM.');
    }

    await enableChat({ chatId: ctx.chat.id, chatTitle: ctx.chat.title, actorTelegramId: ctx.from.id });
    await ctx.reply(
      'Signal detection enabled for this group. Messages here will now be scored for auto-drafting tasks ' +
        '(subject to rate limits). Use /disablesignals to turn it off.'
    );
  });

  bot.command('disablesignals', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Only admins can disable signal detection.');
    await disableChat(ctx.chat.id);
    await ctx.reply('Signal detection disabled for this group.');
  });

  bot.command('signalstatus', async (ctx) => {
    const enabled = await isMonitored(ctx.chat.id);
    await ctx.reply(`Signal detection is ${enabled ? 'ON' : 'OFF'} for this chat.`);
  });
}
