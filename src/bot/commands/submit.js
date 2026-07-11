import { validateAssignmentForSubmission, submitTextOrLink, replyForTextSubmission } from './submitCore.js';
import { setPending } from '../pendingActions.js';
import { commandArgs } from '../commandArgs.js';

export function registerSubmit(bot) {
  bot.command('submit', async (ctx) => {
    const parts = commandArgs(ctx);
    const id = Number(parts[0]);
    const content = parts.slice(1).join(' ').trim();

    if (!id) {
      return ctx.reply(
        'ℹ️ Usage: /submit <task_id> <content or link>\n' +
          '💡 Or just "/submit <task_id>" and then send your text, link, video, photo, or file next.'
      );
    }

    const { application, error } = await validateAssignmentForSubmission(ctx, id);
    if (error) return ctx.reply(error);

    if (!content) {
      setPending(ctx.from.id, 'submission', { taskId: id });
      return ctx.reply(
        `📤 Ready for your submission for task #${id}. Send text, a link, video, photo, or file within 5 minutes.`
      );
    }

    const submissionFileMetadata = await submitTextOrLink(ctx, application, content);
    await replyForTextSubmission(ctx, id, submissionFileMetadata);
  });
}
