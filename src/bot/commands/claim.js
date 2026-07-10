import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';

export function registerClaim(bot) {
  bot.command('claim', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /claim <task_id>');

    const contributor = await prisma.contributor.upsert({
      where: { telegramUserId: BigInt(ctx.from.id) },
      update: {},
      create: {
        telegramUserId: BigInt(ctx.from.id),
        telegramUsername: ctx.from.username ?? null,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      },
    });

    // Atomic claim: only succeeds if the task is still OPEN, preventing double-claims.
    const claimed = await prisma.task.updateMany({
      where: { id, status: TASK_STATUS.OPEN },
      data: { status: TASK_STATUS.CLAIMED, assignedContributorId: contributor.id },
    });

    if (claimed.count === 0) {
      return ctx.reply(`Task #${id} is not open (someone else may have already claimed it).`);
    }

    await prisma.taskHistory.create({
      data: {
        taskId: id,
        fromStatus: TASK_STATUS.OPEN,
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
