import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';
import { TASK_STATUS } from '../../workflow.js';

export function registerNewTask(bot) {
  bot.command('newtask', async (ctx) => {
    if (!isAdmin(ctx)) {
      return ctx.reply('Only admins can create tasks.');
    }

    const raw = ctx.message.text.split(' ').slice(1).join(' ');
    const [title, description, reward, requiredOutput] = raw.split('|').map((s) => s?.trim());

    if (!title || !description) {
      return ctx.reply(
        'Usage: /newtask <title> | <description> | <reward> | <required output>\n' +
          'Example: /newtask Write a Twitter thread | Introduce feature X in 5 tweets | 20 USDT | thread link'
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        reward: reward || null,
        requiredOutput: requiredOutput || null,
        status: TASK_STATUS.DRAFT,
        createdByTelegramId: BigInt(ctx.from.id),
        history: {
          create: {
            toStatus: TASK_STATUS.DRAFT,
            actorTelegramId: BigInt(ctx.from.id),
          },
        },
      },
    });

    await ctx.reply(
      `Created task #${task.id} (Draft): "${task.title}"\nUse /approve ${task.id} to approve and open it for contributors.`
    );
  });
}
