import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { APPLICATION_STATUS } from '../../workflow.js';
import { validateAssignmentForSubmission, submitTextOrLink, replyForTextSubmission } from './submitCore.js';
import { setPending } from '../pendingActions.js';
import { commandArgs } from '../commandArgs.js';
import { taskSummaryText } from './newTaskCore.js';

async function listAssignedApplications(ctx) {
  const contributor = await prisma.contributor.findUnique({
    where: { telegramUserId: BigInt(ctx.from.id) },
  });
  if (!contributor) return [];

  return prisma.application.findMany({
    where: { contributorId: contributor.id, status: APPLICATION_STATUS.ASSIGNED },
    include: { task: true },
    orderBy: { updatedAt: 'desc' },
  });
}

function readyForSubmissionText(id) {
  return `📤 Ready for your submission for task #${id}. Send text, a link, video, photo, or file within 5 minutes.`;
}

export function registerSubmit(bot) {
  bot.command('submit', async (ctx) => {
    const parts = commandArgs(ctx);
    const id = Number(parts[0]);
    const content = parts.slice(1).join(' ').trim();

    if (!id) {
      const applications = await listAssignedApplications(ctx);
      if (applications.length === 0) {
        return ctx.reply(
          "📭 You don't have any assigned tasks to submit for right now. Use /mytasks to check your applications."
        );
      }

      await ctx.reply(`📤 Pick a task to submit for (${applications.length}):`);
      for (const a of applications) {
        const text = taskSummaryText(a.task, { heading: `📋 Task #${a.taskId} "${a.task.title}"` });
        const keyboard = Markup.inlineKeyboard([Markup.button.callback('📤 Submit', `task_submit:${a.taskId}`)]);
        await ctx.reply(text, keyboard);
      }
      return;
    }

    const { application, error } = await validateAssignmentForSubmission(ctx, id);
    if (error) return ctx.reply(error);

    if (!content) {
      setPending(ctx.from.id, 'submission', { taskId: id });
      return ctx.reply(readyForSubmissionText(id));
    }

    const submissionFileMetadata = await submitTextOrLink(ctx, application, content);
    await replyForTextSubmission(ctx, id, submissionFileMetadata);
  });

  // Starts the two-step submission flow for one card from the /submit list
  // above - only sets the pending state once the user actually taps it, not
  // for every listed task up front.
  bot.action(/^task_submit:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const { error } = await validateAssignmentForSubmission(ctx, id);

    await ctx.answerCbQuery(error ? '❌' : '📤');
    if (error) return ctx.reply(error);

    setPending(ctx.from.id, 'submission', { taskId: id });
    await ctx.reply(readyForSubmissionText(id));
  });
}
