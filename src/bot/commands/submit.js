import { prisma } from '../../db.js';
import { TASK_STATUS } from '../../workflow.js';

function notifyAdmins(ctx, text) {
  const admins = (process.env.ADMIN_TELEGRAM_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return Promise.allSettled(admins.map((adminId) => ctx.telegram.sendMessage(adminId, text)));
}

export function registerSubmit(bot) {
  bot.command('submit', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const content = parts.slice(2).join(' ').trim();

    if (!id || !content) {
      return ctx.reply('Usage: /submit <task_id> <content or link>');
    }

    const task = await prisma.task.findUnique({ where: { id }, include: { assignedContributor: true } });
    if (!task) return ctx.reply(`Task #${id} not found.`);

    if (task.status !== TASK_STATUS.CLAIMED && task.status !== TASK_STATUS.REVISION_REQUESTED) {
      return ctx.reply(`Task #${id} is not awaiting a submission right now (status: ${task.status}).`);
    }

    if (task.assignedContributor?.telegramUserId !== BigInt(ctx.from.id)) {
      return ctx.reply("You haven't claimed this task, so you can't submit a result.");
    }

    const submissionType = /^https?:\/\//i.test(content) ? 'LINK' : 'TEXT';

    await prisma.task.update({
      where: { id },
      data: {
        status: TASK_STATUS.SUBMITTED,
        submissionType,
        submissionContent: content,
        history: {
          create: {
            fromStatus: task.status,
            toStatus: TASK_STATUS.SUBMITTED,
            actorTelegramId: BigInt(ctx.from.id),
          },
        },
      },
    });

    await ctx.reply(`Submitted your result for task #${id}. Waiting for reviewer approval.`);
    await notifyAdmins(
      ctx,
      `Task #${id} "${task.title}" just got a new submission from ${ctx.from.username ? '@' + ctx.from.username : ctx.from.id}.\n` +
        `Use /review ${id} approve|reject|revise [note] to handle it.`
    );
  });
}
