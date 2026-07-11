import { prisma } from '../../db.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../../workflow.js';

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

    const lines = openTasks.map((t) => {
      const assignedCount = t.applications.filter((a) => a.status === APPLICATION_STATUS.ASSIGNED).length;
      return (
        `📋 #${t.id} — ${t.title}${t.reward ? ` (💰 ${t.reward})` : ''}\n` +
        `👥 ${assignedCount}/${t.maxAssignees} assigned\n` +
        `🙋 Use /apply ${t.id} to apply.`
      );
    });

    await ctx.reply(`📢 Open tasks:\n\n${lines.join('\n\n')}`);
  });
}
