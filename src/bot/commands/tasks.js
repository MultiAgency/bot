import { Markup } from 'telegraf';
import { prisma } from '../../db.js';
import { TASK_STATUS, APPLICATION_STATUS } from '../../workflow.js';
import { taskSummaryText } from './newTaskCore.js';

export function registerTasks(bot) {
  bot.command('tasks', async (ctx) => {
    const openTasks = await prisma.task.findMany({
      where: { status: TASK_STATUS.OPEN },
      include: { applications: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    if (openTasks.length === 0) {
      return ctx.reply('📭 No open tasks right now.');
    }

    await ctx.reply(`📢 ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}:`);

    for (const t of openTasks) {
      const assignedCount = t.applications.filter((a) => a.status === APPLICATION_STATUS.ASSIGNED).length;
      const text = taskSummaryText(t, {
        heading: `📋 Task #${t.id} (👥 ${assignedCount}/${t.maxAssignees} assigned)`,
      });
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('🙋 Apply', `task_apply:${t.id}`),
        Markup.button.callback('❌ Cancel', 'task_dismiss'),
      ]);
      await ctx.reply(text, keyboard);
    }
  });
}
