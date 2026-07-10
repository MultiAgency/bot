import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTaskTransition } from '../../workflow.js';

function registerTransitionCommand(bot, command, toStatus, verb) {
  bot.command(command, async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply(`Usage: /${command} <task_id>`);

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply(`Only admins of this task's room (or global admins) can ${verb} it.`);
    }

    try {
      assertTaskTransition(task.status, toStatus);
    } catch (err) {
      return ctx.reply(`Cannot ${verb}: ${err.message}`);
    }

    const result = await prisma.task.updateMany({
      where: { id, status: task.status },
      data: { status: toStatus },
    });
    if (result.count === 0) {
      const current = await prisma.task.findUnique({ where: { id } });
      return ctx.reply(`Task #${id} is already ${current.status} - someone else may have just handled it.`);
    }

    await prisma.taskHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus, actorTelegramId: BigInt(ctx.from.id) },
    });

    await ctx.reply(`Task #${id} is now ${toStatus}.`);
  });
}

export function registerCloseTask(bot) {
  registerTransitionCommand(bot, 'close', TASK_STATUS.CLOSED, 'close');
  registerTransitionCommand(bot, 'reopen', TASK_STATUS.OPEN, 'reopen');
}
