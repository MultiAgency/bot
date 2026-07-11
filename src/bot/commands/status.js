import { prisma } from '../../db.js';
import { APPLICATION_STATUS } from '../../workflow.js';
import { TASK_STATUS_EMOJI, APPLICATION_STATUS_EMOJI, SUBMISSION_STATUS_EMOJI } from '../emoji.js';

export function registerStatus(bot) {
  bot.command('status', async (ctx) => {
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('ℹ️ Usage: /status <task_id>');

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        applications: {
          include: { contributor: true, submissions: { orderBy: { version: 'desc' }, take: 1 } },
          orderBy: { createdAt: 'asc' },
        },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!task) return ctx.reply(`❌ Task #${id} not found.`);

    const assignedCount = task.applications.filter((a) => a.status === APPLICATION_STATUS.ASSIGNED).length;

    const lines = [
      `📋 #${task.id} "${task.title}"`,
      `${TASK_STATUS_EMOJI[task.status] || '📌'} ${task.status} · 👥 ${assignedCount}/${task.maxAssignees} assigned`,
      '',
      '🙋 Applications:',
    ];

    if (task.applications.length === 0) {
      lines.push('(none yet)');
    } else {
      for (const a of task.applications) {
        const who = a.contributor.displayName || a.contributor.telegramUsername || a.contributor.id;
        const latest = a.submissions[0];
        const submissionInfo = latest
          ? ` — ${SUBMISSION_STATUS_EMOJI[latest.status] || '📄'} submission v${latest.version}: ${latest.status}`
          : '';
        lines.push(`#${a.id} ${who} — ${APPLICATION_STATUS_EMOJI[a.status] || '📌'} ${a.status}${submissionInfo}`);
      }
    }

    lines.push('', '🕓 Task history:');
    lines.push(...task.history.map((h) => `${TASK_STATUS_EMOJI[h.toStatus] || '•'} ${h.toStatus} (${h.createdAt.toISOString()})`));

    await ctx.reply(lines.join('\n'));
  });
}
