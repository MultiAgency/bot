import { prisma } from '../../db.js';
import { isAdmin } from '../roomAuth.js';
import { listRoomIdsForAdmin } from '../../rooms.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../../workflow.js';
import { TASK_STATUS_EMOJI } from '../emoji.js';

export function registerAllTasks(bot) {
  bot.command('alltasks', async (ctx) => {
    const global = isAdmin(ctx);
    const roomIds = global ? null : await listRoomIdsForAdmin(ctx.from.id);

    if (!global && roomIds.length === 0) {
      return ctx.reply('🚫 Only admins can view all tasks.');
    }

    const statusArg = ctx.message.text.split(' ')[1]?.toUpperCase();
    if (statusArg && !TASK_STATUS[statusArg]) {
      return ctx.reply(`ℹ️ Usage: /alltasks [status]\nValid statuses: ${Object.keys(TASK_STATUS).join(', ')}`);
    }

    const where = {
      ...(global ? {} : { roomId: { in: roomIds } }),
      ...(statusArg ? { status: statusArg } : {}),
    };

    const tasks = await prisma.task.findMany({
      where,
      include: { applications: true },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    if (tasks.length === 0) {
      return ctx.reply('📭 No tasks found.');
    }

    const lines = tasks.map((t) => {
      const assignedCount = t.applications.filter((a) => a.status === APPLICATION_STATUS.ASSIGNED).length;
      return `${TASK_STATUS_EMOJI[t.status] || '📌'} #${t.id} "${t.title}" — ${t.status} (👥 ${assignedCount}/${t.maxAssignees} assigned)`;
    });

    await ctx.reply([`📚 Tasks${statusArg ? ` (${statusArg})` : ''}:`, ...lines].join('\n'));
  });
}
