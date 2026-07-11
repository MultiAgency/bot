import { prisma } from '../../db.js';
import { isAdmin } from '../roomAuth.js';
import { listRoomIdsForAdmin } from '../../rooms.js';
import { TASK_STATUS } from '../../workflow.js';
import { taskSummaryText } from './newTaskCore.js';

export function registerDrafts(bot) {
  bot.command('drafts', async (ctx) => {
    const global = isAdmin(ctx);
    const roomIds = global ? null : await listRoomIdsForAdmin(ctx.from.id);

    if (!global && roomIds.length === 0) {
      return ctx.reply('🚫 Only admins can view pending drafts.');
    }

    const where = { status: TASK_STATUS.DRAFT, ...(global ? {} : { roomId: { in: roomIds } }) };
    const draftTasks = await prisma.task.findMany({
      where,
      include: { signal: true, room: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (draftTasks.length === 0) {
      return ctx.reply('📭 No pending drafts.');
    }

    const blocks = draftTasks.map((t) => {
      const source = t.signal
        ? `🤖 Auto-drafted from signal (reasoning: ${t.signal.summary})`
        : '✍️ Created manually';
      const room = t.room?.chatTitle ? `🏠 Room: ${t.room.chatTitle}` : null;
      return taskSummaryText(t, {
        heading: `📝 Task #${t.id} (Draft)`,
        footer: [source, room, `✅ Use /approve ${t.id} to review.`].filter(Boolean).join('\n'),
      });
    });

    await ctx.reply(`📥 Pending drafts:\n\n${blocks.join('\n\n〰️〰️〰️\n\n')}`);
  });
}
