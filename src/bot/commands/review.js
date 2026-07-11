import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import {
  APPLICATION_STATUS,
  SUBMISSION_STATUS,
  assertSubmissionTransition,
  assertApplicationTransition,
} from '../../workflow.js';

const DECISION_TO_SUBMISSION_STATUS = {
  approve: SUBMISSION_STATUS.APPROVED,
  reject: SUBMISSION_STATUS.REJECTED,
  revise: SUBMISSION_STATUS.NEEDS_REVISION,
};

const DECISION_EMOJI = { approve: '✅', reject: '❌', revise: '🔄' };

// Submission approve/reject cascade to the Application per the spec:
// approve -> Completed (terminal; slot stays consumed), reject -> Rejected
// (terminal; slot freed). Revise leaves the Application Assigned so the
// contributor can submit a new version.
const DECISION_TO_APPLICATION_STATUS = {
  approve: APPLICATION_STATUS.COMPLETED,
  reject: APPLICATION_STATUS.REJECTED,
};

export function registerReview(bot) {
  bot.command('review', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const decision = parts[2]?.toLowerCase();
    const note = parts.slice(3).join(' ').trim() || null;

    if (!id || !DECISION_TO_SUBMISSION_STATUS[decision]) {
      return ctx.reply('ℹ️ Usage: /review <application_id> approve|reject|revise [note]');
    }

    const application = await prisma.application.findUnique({
      where: { id },
      include: { task: true, contributor: true },
    });
    if (!application) return ctx.reply(`❌ Application #${id} not found.`);

    if (!(await canManageTask(ctx, application.task))) {
      return ctx.reply('🚫 Only admins of this task\'s room (or global admins) can review it.');
    }

    const submission = await prisma.submission.findFirst({
      where: { applicationId: id },
      orderBy: { version: 'desc' },
    });
    if (!submission) return ctx.reply(`📭 Application #${id} has no submission to review yet.`);

    const toSubmissionStatus = DECISION_TO_SUBMISSION_STATUS[decision];
    try {
      assertSubmissionTransition(submission.status, toSubmissionStatus);
      const toApplicationStatus = DECISION_TO_APPLICATION_STATUS[decision];
      if (toApplicationStatus) assertApplicationTransition(application.status, toApplicationStatus);
    } catch (err) {
      return ctx.reply(`❌ Cannot review: ${err.message}`);
    }

    // Atomic guard: if another admin reviewed this submission first (even
    // with a conflicting decision), this touches 0 rows instead of both
    // decisions "succeeding" and the contributor getting contradictory DMs.
    const result = await prisma.submission.updateMany({
      where: { id: submission.id, status: submission.status },
      data: { status: toSubmissionStatus, reviewerNote: note },
    });
    if (result.count === 0) {
      return ctx.reply(`⚠️ Submission v${submission.version} was already reviewed by someone else.`);
    }

    await prisma.submissionHistory.create({
      data: {
        submissionId: submission.id,
        fromStatus: submission.status,
        toStatus: toSubmissionStatus,
        actorTelegramId: BigInt(ctx.from.id),
        note,
      },
    });

    const toApplicationStatus = DECISION_TO_APPLICATION_STATUS[decision];
    if (toApplicationStatus) {
      await prisma.application.update({
        where: { id: application.id },
        data: { status: toApplicationStatus },
      });
      await prisma.applicationHistory.create({
        data: {
          applicationId: application.id,
          fromStatus: application.status,
          toStatus: toApplicationStatus,
          actorTelegramId: BigInt(ctx.from.id),
          note,
        },
      });

      if (decision === 'approve') {
        await prisma.contributor.update({
          where: { id: application.contributorId },
          data: { completedTaskCount: { increment: 1 } },
        });
      } else if (decision === 'reject') {
        await prisma.contributor.update({
          where: { id: application.contributorId },
          data: { rejectedSubmissionCount: { increment: 1 } },
        });
      }
    }

    const messages = {
      approve: `🎉 Task #${application.taskId} "${application.task.title}" — your submission was approved. Thank you!`,
      reject: `❌ Task #${application.taskId} "${application.task.title}" — your submission was rejected.${note ? ` Reason: ${note}` : ''}`,
      revise: `🔄 Task #${application.taskId} "${application.task.title}" needs revision.${note ? ` Note: ${note}` : ''}\n📤 Use /submit ${application.taskId} <new content> to resubmit.`,
    };
    await ctx.telegram
      .sendMessage(application.contributor.telegramUserId.toString(), messages[decision])
      .catch(() => {});

    const emoji = DECISION_EMOJI[decision] || '📌';
    await ctx.reply(
      `${emoji} Reviewed submission v${submission.version} for application #${id} → ${toSubmissionStatus}${toApplicationStatus ? ` (application → ${toApplicationStatus})` : ''}.`
    );
  });
}
