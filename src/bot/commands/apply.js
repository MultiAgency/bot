import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../../workflow.js';
import { scoreApplicant } from '../../routing.js';
import { notifyTaskManagers } from '../notifyAdmins.js';
import { commandArgs } from '../commandArgs.js';

// Shared by the /apply command and the task_apply:<id> button (see
// tasks.js) - both just need a task id and a ctx to identify the
// contributor and notify task managers from.
export async function applyToTask(ctx, id) {
  const contributor = await prisma.contributor.findUnique({
    where: { telegramUserId: BigInt(ctx.from.id) },
  });
  if (!contributor?.isRegistered) {
    return { error: '🚫 You need to /onboard before applying to tasks.' };
  }

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return { error: `❌ Task #${id} not found.` };
  if (task.status !== TASK_STATUS.OPEN) {
    return { error: `🔒 Task #${id} is not open for applications right now (status: ${task.status}).` };
  }

  const existing = await prisma.application.findFirst({
    where: {
      taskId: id,
      contributorId: contributor.id,
      status: { in: [APPLICATION_STATUS.APPLIED, APPLICATION_STATUS.ASSIGNED] },
    },
  });
  if (existing) {
    return { error: `⚠️ You already have an active application for task #${id} (status: ${existing.status}).` };
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

  await notifyTaskManagers(
    ctx,
    task,
    `🙋 New applicant for task #${id} "${task.title}": ${contributor.displayName || contributor.telegramUsername || contributor.id} (📊 match score ${matchScore}, application #${application.id}).\n` +
      `Use /applicants ${id} to see everyone who's applied, or /assign ${application.id} to assign them directly.`
  );

  return {
    application,
    message: `🙋 Applied to task #${id} (application #${application.id}).\n⏳ An admin will review applicants and assign up to ${task.maxAssignees}.`,
  };
}

export function registerApply(bot) {
  bot.command('apply', async (ctx) => {
    const id = Number(commandArgs(ctx)[0]);
    if (!id) return ctx.reply('ℹ️ Usage: /apply <task_id>');

    const result = await applyToTask(ctx, id);
    await ctx.reply(result.error || result.message);
  });

  bot.action(/^task_apply:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const result = await applyToTask(ctx, id);

    await ctx.answerCbQuery(result.error ? '❌' : '🙋 Applied');
    if (result.error) return ctx.reply(result.error);

    const originalText = ctx.callbackQuery.message.text || '';
    await ctx
      .editMessageText(`${originalText}\n\n${result.message}`, Markup.inlineKeyboard([]))
      .catch(() => ctx.reply(result.message));
  });

  // Purely a UI dismissal for the per-task cards in /tasks - no DB effect,
  // just removes that card from the chat.
  bot.action('task_dismiss', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => ctx.editMessageReplyMarkup(null).catch(() => {}));
  });
}
