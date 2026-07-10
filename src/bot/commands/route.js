import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { TASK_STATUS, assertTransition } from '../../workflow.js';
import { rankCandidates } from '../../matching.js';

const ACTIVE_STATUSES = [TASK_STATUS.CLAIMED, TASK_STATUS.SUBMITTED, TASK_STATUS.REVISION_REQUESTED];

export function registerRoute(bot) {
  bot.command('route', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /route <task_id>');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply('Only admins of this task\'s room (or global admins) can route it.');
    }

    try {
      assertTransition(task.status, TASK_STATUS.ROUTED);
    } catch (err) {
      return ctx.reply(`Cannot route: ${err.message}`);
    }

    const candidates = await prisma.contributor.findMany({ where: { isRegistered: true } });
    const activeCounts = await prisma.task.groupBy({
      by: ['assignedContributorId'],
      where: { status: { in: ACTIVE_STATUSES }, assignedContributorId: { not: null } },
      _count: true,
    });
    const activeTaskCounts = new Map(activeCounts.map((c) => [c.assignedContributorId, c._count]));

    const ranked = rankCandidates(task, candidates, activeTaskCounts);
    const top = ranked[0] ?? null;

    // Atomic guard: fails cleanly if another admin already routed/rejected
    // this task since we read it, instead of overwriting their action.
    const result = await prisma.task.updateMany({
      where: { id, status: task.status },
      data: {
        status: TASK_STATUS.ROUTED,
        routedContributorId: top?.contributor.id ?? null,
        matchScore: top?.score ?? null,
      },
    });

    if (result.count === 0) {
      const current = await prisma.task.findUnique({ where: { id } });
      return ctx.reply(`Task #${id} is already ${current.status} - someone else may have just handled it.`);
    }

    await prisma.taskHistory.create({
      data: { taskId: id, fromStatus: task.status, toStatus: TASK_STATUS.ROUTED, actorTelegramId: BigInt(ctx.from.id) },
    });

    if (ranked.length === 0) {
      return ctx.reply(
        `Task #${id} routed with no scored candidates yet (no registered contributors). ` +
          'It is now open to any registered contributor via /tasks.'
      );
    }

    const top3 = ranked
      .slice(0, 3)
      .map(
        (r, i) =>
          `${i + 1}. ${r.contributor.displayName || r.contributor.telegramUsername || r.contributor.id} - score ${r.score}`
      )
      .join('\n');

    await ctx.reply(
      `Task #${id} routed. Suggested contributor: ${top.contributor.displayName || top.contributor.telegramUsername} (score ${top.score}).\n\n` +
        `Top matches:\n${top3}\n\nTask is now open to any registered contributor via /tasks (routing is a suggestion, not a lock, in this version).`
    );
  });
}
