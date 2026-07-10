import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

export function registerAmplify(bot) {
  bot.command('amplify', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('Only admins can amplify tasks.');
    }

    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const note = parts.slice(2).join(' ').trim() || null;
    if (!id) return ctx.reply('Usage: /amplify <task_id> [note]');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    try {
      assertTransition(task.status, TASK_STATUS.AMPLIFIED);
    } catch (err) {
      return ctx.reply(`Cannot amplify: ${err.message}`);
    }

    await prisma.task.update({
      where: { id },
      data: {
        status: TASK_STATUS.AMPLIFIED,
        history: {
          create: { toStatus: TASK_STATUS.AMPLIFIED, actorTelegramId: BigInt(ctx.from.id), note },
        },
      },
    });

    await ctx.reply(`Task #${id} marked as amplified. Use /complete ${id} to close it out.`);
  });
}
