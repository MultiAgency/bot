import { prisma } from '../../db.js';
import { getOrCreateRoom, addRoomAdmin, removeRoomAdmin, listRoomAdmins } from '../../rooms.js';
import { canManageRoom } from '../roomAuth.js';

// Telegram bots can't resolve @username -> user ID directly, so promoting a
// room admin requires replying to a message from that user (the standard
// workaround: the reply gives us their real numeric ID).
export function registerRoomAdmin(bot) {
  bot.command('addroomadmin', async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Run this inside the group, not in a DM.');

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      return ctx.reply('Reply to a message from the user you want to promote, then run /addroomadmin.');
    }
    if (replyTo.from.is_bot) return ctx.reply('A bot cannot be a room admin.');

    const room = await getOrCreateRoom(ctx.chat.id, ctx.chat.title);
    if (!(await canManageRoom(ctx, room.id))) {
      return ctx.reply('Only existing admins of this room (or global admins) can add new room admins.');
    }

    await addRoomAdmin(room.id, replyTo.from.id);
    const name = replyTo.from.first_name || replyTo.from.username || String(replyTo.from.id);
    await ctx.reply(`${name} is now a room admin for this group.`);
    await ctx.telegram
      .sendMessage(
        replyTo.from.id,
        `You've been made a room admin for "${ctx.chat.title}". You can now use admin commands (e.g. /newtask, /approve, /review) for tasks that belong to this group.`
      )
      .catch(() => {});
  });

  bot.command('removeroomadmin', async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Run this inside the group, not in a DM.');

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) {
      return ctx.reply('Reply to a room admin\'s message, then run /removeroomadmin.');
    }

    const room = await getOrCreateRoom(ctx.chat.id, ctx.chat.title);
    if (!(await canManageRoom(ctx, room.id))) {
      return ctx.reply('Only existing admins of this room (or global admins) can remove room admins.');
    }

    await removeRoomAdmin(room.id, replyTo.from.id);
    const name = replyTo.from.first_name || replyTo.from.username || String(replyTo.from.id);
    await ctx.reply(`${name} is no longer a room admin for this group.`);
  });

  bot.command('roomadmins', async (ctx) => {
    if (ctx.chat.type === 'private') return ctx.reply('Run this inside the group, not in a DM.');

    const room = await getOrCreateRoom(ctx.chat.id, ctx.chat.title);
    const admins = await listRoomAdmins(room.id);

    if (admins.length === 0) {
      return ctx.reply('No room admins yet. Reply to a user\'s message with /addroomadmin to add one.');
    }

    const contributors = await prisma.contributor.findMany({
      where: { telegramUserId: { in: admins.map((a) => a.telegramUserId) } },
    });
    const nameFor = (id) => {
      const c = contributors.find((c) => c.telegramUserId === id);
      return c?.displayName || c?.telegramUsername || id.toString();
    };

    await ctx.reply(`Room admins for "${ctx.chat.title}":\n` + admins.map((a) => `- ${nameFor(a.telegramUserId)}`).join('\n'));
  });
}
