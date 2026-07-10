import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';

export function registerTasks(bot) {
  bot.command('tasks', async (ctx) => {
    const routedTasks = await prisma.task.findMany({
      where: { status: TASK_STATUS.ROUTED },
      include: { routedContributor: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (routedTasks.length === 0) {
      return ctx.reply('No open tasks right now.');
    }

    const lines = routedTasks.map((t) => {
      const suggestion = t.routedContributor
        ? ` (suggested for ${t.routedContributor.displayName || t.routedContributor.telegramUsername})`
        : '';
      return `#${t.id} - ${t.title}${t.reward ? ` (${t.reward})` : ''}${suggestion}\nUse /claim ${t.id} to claim it.`;
    });

    await ctx.reply(lines.join('\n\n'));
  });
}
