import { prisma } from '../../db.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../../workflow.js';
import { taskSummaryText } from './newTaskCore.js';

export function registerTasks(bot) {
  bot.command('tasks', async (ctx) => {
    const openTasks = await prisma.task.findMany({
      where: { status: TASK_STATUS.OPEN },
      include: { applications: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (openTasks.length === 0) {
      return ctx.reply('📭 No open tasks right now.');
    }

    const blocks = openTasks.map((t) => {
      const assignedCount = t.applications.filter((a) => a.status === APPLICATION_STATUS.ASSIGNED).length;
      return taskSummaryText(t, {
        heading: `📋 Task #${t.id} (👥 ${assignedCount}/${t.maxAssignees} assigned)`,
        footer: `🙋 Use /apply ${t.id} to apply.`,
      });
    });

    await ctx.reply(`📢 Open tasks:\n\n${blocks.join('\n\n〰️〰️〰️\n\n')}`);
  });
}
