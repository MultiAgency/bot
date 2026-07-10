import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

export function registerApprove(bot) {
  bot.command('approve', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /approve <task_id>');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply('Only admins of this task\'s room (or global admins) can approve it.');
    }

    try {
      assertTransition(task.status, TASK_STATUS.APPROVED);
    } catch (err) {
      return ctx.reply(`Cannot approve: ${err.message}`);
    }

    // Atomic guard: if another admin approved/rejected this task between our
    // read and write, `status: task.status` won't match anymore and this
    // update touches 0 rows instead of silently overwriting their decision.
    const result = await prisma.task.updateMany({
      where: { id, status: task.status },
      data: { status: TASK_STATUS.APPROVED },
    });

    if (result.count === 0) {
      const current = await prisma.task.findUnique({ where: { id } });
      return ctx.reply(`Task #${id} is already ${current.status} - someone else may have just handled it.`);
    }

    await prisma.taskHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus: TASK_STATUS.APPROVED, actorTelegramId: BigInt(ctx.from.id) },
    });

    await ctx.reply(`Task #${id} approved. Use /route ${id} to match it with a contributor and open it up.`);
  });
}
