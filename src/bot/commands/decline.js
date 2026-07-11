import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { APPLICATION_STATUS, assertApplicationTransition } from '../../workflow.js';

export function registerDecline(bot) {
  bot.command('decline', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const note = parts.slice(2).join(' ').trim() || null;
    if (!id) return ctx.reply('ℹ️ Usage: /decline <application_id> [note]');

    const application = await prisma.application.findUnique({
      where: { id },
      include: { task: true, contributor: true },
    });
    if (!application) return ctx.reply(`❌ Application #${id} not found.`);

    if (!(await canManageTask(ctx, application.task))) {
      return ctx.reply('🚫 Only admins of this task\'s room (or global admins) can decline applicants.');
    }

    try {
      assertApplicationTransition(application.status, APPLICATION_STATUS.DECLINED);
    } catch (err) {
      return ctx.reply(`❌ Cannot decline: ${err.message}`);
    }

    const result = await prisma.application.updateMany({
      where: { id, status: application.status },
      data: { status: APPLICATION_STATUS.DECLINED },
    });
    if (result.count === 0) {
      return ctx.reply('⚠️ That application was already handled.');
    }

    await prisma.applicationHistory.create({
      data: {
        applicationId: id,
        fromStatus: application.status,
        toStatus: APPLICATION_STATUS.DECLINED,
        actorTelegramId: BigInt(ctx.from.id),
        note,
      },
    });

    await ctx.reply(`👎 Declined application #${id}.`);

    await ctx.telegram
      .sendMessage(
        application.contributor.telegramUserId.toString(),
        `👎 Your application for task #${application.taskId} "${application.task.title}" wasn't selected this time.${note ? ` Note: ${note}` : ''}\n🙋 You can /apply again if it's still open.`
      )
      .catch(() => {});
  });
}
