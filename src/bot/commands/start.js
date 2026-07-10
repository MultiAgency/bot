import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';

export function registerStart(bot) {
  bot.start(async (ctx) => {
    await prisma.contributor.upsert({
      where: { telegramUserId: BigInt(ctx.from.id) },
      update: {
        telegramUsername: ctx.from.username ?? null,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      },
      create: {
        telegramUserId: BigInt(ctx.from.id),
        telegramUsername: ctx.from.username ?? null,
        displayName: [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '),
      },
    });

    const lines = [
      'Welcome to the MultiAgency Contributor Bot!',
      '',
      'Contributor commands:',
      '/tasks - view open tasks',
      '/claim <id> - claim a task',
      '/submit <id> <content or link> - submit your result',
      '/status <id> - view task status',
    ];

    if (isAdmin(ctx)) {
      lines.push(
        '',
        'Admin commands:',
        '/newtask <title> | <description> | <reward> | <required output> - create a task (Draft)',
        '/approve <id> - approve a task (Draft -> Open)',
        '/review <id> approve|reject|revise [note] - handle a submission',
      );
    }

    await ctx.reply(lines.join('\n'));
  });
}
