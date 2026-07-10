import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { APPLICATION_STATUS, assertApplicationTransition } from '../../workflow.js';

export function registerAssign(bot) {
  bot.command('assign', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /assign <application_id>');

    const application = await prisma.application.findUnique({
      where: { id },
      include: { task: true, contributor: true },
    });
    if (!application) return ctx.reply(`Application #${id} not found.`);

    if (!(await canManageTask(ctx, application.task))) {
      return ctx.reply('Only admins of this task\'s room (or global admins) can assign applicants.');
    }

    try {
      assertApplicationTransition(application.status, APPLICATION_STATUS.ASSIGNED);
    } catch (err) {
      return ctx.reply(`Cannot assign: ${err.message}`);
    }

    const assignedCount = await prisma.application.count({
      where: { taskId: application.taskId, status: APPLICATION_STATUS.ASSIGNED },
    });
    if (assignedCount >= application.task.maxAssignees) {
      return ctx.reply(
        `Task #${application.taskId} already has ${assignedCount}/${application.task.maxAssignees} assigned. Unassign someone first or this applicant can't be added.`
      );
    }

    const result = await prisma.application.updateMany({
      where: { id, status: application.status },
      data: { status: APPLICATION_STATUS.ASSIGNED },
    });
    if (result.count === 0) {
      return ctx.reply('That application was already handled.');
    }

    await prisma.applicationHistory.create({
      data: {
        applicationId: id,
        fromStatus: application.status,
        toStatus: APPLICATION_STATUS.ASSIGNED,
        actorTelegramId: BigInt(ctx.from.id),
      },
    });

    await ctx.reply(`Assigned application #${id} to task #${application.taskId} (${assignedCount + 1}/${application.task.maxAssignees}).`);

    await ctx.telegram
      .sendMessage(
        application.contributor.telegramUserId.toString(),
        `You've been assigned to task #${application.taskId} "${application.task.title}". Use /submit ${application.taskId} <content or link> (or send a video/photo/file) when ready.`
      )
      .catch(() => {});
  });
}
