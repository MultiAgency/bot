import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { APPLICATION_STATUS, assertApplicationTransition } from '../../workflow.js';
import { commandArgs } from '../commandArgs.js';

export function registerUnassign(bot) {
  bot.command('unassign', async (ctx) => {
    const parts = commandArgs(ctx);
    const id = Number(parts[0]);
    const reason = parts.slice(1).join(' ').trim();
    if (!id || !reason) return ctx.reply('ℹ️ Usage: /unassign <application_id> <reason>');

    const application = await prisma.application.findUnique({
      where: { id },
      include: { task: true, contributor: true },
    });
    if (!application) return ctx.reply(`❌ Application #${id} not found.`);

    if (!(await canManageTask(ctx, application.task))) {
      return ctx.reply('🚫 Only admins of this task\'s room (or global admins) can unassign contributors.');
    }

    try {
      assertApplicationTransition(application.status, APPLICATION_STATUS.APPLIED);
    } catch (err) {
      return ctx.reply(`❌ Cannot unassign: ${err.message}`);
    }

    const result = await prisma.application.updateMany({
      where: { id, status: application.status },
      data: { status: APPLICATION_STATUS.APPLIED, unassignReason: reason },
    });
    if (result.count === 0) {
      return ctx.reply('⚠️ That application was already handled.');
    }

    await prisma.applicationHistory.create({
      data: {
        applicationId: id,
        fromStatus: application.status,
        toStatus: APPLICATION_STATUS.APPLIED,
        actorTelegramId: BigInt(ctx.from.id),
        note: reason,
      },
    });

    await ctx.reply(`🔄 Unassigned application #${id} from task #${application.taskId}. It's back in the applicant pool.`);

    await ctx.telegram
      .sendMessage(
        application.contributor.telegramUserId.toString(),
        `🔄 You've been unassigned from task #${application.taskId} "${application.task.title}".\nReason: ${reason}`
      )
      .catch(() => {});
  });
}
