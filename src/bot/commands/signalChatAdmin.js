import { notifyAdmins } from '../notifyAdmins.js';
import { canManageRoom } from '../roomAuth.js';
import { getOrCreateRoom, setSignalsEnabled, isSignalsEnabled, addRoomAdmin } from '../../rooms.js';

const JOINED_STATUSES = ['member', 'administrator'];
const LEFT_STATUSES = ['left', 'kicked'];

export function registerSignalChatAdmin(bot) {
  // Fires whenever the bot's own membership in a chat changes - lets us
  // detect "just got invited to a group" without any manual chat-ID lookup.
  bot.on('my_chat_member', async (ctx) => {
    const { chat, from: actor, old_chat_member: oldMember, new_chat_member: newMember } = ctx.myChatMember;

    const justJoined = LEFT_STATUSES.includes(oldMember.status) && JOINED_STATUSES.includes(newMember.status);
    const justLeft = JOINED_STATUSES.includes(oldMember.status) && LEFT_STATUSES.includes(newMember.status);

    if (justJoined) {
      const room = await getOrCreateRoom(chat.id, chat.title);
      // Whoever added the bot is a practical, trusted default first admin
      // for this room - without this, only global admins could bootstrap it.
      if (!actor.is_bot) await addRoomAdmin(room.id, actor.id);

      await notifyAdmins(
        ctx,
        `Bot was added to "${chat.title || chat.id}" (chat id: ${chat.id}) by ${actor.username ? '@' + actor.username : actor.id}, who is now a room admin there.\n` +
          'To auto-draft tasks from messages in this group, a room admin should open that group and run /enablesignals. ' +
          'Make sure Telegram bot Privacy Mode is disabled via @BotFather first (see DEPLOY.md), or the bot will only see commands.\n' +
          'Use /addroomadmin (as a reply to a user\'s message) to add more room admins.'
      );
    } else if (justLeft) {
      await setSignalsEnabled(chat.id, false).catch(() => {});
    }
  });

  bot.command('enablesignals', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('Run this inside the group you want monitored, not in a DM.');
    }

    const room = await getOrCreateRoom(ctx.chat.id, ctx.chat.title);
    if (!(await canManageRoom(ctx, room.id))) {
      return ctx.reply('Only admins of this room (or global admins) can enable signal detection.');
    }

    await setSignalsEnabled(ctx.chat.id, true);
    await ctx.reply(
      'Signal detection enabled for this group. Messages here will now be scored for auto-drafting tasks ' +
        '(subject to rate limits). Use /disablesignals to turn it off.'
    );
  });

  bot.command('disablesignals', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('Run this inside the group, not in a DM.');
    }

    const room = await getOrCreateRoom(ctx.chat.id, ctx.chat.title);
    if (!(await canManageRoom(ctx, room.id))) {
      return ctx.reply('Only admins of this room (or global admins) can disable signal detection.');
    }

    await setSignalsEnabled(ctx.chat.id, false);
    await ctx.reply('Signal detection disabled for this group.');
  });

  bot.command('signalstatus', async (ctx) => {
    const enabled = await isSignalsEnabled(ctx.chat.id);
    await ctx.reply(`Signal detection is ${enabled ? 'ON' : 'OFF'} for this chat.`);
  });
}
