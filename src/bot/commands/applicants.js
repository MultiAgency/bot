import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { canManageTask, isAdmin } from '../roomAuth.js';
import { listRoomIdsForAdmin } from '../../rooms.js';
import { rankApplicationsForTask } from '../../routing.js';
import { APPLICATION_STATUS } from '../../workflow.js';
import { TIER_EMOJI } from '../emoji.js';
import { commandArgs } from '../commandArgs.js';

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

// Shared by "/applicants <id>" and the applicants_view:<id> button below -
// sends one card per applicant, ranked by match score, with Assign/Decline
// buttons on each.
async function showApplicantsForTask(ctx, id) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return ctx.reply(`❌ Task #${id} not found.`);

  if (!(await canManageTask(ctx, task))) {
    return ctx.reply("🚫 Only admins of this task's room (or global admins) can view applicants.");
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
}

export function registerApplicants(bot) {
  bot.command('applicants', async (ctx) => {
    const id = Number(commandArgs(ctx)[0]);
    if (id) return showApplicantsForTask(ctx, id);

    // No id given: list every task (scoped to the caller's admin rights)
    // that has at least one pending applicant, so they don't need to look
    // up an id via /alltasks first.
    const global = isAdmin(ctx);
    const roomIds = global ? null : await listRoomIdsForAdmin(ctx.from.id);
    if (!global && roomIds.length === 0) {
      return ctx.reply('🚫 Only admins can view applicants.');
    }

    const tasks = await prisma.task.findMany({
      where: {
        ...(global ? {} : { roomId: { in: roomIds } }),
        applications: { some: { status: APPLICATION_STATUS.APPLIED } },
      },
      include: { _count: { select: { applications: { where: { status: APPLICATION_STATUS.APPLIED } } } } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });

    if (tasks.length === 0) {
      return ctx.reply('📭 No tasks have pending applicants right now.');
    }

    await ctx.reply(`🙋 ${tasks.length} task${tasks.length === 1 ? '' : 's'} with pending applicants:`);
    for (const t of tasks) {
      const count = t._count.applications;
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('👀 View applicants', `applicants_view:${t.id}`),
      ]);
      await ctx.reply(`📋 Task #${t.id} "${t.title}" — 🙋 ${count} pending applicant${count === 1 ? '' : 's'}`, keyboard);
    }
  });

  bot.action(/^applicants_view:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await showApplicantsForTask(ctx, Number(ctx.match[1]));
  });
}
