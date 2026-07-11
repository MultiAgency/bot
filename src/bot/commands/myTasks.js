import { prisma } from '../../db.js';
import { APPLICATION_STATUS_EMOJI, SUBMISSION_STATUS_EMOJI } from '../emoji.js';
import { taskSummaryText } from './newTaskCore.js';

export function registerMyTasks(bot) {
  bot.command('mytasks', async (ctx) => {
    const contributor = await prisma.contributor.findUnique({
      where: { telegramUserId: BigInt(ctx.from.id) },
    });

    if (!contributor) {
      return ctx.reply("📭 You have no applications yet. Use /tasks to see what's open.");
    }

    const applications = await prisma.application.findMany({
      where: { contributorId: contributor.id },
      include: { task: true, submissions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    if (applications.length === 0) {
      return ctx.reply("📭 You have no applications yet. Use /tasks to see what's open.");
    }

    const blocks = applications.map((a) => {
      const latest = a.submissions[0];
      const submissionInfo = latest
        ? `${SUBMISSION_STATUS_EMOJI[latest.status] || '📄'} Latest submission v${latest.version}: ${latest.status}`
        : null;
      return taskSummaryText(a.task, {
        heading: `📋 Task #${a.taskId} — ${APPLICATION_STATUS_EMOJI[a.status] || '📌'} ${a.status}`,
        footer: submissionInfo,
      });
    });

    await ctx.reply(`🗂 Your applications:\n\n${blocks.join('\n\n〰️〰️〰️\n\n')}`);
  });
}
