import { canManageRoom } from '../roomAuth.js';
import { getOrCreateRoom, setAiEnabled, isAiEnabled } from '../../rooms.js';

// Room-scoped "AI mode": when on, plain messages and other commands in this
// room get routed to the AI agent (src/ai/agent.js) instead of the classic
// command handlers - see the middleware registered in bot/index.js. /ai
// itself always stays reachable so a room can be switched back off.
export function registerAiToggle(bot) {
  bot.command('ai', async (ctx) => {
    if (ctx.chat.type === 'private') {
      return ctx.reply('ℹ️ AI mode is a per-group setting - run this inside the group you want it in.');
    }

    const arg = ctx.message.text.split(' ')[1]?.toLowerCase();
    const room = await getOrCreateRoom(ctx.chat.id, ctx.chat.title);

    if (!arg) {
      const enabled = await isAiEnabled(ctx.chat.id);
      return ctx.reply(
        `🤖 AI mode is ${enabled ? 'ON ✅' : 'OFF 🚫'} for this group.\nUsage: /ai on | /ai off`
      );
    }

    if (arg !== 'on' && arg !== 'off') {
      return ctx.reply('ℹ️ Usage: /ai on | /ai off');
    }

    if (!(await canManageRoom(ctx, room.id))) {
      return ctx.reply('🚫 Only admins of this room (or global admins) can toggle AI mode.');
    }

    await setAiEnabled(ctx.chat.id, arg === 'on');

    if (arg === 'on') {
      return ctx.reply(
        '🤖 AI mode is now ON for this group.\n' +
          '💬 Just talk naturally - I\'ll handle browsing tasks, applying, and (for admins) drafting/reviewing tasks.\n' +
          '🚫 Slash commands are disabled here except /ai off.'
      );
    }

    return ctx.reply('🤖 AI mode is now OFF. Slash commands are back to normal in this group.');
  });
}
