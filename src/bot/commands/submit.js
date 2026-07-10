import { convertUrlToFile } from '../../ai/urlToFile.js';
import { validateClaimForSubmission, finalizeSubmission } from './submitCore.js';

export function registerSubmit(bot) {
  bot.command('submit', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const id = Number(parts[1]);
    const content = parts.slice(2).join(' ').trim();

    if (!id || !content) {
      return ctx.reply(
        'Usage: /submit <task_id> <content or link>\n' +
          'Or send a video/photo/document with "/submit <task_id>" as the caption.'
      );
    }

    const { task, error } = await validateClaimForSubmission(ctx, id);
    if (error) return ctx.reply(error);

    const isUrl = /^https?:\/\//i.test(content);
    const submissionType = isUrl ? 'LINK' : 'TEXT';

    // Standardize URL submissions into a stored file (Jina Reader) so AI and
    // reviewers analyze content, not a live URL (PROPOSAL_V2.md, Submit step).
    let sourceUrl = null;
    let submissionFileMetadata = null;
    if (isUrl) {
      sourceUrl = content;
      submissionFileMetadata = await convertUrlToFile(content);
    }

    await finalizeSubmission(ctx, task, {
      submissionType,
      submissionContent: content,
      sourceUrl,
      submissionFileMetadata,
    });

    if (submissionFileMetadata?.conversionFailed) {
      await ctx.reply(
        `Submitted, but the link couldn't be auto-converted (${submissionFileMetadata.error}). ` +
          'The reviewer will need to open it manually.'
      );
    } else {
      await ctx.reply(`Submitted your result for task #${id}. Waiting for reviewer approval.`);
    }
  });
}
