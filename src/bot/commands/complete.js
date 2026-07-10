import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

export function registerComplete(bot) {
  bot.command('complete', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /complete <task_id>');

    const task = await prisma.task.findUnique({ where: { id }, include: { assignedContributor: true } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply('Only admins of this task\'s room (or global admins) can complete it.');
    }

    try {
      assertTransition(task.status, TASK_STATUS.COMPLETED);
    } catch (err) {
      return ctx.reply(`Cannot complete: ${err.message}`);
    }

    const result = await prisma.task.updateMany({
      where: { id, status: task.status },
      data: { status: TASK_STATUS.COMPLETED },
    });

    if (result.count === 0) {
      const current = await prisma.task.findUnique({ where: { id } });
      return ctx.reply(`Task #${id} is already ${current.status} - someone else may have just handled it.`);
    }

    await prisma.taskHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus: TASK_STATUS.COMPLETED, actorTelegramId: BigInt(ctx.from.id) },
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
