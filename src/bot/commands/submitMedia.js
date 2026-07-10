import { validateClaimForSubmission, finalizeSubmission } from './submitCore.js';
import { getTaskManagerIds } from '../notifyAdmins.js';

// Native Telegram uploads are already a "standardized file" in the sense
// PROPOSAL_V2.md means (a stored reference, not a live URL) - no conversion
// step needed like URL submissions get.
const CAPTION_PATTERN = /^\/submit\s+(\d+)\b\s*(.*)$/is;

function parseSubmitCaption(ctx) {
  const caption = ctx.message.caption;
  if (!caption) return null;
  const match = caption.match(CAPTION_PATTERN);
  if (!match) return null;
  return { id: Number(match[1]), note: match[2].trim() || null };
}

async function forwardToTaskManagers(ctx, task) {
  const recipients = await getTaskManagerIds(task);
  await Promise.allSettled(
    recipients.map((id) => ctx.telegram.copyMessage(id, ctx.chat.id, ctx.message.message_id))
  );
}

function registerMediaSubmit(bot, updateType, { submissionType, fileId, label }) {
  bot.on(updateType, async (ctx) => {
    const parsed = parseSubmitCaption(ctx);
    if (!parsed) return; // not a submission attempt - ignore silently

    const { task, error } = await validateClaimForSubmission(ctx, parsed.id);
    if (error) return ctx.reply(error);

    await finalizeSubmission(ctx, task, {
      submissionType,
      submissionContent: parsed.note,
      submissionFileId: fileId(ctx),
    });

    await forwardToTaskManagers(ctx, task);
    await ctx.reply(`Submitted your ${label} for task #${parsed.id}. Waiting for reviewer approval.`);
  });
}

export function registerSubmitMedia(bot) {
  registerMediaSubmit(bot, 'video', {
    submissionType: 'FILE',
    fileId: (ctx) => ctx.message.video.file_id,
    label: 'video',
  });

  registerMediaSubmit(bot, 'document', {
    submissionType: 'FILE',
    fileId: (ctx) => ctx.message.document.file_id,
    label: 'file',
  });

  registerMediaSubmit(bot, 'photo', {
    submissionType: 'SCREENSHOT',
    fileId: (ctx) => ctx.message.photo[ctx.message.photo.length - 1].file_id,
    label: 'screenshot',
  });
}
