import { prisma } from '../../db.js';

export function registerStatus(bot) {
  bot.command('status', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /status <task_id>');

    const task = await prisma.task.findUnique({
      where: { id },
      include: { assignedContributor: true, history: { orderBy: { createdAt: 'asc' } } },
    });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    const lines = [
      `#${task.id} "${task.title}" - ${task.status}`,
      task.assignedContributor ? `Contributor: ${task.assignedContributor.displayName || task.assignedContributor.telegramUsername}` : 'No contributor has claimed it yet.',
      task.reviewerNote ? `Reviewer note: ${task.reviewerNote}` : null,
      '',
      'History:',
      ...task.history.map((h) => `- ${h.toStatus} (${h.createdAt.toISOString()})`),
    ].filter(Boolean);

    await ctx.reply(lines.join('\n'));
  });
}
