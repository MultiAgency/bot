import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { APPLICATION_STATUS, assertApplicationTransition } from '../../workflow.js';
import { commandArgs } from '../commandArgs.js';

// Shared by the /decline command and the application_decline:<id> button
// (see applicants.js) - the button path doesn't collect a note.
export async function declineApplication(ctx, id, note = null) {
  const application = await prisma.application.findUnique({
    where: { id },
    include: { task: true, contributor: true },
  });
  if (!application) return { error: `❌ Application #${id} not found.` };

  if (!(await canManageTask(ctx, application.task))) {
    return { error: "🚫 Only admins of this task's room (or global admins) can decline applicants." };
  }

  try {
    assertApplicationTransition(application.status, APPLICATION_STATUS.DECLINED);
  } catch (err) {
    return { error: `❌ Cannot decline: ${err.message}` };
  }

  const result = await prisma.application.updateMany({
    where: { id, status: application.status },
    data: { status: APPLICATION_STATUS.DECLINED },
  });
  if (result.count === 0) {
    return { error: '⚠️ That application was already handled.' };
  }

  await prisma.applicationHistory.create({
    data: {
      applicationId: id,
      fromStatus: application.status,
      toStatus: APPLICATION_STATUS.DECLINED,
      actorTelegramId: BigInt(ctx.from.id),
      note,
    },
  });

  await ctx.telegram
    .sendMessage(
      application.contributor.telegramUserId.toString(),
      `👎 Your application for task #${application.taskId} "${application.task.title}" wasn't selected this time.${note ? ` Note: ${note}` : ''}\n🙋 You can /apply again if it's still open.`
    )
    .catch(() => {});

  return { message: `👎 Declined application #${id}.` };
}

export function registerDecline(bot) {
  bot.command('decline', async (ctx) => {
    const parts = commandArgs(ctx);
    const id = Number(parts[0]);
    const note = parts.slice(1).join(' ').trim() || null;
    if (!id) return ctx.reply('ℹ️ Usage: /decline <application_id> [note]');

    const result = await declineApplication(ctx, id, note);
    await ctx.reply(result.error || result.message);
  });

  bot.action(/^application_decline:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match[1]);
    const result = await declineApplication(ctx, id);

    await ctx.answerCbQuery(result.error ? '❌' : '👎 Declined');
    if (result.error) return ctx.reply(result.error);

    const originalText = ctx.callbackQuery.message.text || '';
    await ctx
      .editMessageText(`${originalText}\n\n${result.message}`, Markup.inlineKeyboard([]))
      .catch(() => ctx.reply(result.message));
  });
}
