import { prisma } from '../../db.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../../workflow.js';
import { scoreApplicant } from '../../routing.js';
import { notifyTaskManagers } from '../notifyAdmins.js';

export function registerApply(bot) {
  bot.command('apply', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('Usage: /apply <task_id>');

    const contributor = await prisma.contributor.findUnique({
      where: { telegramUserId: BigInt(ctx.from.id) },
    });
    if (!contributor?.isRegistered) {
      return ctx.reply('You need to /register <twitter_handle> before applying to tasks.');
    }

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`Task #${id} not found.`);
    if (task.status !== TASK_STATUS.OPEN) {
      return ctx.reply(`Task #${id} is not open for applications right now (status: ${task.status}).`);
    }

    const existing = await prisma.application.findFirst({
      where: {
        taskId: id,
        contributorId: contributor.id,
        status: { in: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.ASSIGNED] },
      },
    });
    if (existing) {
      return ctx.reply(`You already have an active application for task #${id} (status: ${existing.status}).`);
    }

    const matchScore = await scoreApplicant(task, contributor);

    const application = await prisma.application.create({
      data: {
        taskId: id,
        contributorId: contributor.id,
        status: APPLICATION_STATUS.APPLIED,
        matchScore,
        history: { create: { toStatus: APPLICATION_STATUS.APPLIED, actorTelegramId: BigInt(ctx.from.id) } },
      },
    });

    await ctx.reply(`Applied to task #${id} (application #${application.id}). An admin will review applicants and assign up to ${task.maxAssignees}.`);

    await notifyTaskManagers(
      ctx,
      task,
      `New applicant for task #${id} "${task.title}": ${contributor.displayName || contributor.telegramUsername || contributor.id} (match score ${matchScore}, application #${application.id}).\n` +
        `Use /applicants ${id} to see everyone who's applied, or /assign ${application.id} to assign them directly.`
    );
  });
}
