import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';
import { notifyTaskManagers } from '../notifyAdmins.js';

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

// Shared by text/link submission (submit.js) and media submission
// (submitMedia.js): applies the SUBMITTED transition, records history, and
// notifies whoever can review it (global + room admins).
export async function finalizeSubmission(ctx, task, data) {
  await prisma.task.update({
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
}
