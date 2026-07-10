import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTaskTransition } from '../../workflow.js';
import { rankCandidatesForTask } from '../../routing.js';

const NUDGE_TOP_N = 5;

export function registerApprove(bot) {
  bot.command('approve', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /approve <task_id>');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply('Only admins of this task\'s room (or global admins) can approve it.');
    }

    try {
      assertTaskTransition(task.status, TASK_STATUS.OPEN);
    } catch (err) {
      return ctx.reply(`Cannot approve: ${err.message}`);
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
      return ctx.reply(`Task #${id} is already ${current.status} - someone else may have just handled it.`);
    }

    await prisma.taskHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus: TASK_STATUS.OPEN, actorTelegramId: BigInt(ctx.from.id) },
    });

    await ctx.reply(`Task #${id} approved and open (max ${task.maxAssignees} assignee${task.maxAssignees === 1 ? '' : 's'}). Notifying top-matched contributors to apply.`);

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
          `New task looks like a good fit for you: #${id} "${task.title}" (match score ${r.score}).\nUse /apply ${id} if you're interested.`
        )
      )
    );
  });
}
