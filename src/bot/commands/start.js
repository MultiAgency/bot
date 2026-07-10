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
      '/register <twitter_handle> - register and get evaluated before you can claim tasks',
      '/tasks - view routed/open tasks',
      '/claim <id> - claim a task',
      '/submit <id> <content or link> - submit your result',
      '/status <id> - view task status',
    ];

    if (isAdmin(ctx)) {
      lines.push(
        '',
        'Admin commands:',
        '/newtask <title> | <description> | <reward> | <required output> - create a task (Draft)',
        '/approve <id> - approve a task (Draft -> Approved)',
        '/route <id> - match candidates and open the task (Approved -> Routed)',
        '/review <id> approve|reject|revise [note] - handle a submission',
        '/amplify <id> [note] - mark a reviewed task as amplified',
        '/complete <id> - close out a task (updates contributor stats)',
        '/enablesignals - turn on auto-drafting from this group\'s messages',
        '/disablesignals - turn it off for this group',
        '/signalstatus - check whether this chat is being watched',
      );
    }

    await ctx.reply(lines.join('\n'));
  });
}
