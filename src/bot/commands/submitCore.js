import { prisma } from '../../db.js';
import { APPLICATION_STATUS, SUBMISSION_STATUS } from '../../workflow.js';
import { notifyTaskManagers, getTaskManagerIds } from '../notifyAdmins.js';
import { reviewSubmission } from '../../ai/reviewSubmission.js';
import { convertUrlToFile } from '../../ai/urlToFile.js';

// A contributor can only submit against their own ASSIGNED application for
// a task - there's no more direct task "claim", assignment happens via
// /apply -> /assign.
export async function validateAssignmentForSubmission(ctx, taskId) {
  const contributor = await prisma.contributor.findUnique({
    where: { telegramUserId: BigInt(ctx.from.id) },
  });
  if (!contributor) return { error: "You don't have an assignment for that task." };

  const application = await prisma.application.findFirst({
    where: { taskId, contributorId: contributor.id, status: APPLICATION_STATUS.ASSIGNED },
    include: { task: true },
  });
  if (!application) {
    return { error: `You don't have an active assignment for task #${taskId}.` };
  }

  return { application };
}

// Best-effort: runs after the submission is already recorded and admins
// already notified, so a slow/failed AI call never blocks or breaks the
// actual submission. Sends the note as a separate follow-up message once
// ready, and never approves/rejects anything - purely an aid for reviewers.
async function runAiPreReview(ctx, submission, task) {
  try {
    const note = await reviewSubmission(ctx, submission, task);
    if (!note) return;

    await prisma.submission.update({ where: { id: submission.id }, data: { aiReviewNote: note } });

    const recipients = await getTaskManagerIds(task);
    await Promise.allSettled(
      recipients.map((id) =>
        ctx.telegram.sendMessage(id, `AI pre-review for task #${task.id} (submission #${submission.id}):\n${note}`)
      )
    );
  } catch (err) {
    console.error(`AI pre-review failed for submission #${submission.id}:`, err);
  }
}

// Shared by text/link submission (submit.js) and media submission
// (submitMedia.js): creates a new versioned Submission row under the
// contributor's ASSIGNED application, and notifies whoever can review it
// (global + room admins). The task itself doesn't change status.
export async function finalizeSubmission(ctx, application, data) {
  const latest = await prisma.submission.findFirst({
    where: { applicationId: application.id },
    orderBy: { version: 'desc' },
  });
  const version = (latest?.version ?? 0) + 1;

  const submission = await prisma.submission.create({
    data: {
      applicationId: application.id,
      version,
      status: SUBMISSION_STATUS.SUBMITTED,
      ...data,
      history: { create: { toStatus: SUBMISSION_STATUS.SUBMITTED, actorTelegramId: BigInt(ctx.from.id) } },
    },
  });

  await notifyTaskManagers(
    ctx,
    application.task,
    `Task #${application.taskId} "${application.task.title}" got submission v${version} (application #${application.id}) from ${ctx.from.username ? '@' + ctx.from.username : ctx.from.id}.\n` +
      `Use /review ${application.id} approve|reject|revise [note] to handle it.`
  );

  runAiPreReview(ctx, submission, application.task); // not awaited - fire and forget, see comment above
  return submission;
}

// Shared by the inline "/submit <id> <content>" form and the two-step flow
// (see pendingActions.js): standardizes a URL submission via Jina Reader
// before saving, exactly like submit.js originally did inline.
export async function submitTextOrLink(ctx, application, content) {
  const isUrl = /^https?:\/\//i.test(content);
  const submissionType = isUrl ? 'LINK' : 'TEXT';

  let sourceUrl = null;
  let submissionFileMetadata = null;
  if (isUrl) {
    sourceUrl = content;
    submissionFileMetadata = await convertUrlToFile(content);
  }

  await finalizeSubmission(ctx, application, {
    submissionType,
    submissionContent: content,
    sourceUrl,
    submissionFileMetadata,
  });
  return submissionFileMetadata;
}

export function replyForTextSubmission(ctx, id, submissionFileMetadata) {
  if (submissionFileMetadata?.conversionFailed) {
    return ctx.reply(
      `Submitted, but the link couldn't be auto-converted (${submissionFileMetadata.error}). ` +
        'The reviewer will need to open it manually.'
    );
  }
  return ctx.reply(`Submitted your result for task #${id}. Waiting for reviewer approval.`);
}
