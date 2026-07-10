import { prisma } from '../../db.js';
import { isAdmin } from '../roomAuth.js';
import { listRoomIdsForAdmin } from '../../rooms.js';
import { TASK_STATUS } from '../../workflow.js';

export function registerDrafts(bot) {
  bot.command('drafts', async (ctx) => {
    const global = isAdmin(ctx);
    const roomIds = global ? null : await listRoomIdsForAdmin(ctx.from.id);

    if (!global && roomIds.length === 0) {
      return ctx.reply('Only admins can view pending drafts.');
    }

    const where = { status: TASK_STATUS.DRAFT, ...(global ? {} : { roomId: { in: roomIds } }) };
    const draftTasks = await prisma.task.findMany({
      where,
      include: { signal: true, room: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (draftTasks.length === 0) {
      return ctx.reply('No pending drafts.');
    }

    const lines = draftTasks.map((t) => {
      const source = t.signal ? `auto-drafted from signal (score-gated, reasoning: ${t.signal.summary})` : 'created manually';
      const room = t.room?.chatTitle ? ` in "${t.room.chatTitle}"` : '';
      return `#${t.id} "${t.title}"${room}\n${source}\nUse /approve ${t.id} to review.`;
    });

    await ctx.reply(lines.join('\n\n'));
  });
}
