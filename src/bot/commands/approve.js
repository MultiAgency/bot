import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

export function registerApprove(bot) {
  bot.command('approve', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('Only admins can approve tasks.');
    }

    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /approve <task_id>');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    try {
      assertTransition(task.status, TASK_STATUS.APPROVED);
      assertTransition(TASK_STATUS.APPROVED, TASK_STATUS.OPEN);
    } catch (err) {
      return ctx.reply(`Cannot approve: ${err.message}`);
    }

    await prisma.task.update({
      where: { id },
      data: {
        status: TASK_STATUS.OPEN,
        history: {
          create: [
            { toStatus: TASK_STATUS.APPROVED, actorTelegramId: BigInt(ctx.from.id) },
            { toStatus: TASK_STATUS.OPEN, actorTelegramId: BigInt(ctx.from.id) },
          ],
        },
      },
    });

    await ctx.reply(`Task #${id} has been approved and opened for contributors (use /tasks to view).`);
  });
}
