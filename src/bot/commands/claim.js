import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';

const LOCK_MS = Number(process.env.ROUTE_LOCK_MINUTES || 30) * 60 * 1000;

export function registerClaim(bot) {
  bot.command('claim', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /claim <task_id>');

    const contributor = await prisma.contributor.findUnique({
      where: { telegramUserId: BigInt(ctx.from.id) },
    });

    if (!contributor?.isRegistered) {
      return ctx.reply('You need to /register <twitter_handle> before claiming tasks.');
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (task.status !== TASK_STATUS.ROUTED) {
      return ctx.reply(`Task #${id} is not open (someone else may have already claimed it).`);
    }

    // Hard routing lock: only the suggested contributor can claim until it
    // expires, then the scheduler reroutes or opens it to everyone.
    if (task.routedContributorId && task.routedContributorId !== contributor.id && task.routedAt) {
      const remainingMs = task.routedAt.getTime() + LOCK_MS - Date.now();
      if (remainingMs > 0) {
        const minutes = Math.ceil(remainingMs / 60000);
        return ctx.reply(
          `Task #${id} is currently reserved for another contributor for ${minutes} more minute(s). ` +
            'It will open up automatically if unclaimed.'
        );
      }
    }

    // Atomic claim: only succeeds if the task is still ROUTED, preventing double-claims.
    const claimed = await prisma.task.updateMany({
      where: { id, status: TASK_STATUS.ROUTED },
      data: { status: TASK_STATUS.CLAIMED, assignedContributorId: contributor.id },
    });

    if (claimed.count === 0) {
      return ctx.reply(`Task #${id} is not open (someone else may have already claimed it).`);
    }

    await prisma.taskHistory.create({
      data: {
        taskId: id,
        fromStatus: TASK_STATUS.ROUTED,
        toStatus: TASK_STATUS.CLAIMED,
        actorTelegramId: BigInt(ctx.from.id),
      },
    });

    await prisma.contributor.update({
      where: { id: contributor.id },
      data: { claimedTaskCount: { increment: 1 } },
    });

    await ctx.reply(`You've claimed task #${id}. When done, use /submit ${id} <content or link>.`);
  });
}
