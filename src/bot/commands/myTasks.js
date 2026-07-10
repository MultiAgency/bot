import { prisma } from '../../db.js';

export function registerMyTasks(bot) {
  bot.command('mytasks', async (ctx) => {
    const contributor = await prisma.contributor.findUnique({
      where: { telegramUserId: BigInt(ctx.from.id) },
    });

    if (!contributor) {
      return ctx.reply('You have no tasks yet. Use /tasks to see what\'s open.');
    }

    const tasks = await prisma.task.findMany({
      where: { assignedContributorId: contributor.id },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    if (tasks.length === 0) {
      return ctx.reply('You have no tasks yet. Use /tasks to see what\'s open.');
    }

    const lines = tasks.map((t) => `#${t.id} "${t.title}" - ${t.status}`);
    await ctx.reply(['Your tasks:', ...lines].join('\n'));
  });
}
