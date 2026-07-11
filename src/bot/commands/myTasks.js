import { prisma } from '../../db.js';
import { APPLICATION_STATUS_EMOJI, SUBMISSION_STATUS_EMOJI } from '../emoji.js';

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

    const lines = applications.map((a) => {
      const latest = a.submissions[0];
      const submissionInfo = latest
        ? `\n${SUBMISSION_STATUS_EMOJI[latest.status] || '📄'} Latest submission v${latest.version}: ${latest.status}`
        : '';
      return `📋 #${a.taskId} "${a.task.title}"\n${APPLICATION_STATUS_EMOJI[a.status] || '📌'} ${a.status}${submissionInfo}`;
    });

    await ctx.reply(`🗂 Your applications:\n\n${lines.join('\n\n')}`);
  });
}
