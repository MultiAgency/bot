import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';

const DECISION_TO_STATUS = {
  approve: TASK_STATUS.REVIEWED,
  reject: TASK_STATUS.REJECTED,
  revise: TASK_STATUS.REVISION_REQUESTED,
};

export function registerReview(bot) {
  bot.command('review', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('Only admins can review submissions.');
    }

    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const decision = parts[2]?.toLowerCase();
    const note = parts.slice(3).join(' ').trim() || null;

    if (!id || !DECISION_TO_STATUS[decision]) {
      return ctx.reply('Usage: /review <task_id> approve|reject|revise [note]');
    }

    const task = await prisma.task.findUnique({ where: { id }, include: { assignedContributor: true } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    const toStatus = DECISION_TO_STATUS[decision];
    try {
      assertTransition(task.status, toStatus);
      if (decision === 'approve') assertTransition(TASK_STATUS.REVIEWED, TASK_STATUS.COMPLETED);
    } catch (err) {
      return ctx.reply(`Cannot review: ${err.message}`);
    }

    const finalStatus = decision === 'approve' ? TASK_STATUS.COMPLETED : toStatus;
    const historyEntries =
      decision === 'approve'
        ? [
            { toStatus: TASK_STATUS.REVIEWED, actorTelegramId: BigInt(ctx.from.id), note },
            { toStatus: TASK_STATUS.COMPLETED, actorTelegramId: BigInt(ctx.from.id) },
          ]
        : [{ toStatus, actorTelegramId: BigInt(ctx.from.id), note }];

    await prisma.task.update({
      where: { id },
      data: {
        status: finalStatus,
        reviewerNote: note,
        history: { create: historyEntries },
      },
    });

    if (task.assignedContributor) {
      if (decision === 'approve') {
        await prisma.contributor.update({
          where: { id: task.assignedContributor.id },
          data: { completedTaskCount: { increment: 1 } },
        });
      } else if (decision === 'reject') {
        await prisma.contributor.update({
          where: { id: task.assignedContributor.id },
          data: { rejectedSubmissionCount: { increment: 1 } },
        });
      }

      const messages = {
        approve: `Task #${id} "${task.title}" has been approved. Thank you!`,
        reject: `Task #${id} "${task.title}" was rejected.${note ? ` Reason: ${note}` : ''}`,
        revise: `Task #${id} "${task.title}" needs revision.${note ? ` Note: ${note}` : ''} Use /submit ${id} <new content> to resubmit.`,
      };

      await ctx.telegram
        .sendMessage(task.assignedContributor.telegramUserId.toString(), messages[decision])
        .catch(() => {});
    }

    await ctx.reply(`Updated task #${id} -> ${finalStatus}.`);
  });
}
