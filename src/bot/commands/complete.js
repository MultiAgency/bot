import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

export function registerComplete(bot) {
  bot.command('complete', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('Only admins can complete tasks.');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /complete <task_id>');

    const task = await prisma.task.findUnique({ where: { id }, include: { assignedContributor: true } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    try {
      assertTransition(task.status, TASK_STATUS.COMPLETED);
    } catch (err) {
      return ctx.reply(`Cannot complete: ${err.message}`);
    }

    await prisma.task.update({
      where: { id },
      data: {
        status: TASK_STATUS.COMPLETED,
        history: {
          create: { toStatus: TASK_STATUS.COMPLETED, actorTelegramId: BigInt(ctx.from.id) },
        },
      },
    });

    if (task.assignedContributor) {
      await prisma.contributor.update({
        where: { id: task.assignedContributor.id },
        data: { completedTaskCount: { increment: 1 } },
      });

      await ctx.telegram
        .sendMessage(
          task.assignedContributor.telegramUserId.toString(),
          `Task #${id} "${task.title}" is complete. Thank you!`
        )
        .catch(() => {});
    }

    await ctx.reply(`Task #${id} completed.`);
  });
}
