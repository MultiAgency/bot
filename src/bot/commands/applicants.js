import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { canManageTask } from '../roomAuth.js';
import { rankApplicationsForTask } from '../../routing.js';
import { APPLICATION_STATUS } from '../../workflow.js';
import { TIER_EMOJI } from '../emoji.js';

function applicantCardText(taskId, rank, application, score) {
  const c = application.contributor;
  return [
    `🎯 Application #${application.id} for Task #${taskId} (#${rank})`,
    `👤 ${c.displayName || c.telegramUsername || c.id}${c.telegramUsername ? ` (@${c.telegramUsername})` : ''}`,
    `📊 Match score: ${score ?? 'n/a'}`,
    `${TIER_EMOJI[c.eligibilityTier] || '🏷️'} Trust tier: ${c.eligibilityTier}`,
    `💼 Role: ${c.jobRole || '(not set)'}`,
    `🛠️ Skills: ${c.skillTags?.length ? c.skillTags.join(', ') : '(none)'}`,
    `✅ Completed: ${c.completedTaskCount}  ❌ Rejected: ${c.rejectedSubmissionCount}`,
  ].join('\n');
}

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

    await ctx.reply(
      `🏆 ${ranked.length} applicant${ranked.length === 1 ? '' : 's'} for task #${id} (👥 ${assignedCount}/${task.maxAssignees} assigned), ranked by match score:`
    );

    for (const [i, { application, score }] of ranked.entries()) {
      const text = applicantCardText(id, i + 1, application, score);
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('✍️ Assign', `application_assign:${application.id}`),
        Markup.button.callback('👎 Decline', `application_decline:${application.id}`),
      ]);
      await ctx.reply(text, keyboard);
    }
  });
}
