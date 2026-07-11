import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTaskTransition } from '../../workflow.js';
import { rankCandidatesForTask } from '../../routing.js';

const NUDGE_TOP_N = 5;

// Shared by the /approve command and the task_approve:<id> button (see
// newTaskCore.js's taskCreatedMessage) - both just need a task id and a ctx
// to check permissions against and to send DMs from.
export async function approveTask(ctx, id) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { error: `❌ Task #${id} not found.` };

  if (!(await canManageTask(ctx, task))) {
    return { error: "🚫 Only admins of this task's room (or global admins) can approve it." };
  }

  try {
    assertTaskTransition(task.status, TASK_STATUS.OPEN);
  } catch (err) {
    return { error: `❌ Cannot approve: ${err.message}` };
  }

  // Atomic guard: if another admin approved/closed this task between our
  // read and write, `status: task.status` won't match anymore and this
  // update touches 0 rows instead of silently overwriting their decision.
  const result = await prisma.task.updateMany({
    where: { id, status: task.status },
    data: { status: TASK_STATUS.OPEN },
  });

  if (result.count === 0) {
    const current = await prisma.task.findUnique({ where: { id } });
    return { error: `⚠️ Task #${id} is already ${current.status} - someone else may have just handled it.` };
  }

  await prisma.taskHistory.create({
    data: { taskId: id, fromStatus: task.status, toStatus: TASK_STATUS.OPEN, actorTelegramId: BigInt(ctx.from.id) },
  });

  // Best-effort nudge: rank the registered pool and DM the top matches
  // encouraging them to /apply. Non-exclusive - anyone can still apply,
  // this just surfaces the task to people who look like a good fit.
  const ranked = await rankCandidatesForTask(task).catch((err) => {
    console.error(`Candidate ranking failed for task #${id}:`, err);
    return [];
  });

  const top = ranked.slice(0, NUDGE_TOP_N);
  await Promise.allSettled(
    top.map((r) =>
      ctx.telegram.sendMessage(
        r.contributor.telegramUserId.toString(),
        `✨ New task looks like a good fit for you: #${id} "${task.title}" (📊 match score ${r.score}).\n🙋 Use /apply ${id} if you're interested.`
      )
    )
  );

  return {
    task,
    message: `✅ Task #${id} approved and 🔓 open (max ${task.maxAssignees} assignee${task.maxAssignees === 1 ? '' : 's'}).\n📣 Notifying top-matched contributors to apply.`,
  };
}

// Only DRAFT tasks can be rejected (discarded) - it's a straight delete
// since a draft never has applications against it yet. Once a task is
// Open/Closed, /close is the right tool instead.
export async function rejectTask(ctx, id) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { error: `❌ Task #${id} not found.` };

  if (!(await canManageTask(ctx, task))) {
    return { error: "🚫 Only admins of this task's room (or global admins) can reject it." };
  }

  if (task.status !== TASK_STATUS.DRAFT) {
    return { error: `❌ Only draft tasks can be rejected (this one is ${task.status}). Use /close to shut down an open task instead.` };
  }

  await prisma.$transaction([
    prisma.taskHistory.deleteMany({ where: { taskId: id } }),
    prisma.task.delete({ where: { id } }),
  ]);

  return { message: `🗑️ Task #${id} "${task.title}" rejected and discarded.` };
}

export function registerApprove(bot) {
  bot.command('approve', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('ℹ️ Usage: /approve <task_id>');

    const result = await approveTask(ctx, id);
    await ctx.reply(result.error || result.message);
  });

  bot.action(/^task_approve:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const result = await approveTask(ctx, id);

    await ctx.answerCbQuery(result.error ? '❌' : '✅ Approved');
    if (result.error) return ctx.reply(result.error);

    const originalText = ctx.callbackQuery.message.text || '';
    await ctx
      .editMessageText(`${originalText}\n\n${result.message}`, Markup.inlineKeyboard([]))
      .catch(() => ctx.reply(result.message));
  });

  bot.action(/^task_reject:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const result = await rejectTask(ctx, id);

    await ctx.answerCbQuery(result.error ? '❌' : '🗑️ Rejected');
    if (result.error) return ctx.reply(result.error);

    await ctx.editMessageText(result.message, Markup.inlineKeyboard([])).catch(() => ctx.reply(result.message));
  });
}
