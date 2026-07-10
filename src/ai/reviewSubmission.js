import { summarizeSubmission, reviewSubmissionImage } from './claude.js';

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
    const fileLink = await ctx.telegram.getFileLink(task.submissionFileId);
    const response = await fetch(fileLink.href ?? fileLink.toString());
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const mediaType = response.headers.get('content-type') || 'image/jpeg';
    return reviewSubmissionImage(buffer.toString('base64'), mediaType, task);
  }

  // FILE (video/document): Claude's API doesn't accept video input, and we
  // don't parse arbitrary documents yet - left for a later pass.
  return null;
}
