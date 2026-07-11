import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { rankApplicationsForTask } from '../../routing.js';
import { APPLICATION_STATUS } from '../../workflow.js';

export function registerApplicants(bot) {
  bot.command('applicants', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('ℹ️ Usage: /applicants <task_id>');

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return ctx.reply(`❌ Task #${id} not found.`);

    if (!(await canManageTask(ctx, task))) {
      return ctx.reply('🚫 Only admins of this task\'s room (or global admins) can view applicants.');
    }

    const assignedCount = await prisma.application.count({
      where: { taskId: id, status: APPLICATION_STATUS.ASSIGNED },
    });

    const ranked = await rankApplicationsForTask(task);
    if (ranked.length === 0) {
      return ctx.reply(`📭 No pending applicants for task #${id} (👥 ${assignedCount}/${task.maxAssignees} assigned).`);
    }

    const lines = ranked.map(({ application, score }, i) => {
      const c = application.contributor;
      return `${i + 1}. 🎯 application #${application.id} — ${c.displayName || c.telegramUsername || c.id} (📊 score ${score ?? 'n/a'})`;
    });

    await ctx.reply(
      [
        `🏆 Applicants for task #${id} (👥 ${assignedCount}/${task.maxAssignees} assigned):`,
        ...lines,
        '',
        '✍️ Use /assign <application_id> or 👎 /decline <application_id> [note].',
      ].join('\n')
    );
  });
}
