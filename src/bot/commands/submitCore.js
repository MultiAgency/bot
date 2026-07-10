import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';
import { notifyTaskManagers, getTaskManagerIds } from '../notifyAdmins.js';
import { reviewSubmission } from '../../ai/reviewSubmission.js';
import { convertUrlToFile } from '../../ai/urlToFile.js';

export async function validateClaimForSubmission(ctx, id) {
  const task = await prisma.task.findUnique({ where: { id }, include: { assignedContributor: true } });
  if (!task) return { error: `Task #${id} not found.` };

  if (task.status !== TASK_STATUS.CLAIMED && task.status !== TASK_STATUS.REVISION_REQUESTED) {
    return { error: `Task #${id} is not awaiting a submission right now (status: ${task.status}).` };
  }

  if (task.assignedContributor?.telegramUserId !== BigInt(ctx.from.id)) {
    return { error: "You haven't claimed this task, so you can't submit a result." };
  }

  return { task };
}

// Best-effort: runs after the submission is already recorded and admins
// already notified, so a slow/failed AI call never blocks or breaks the
// actual submission. Sends the note as a separate follow-up message once
// ready, and never approves/rejects anything - purely an aid for reviewers.
async function runAiPreReview(ctx, task) {
  try {
    const note = await reviewSubmission(ctx, task);
    if (!note) return;

    await prisma.task.update({ where: { id: task.id }, data: { aiReviewNote: note } });

    const recipients = await getTaskManagerIds(task);
    await Promise.allSettled(
      recipients.map((id) => ctx.telegram.sendMessage(id, `AI pre-review for task #${task.id}:\n${note}`))
    );
  } catch (err) {
    console.error(`AI pre-review failed for task #${task.id}:`, err);
  }
}

// Shared by text/link submission (submit.js) and media submission
// (submitMedia.js): applies the SUBMITTED transition, records history, and
// notifies whoever can review it (global + room admins).
export async function finalizeSubmission(ctx, task, data) {
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      status: TASK_STATUS.SUBMITTED,
      ...data,
      history: {
        create: {
          fromStatus: task.status,
          toStatus: TASK_STATUS.SUBMITTED,
          actorTelegramId: BigInt(ctx.from.id),
        },
      },
    },
  });

  await notifyTaskManagers(
    ctx,
    task,
    `Task #${task.id} "${task.title}" just got a new submission from ${ctx.from.username ? '@' + ctx.from.username : ctx.from.id}.\n` +
      `Use /review ${task.id} approve|reject|revise [note] to handle it.`
  );

  runAiPreReview(ctx, updated); // not awaited - fire and forget, see comment above
}

// Shared by the inline "/submit <id> <content>" form and the two-step flow
// (see pendingActions.js): standardizes a URL submission via Jina Reader
// before saving, exactly like submit.js originally did inline.
export async function submitTextOrLink(ctx, task, content) {
  const isUrl = /^https?:\/\//i.test(content);
  const submissionType = isUrl ? 'LINK' : 'TEXT';

  let sourceUrl = null;
  let submissionFileMetadata = null;
  if (isUrl) {
    sourceUrl = content;
    submissionFileMetadata = await convertUrlToFile(content);
  }

  await finalizeSubmission(ctx, task, { submissionType, submissionContent: content, sourceUrl, submissionFileMetadata });
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
