import { prisma } from '../../db.js';
import { isAdmin } from '../isAdmin.js';

function buildGuideLines(ctx) {
  const lines = [
    'Welcome to the MultiAgency Contributor Bot!',
    '',
    'Contributor commands:',
    '/onboard <twitter_handle> - register and get evaluated before you can apply to tasks',
    '/tasks - view open tasks',
    '/apply <id> - apply to a task (admin assigns from applicants)',
    '/withdraw <id> - withdraw your (unassigned) application',
    '/mytasks - view your applications and their status',
    '/submit <id> <content or link> - submit text or a link for a task you\'re assigned to',
    'To submit a video, photo, or file: send it with "/submit <id>" as the caption, ' +
      'or just "/submit <id>" alone and then send it within 5 minutes',
    '/status <id> - view a task\'s applications and history',
    '/cancel - cancel a pending submission or task draft',
    '/help - show this guide again',
  ];

  if (isAdmin(ctx)) {
    lines.push(
      '',
      'Admin commands (also usable by room admins, scoped to their room):',
      '/newtask <title> | <description> | <reward> | <required output> | [category] | [skills] | [max_assignees] - create a task (Draft), or just "/newtask" for a step-by-step wizard',
      '/drafttask <short prompt> - let Claude draft the task for you (Draft)',
      '/drafts - list pending drafts awaiting approval',
      '/alltasks [status] - list every task (optionally filtered by status)',
      '/approve <id> - approve a task (Draft -> Open) and nudge top-matched contributors to apply',
      '/close <id> / /reopen <id> - Open <-> Closed',
      '/applicants <id> - list a task\'s applicants ranked by match score',
      '/assign <application_id> - assign an applicant (up to the task\'s max_assignees)',
      '/decline <application_id> [note] - decline an applicant (they may re-apply)',
      '/unassign <application_id> <reason> - unassign a contributor, freeing the slot',
      '/review <application_id> approve|reject|revise [note] - handle that application\'s latest submission',
      '/enablesignals - turn on auto-drafting from this group\'s messages',
      '/disablesignals - turn it off for this group',
      '/signalstatus - check whether this chat is being watched',
      '',
      'Room admin management (run inside a group):',
      '/addroomadmin - reply to a user\'s message to make them a room admin',
      '/removeroomadmin - reply to a room admin\'s message to remove them',
      '/roomadmins - list this room\'s admins',
    );
  }

  return lines;
}

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

    await ctx.reply(buildGuideLines(ctx).join('\n'));
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(buildGuideLines(ctx).join('\n'));
  });
}
