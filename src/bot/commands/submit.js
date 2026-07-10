import { validateClaimForSubmission, submitTextOrLink, replyForTextSubmission } from './submitCore.js';
import { setPending } from '../pendingActions.js';

export function registerSubmit(bot) {
  bot.command('submit', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const content = parts.slice(2).join(' ').trim();

    if (!id) {
      return ctx.reply(
        'Usage: /submit <task_id> <content or link>\n' +
          'Or just "/submit <task_id>" and then send your text, link, video, photo, or file next.'
      );
    }

    const { task, error } = await validateClaimForSubmission(ctx, id);
    if (error) return ctx.reply(error);

    if (!content) {
      setPending(ctx.from.id, 'submission', { taskId: id });
      return ctx.reply(
        `Ready for your submission for task #${id}. Send text, a link, video, photo, or file within 5 minutes.`
      );
    }

    const submissionFileMetadata = await submitTextOrLink(ctx, task, content);
    await replyForTextSubmission(ctx, id, submissionFileMetadata);
  });
}
