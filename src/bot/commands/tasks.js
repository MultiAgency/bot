import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';

export function registerTasks(bot) {
  bot.command('tasks', async (ctx) => {
    const openTasks = await prisma.task.findMany({
      where: { status: TASK_STATUS.OPEN },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (openTasks.length === 0) {
      return ctx.reply('No open tasks right now.');
    }

    const lines = openTasks.map(
      (t) => `#${t.id} - ${t.title}${t.reward ? ` (${t.reward})` : ''}\nUse /claim ${t.id} to claim it.`
    );

    await ctx.reply(lines.join('\n\n'));
  });
}
