import { prisma } from '../../db.js';
import { APPLICATION_STATUS, assertApplicationTransition } from '../../workflow.js';

export function registerWithdraw(bot) {
  bot.command('withdraw', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('ℹ️ Usage: /withdraw <task_id>');

    const contributor = await prisma.contributor.findUnique({
      where: { telegramUserId: BigInt(ctx.from.id) },
    });
    if (!contributor) return ctx.reply("❌ You don't have an application for that task.");

    const application = await prisma.application.findFirst({
      where: { taskId: id, contributorId: contributor.id, status: APPLICATION_STATUS.APPLIED },
    });
    if (!application) {
      return ctx.reply(`❌ You don't have an active (unassigned) application for task #${id} to withdraw.`);
    }

    try {
      assertApplicationTransition(application.status, APPLICATION_STATUS.WITHDRAWN);
    } catch (err) {
      return ctx.reply(`❌ Cannot withdraw: ${err.message}`);
    }

    const result = await prisma.application.updateMany({
      where: { id: application.id, status: application.status },
      data: { status: APPLICATION_STATUS.WITHDRAWN },
    });
    if (result.count === 0) {
      return ctx.reply('⚠️ That application was already handled.');
    }

    await prisma.applicationHistory.create({
      data: {
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: APPLICATION_STATUS.WITHDRAWN,
        actorTelegramId: BigInt(ctx.from.id),
      },
    });

    await ctx.reply(`✋ Withdrew your application for task #${id}.`);
  });
}
