import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { APPLICATION_STATUS, assertApplicationTransition } from '../../workflow.js';

// Shared by the /assign command and the application_assign:<id> button
// (see applicants.js).
export async function assignApplication(ctx, id) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { task: true, contributor: true },
  });
  if (!application) return { error: `❌ Application #${id} not found.` };

  if (!(await canManageTask(ctx, application.task))) {
    return { error: "🚫 Only admins of this task's room (or global admins) can assign applicants." };
  }

  try {
    assertApplicationTransition(application.status, APPLICATION_STATUS.ASSIGNED);
  } catch (err) {
    return { error: `❌ Cannot assign: ${err.message}` };
  }

  const assignedCount = await prisma.application.count({
    where: { taskId: application.taskId, status: APPLICATION_STATUS.ASSIGNED },
  });
  if (assignedCount >= application.task.maxAssignees) {
    return {
      error: `⚠️ Task #${application.taskId} already has ${assignedCount}/${application.task.maxAssignees} assigned. Unassign someone first or this applicant can't be added.`,
    };
  }

  const result = await prisma.application.updateMany({
    where: { id, status: application.status },
    data: { status: APPLICATION_STATUS.ASSIGNED },
  });
  if (result.count === 0) {
    return { error: '⚠️ That application was already handled.' };
  }

  await prisma.applicationHistory.create({
    data: {
      applicationId: id,
      fromStatus: application.status,
      toStatus: APPLICATION_STATUS.ASSIGNED,
      actorTelegramId: BigInt(ctx.from.id),
    },
  });

  await ctx.telegram
    .sendMessage(
      application.contributor.telegramUserId.toString(),
      `🎉 You've been assigned to task #${application.taskId} "${application.task.title}".\n📤 Use /submit ${application.taskId} <content or link> (or send a video/photo/file) when ready.`
    )
    .catch(() => {});

  return {
    message: `✍️ Assigned application #${id} to task #${application.taskId} (👥 ${assignedCount + 1}/${application.task.maxAssignees}).`,
  };
}

export function registerAssign(bot) {
  bot.command('assign', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('ℹ️ Usage: /assign <application_id>');

    const result = await assignApplication(ctx, id);
    await ctx.reply(result.error || result.message);
  });

  bot.action(/^application_assign:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const result = await assignApplication(ctx, id);

    await ctx.answerCbQuery(result.error ? '❌' : '✍️ Assigned');
    if (result.error) return ctx.reply(result.error);

    const originalText = ctx.callbackQuery.message.text || '';
    await ctx
      .editMessageText(`${originalText}\n\n${result.message}`, Markup.inlineKeyboard([]))
      .catch(() => ctx.reply(result.message));
  });
}
