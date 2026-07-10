import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

export function registerAmplify(bot) {
  bot.command('amplify', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const note = parts.slice(2).join(' ').trim() || null;
    if (!id) return ctx.reply('Usage: /amplify <task_id> [note]');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply('Only admins of this task\'s room (or global admins) can amplify it.');
    }

    try {
      assertTransition(task.status, TASK_STATUS.AMPLIFIED);
    } catch (err) {
      return ctx.reply(`Cannot amplify: ${err.message}`);
    }

    const result = await prisma.task.updateMany({
      where: { id, status: task.status },
      data: { status: TASK_STATUS.AMPLIFIED },
    });

    if (result.count === 0) {
      const current = await prisma.task.findUnique({ where: { id } });
      return ctx.reply(`Task #${id} is already ${current.status} - someone else may have just handled it.`);
    }

    await prisma.taskHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus: TASK_STATUS.AMPLIFIED, actorTelegramId: BigInt(ctx.from.id), note },
    });

    await ctx.reply(`Task #${id} marked as amplified. Use /complete ${id} to close it out.`);
  });
}
