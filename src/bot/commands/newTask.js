import { prisma } from '../../db.js';
import { isAdmin, canManageRoom } from '../roomAuth.js';
import { getOrCreateRoom } from '../../rooms.js';
import { TASK_STATUS } from '../../workflow.js';

export function registerNewTask(bot) {
  bot.command('newtask', async (ctx) => {
    const isPrivate = ctx.chat.type === 'private';
    const room = isPrivate ? null : await getOrCreateRoom(ctx.chat.id, ctx.chat.title);

    const allowed = isPrivate ? isAdmin(ctx) : await canManageRoom(ctx, room.id);
    if (!allowed) {
      return ctx.reply(
        isPrivate
          ? 'Only global admins can create tasks via DM.'
          : 'Only admins of this room (or global admins) can create tasks here.'
      );
    }

    const raw = ctx.message.text.split(' ').slice(1).join(' ');
    const [title, description, reward, requiredOutput, category, skillsRaw] = raw
      .split('|')
      .map((s) => s?.trim());

    if (!title || !description) {
      return ctx.reply(
        'Usage: /newtask <title> | <description> | <reward> | <required output> | [category] | [skill1,skill2]\n' +
          'Example: /newtask Write a Twitter thread | Introduce feature X in 5 tweets | 20 USDT | thread link | content | twitter,writing'
      );
    }

    const requiredSkills = skillsRaw ? skillsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const task = await prisma.task.create({
      data: {
        title,
        description,
        reward: reward || null,
        requiredOutput: requiredOutput || null,
        category: category || null,
        requiredSkills,
        roomId: room?.id ?? null,
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
      `Created task #${task.id} (Draft): "${task.title}"\nUse /approve ${task.id}, then /route ${task.id} to match candidates and open it up.`
    );
  });
}
