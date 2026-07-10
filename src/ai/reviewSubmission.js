import { summarizeSubmission, reviewSubmissionImage, reviewSubmissionDocument } from './claude.js';

async function downloadTelegramFile(ctx, fileId) {
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const response = await fetch(fileLink.href ?? fileLink.toString());
  if (!response.ok) return null;
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  };
}

// Best-effort automated pre-review for a human reviewer, branched by
// submission type. Returns null when there's nothing to analyze (e.g. no
// content, or a file type we don't support yet) - callers should treat that
// as "no AI note", not an error. Never approves/rejects anything itself.
export async function reviewSubmission(ctx, task) {
  if (task.submissionType === 'TEXT' || task.submissionType === 'LINK') {
    const content = task.submissionFileMetadata?.convertedText || task.submissionContent;
    if (!content) return null;
    return summarizeSubmission(content, task);
  }

  if (task.submissionType === 'SCREENSHOT' && task.submissionFileId) {
    const file = await downloadTelegramFile(ctx, task.submissionFileId);
    if (!file) return null;
    return reviewSubmissionImage(file.buffer.toString('base64'), file.contentType || 'image/jpeg', task);
  }

  if (task.submissionType === 'FILE' && task.submissionFileMetadata?.mimeType === 'application/pdf' && task.submissionFileId) {
    const file = await downloadTelegramFile(ctx, task.submissionFileId);
    if (!file) return null;
    return reviewSubmissionDocument(file.buffer.toString('base64'), task);
  }

  // FILE (video, or non-PDF documents): Claude's API doesn't accept video
  // input, and only PDFs are supported for documents - left for a later pass.
  return null;
}
