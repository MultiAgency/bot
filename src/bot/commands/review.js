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
    } catch (err) {
      return ctx.reply(`Cannot review: ${err.message}`);
    }

    await prisma.task.update({
      where: { id },
      data: {
        status: toStatus,
        reviewerNote: note,
        history: { create: { toStatus, actorTelegramId: BigInt(ctx.from.id), note } },
      },
    });

    if (task.assignedContributor && decision === 'reject') {
      await prisma.contributor.update({
        where: { id: task.assignedContributor.id },
        data: { rejectedSubmissionCount: { increment: 1 } },
      });
    }

    if (task.assignedContributor) {
      const messages = {
        approve: `Task #${id} "${task.title}" passed review. It will be finalized shortly (amplify/complete).`,
        reject: `Task #${id} "${task.title}" was rejected.${note ? ` Reason: ${note}` : ''}`,
        revise: `Task #${id} "${task.title}" needs revision.${note ? ` Note: ${note}` : ''} Use /submit ${id} <new content> to resubmit.`,
      };

      await ctx.telegram
        .sendMessage(task.assignedContributor.telegramUserId.toString(), messages[decision])
        .catch(() => {});
    }

    const nextStep = decision === 'approve' ? ' Use /amplify or /complete next.' : '';
    await ctx.reply(`Updated task #${id} -> ${toStatus}.${nextStep}`);
  });
}
