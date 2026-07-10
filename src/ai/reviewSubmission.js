import mammoth from 'mammoth';
import { summarizeSubmission, reviewSubmissionImage, reviewSubmissionDocument } from './claude.js';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PLAIN_TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown', 'text/csv']);

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
// submission type. `submission` carries the content/file fields, `task`
// carries the title/description/requiredOutput context. Returns null when
// there's nothing to analyze (e.g. no content, or a file type we don't
// support yet) - callers should treat that as "no AI note", not an error.
// Never approves/rejects anything itself.
export async function reviewSubmission(ctx, submission, task) {
  if (submission.submissionType === 'TEXT' || submission.submissionType === 'LINK') {
    const content = submission.submissionFileMetadata?.convertedText || submission.submissionContent;
    if (!content) return null;
    return summarizeSubmission(content, task);
  }

  if (submission.submissionType === 'SCREENSHOT' && submission.submissionFileId) {
    const file = await downloadTelegramFile(ctx, submission.submissionFileId);
    if (!file) return null;
    return reviewSubmissionImage(file.buffer.toString('base64'), file.contentType || 'image/jpeg', task);
  }

  if (submission.submissionType === 'FILE' && submission.submissionFileId) {
    const mimeType = submission.submissionFileMetadata?.mimeType;

    if (mimeType === 'application/pdf') {
      const file = await downloadTelegramFile(ctx, submission.submissionFileId);
      if (!file) return null;
      return reviewSubmissionDocument(file.buffer.toString('base64'), task);
    }

    // .docx and plain-text-ish files are extracted locally (no API cost,
    // no external service) and reviewed as text, same as a text submission.
    if (mimeType === DOCX_MIME_TYPE) {
      const file = await downloadTelegramFile(ctx, submission.submissionFileId);
      if (!file) return null;
      const { value: text } = await mammoth.extractRawText({ buffer: file.buffer });
      if (!text?.trim()) return null;
      return summarizeSubmission(text, task);
    }

    if (mimeType && PLAIN_TEXT_MIME_TYPES.has(mimeType)) {
      const file = await downloadTelegramFile(ctx, submission.submissionFileId);
      if (!file) return null;
      const text = file.buffer.toString('utf-8');
      if (!text.trim()) return null;
      return summarizeSubmission(text, task);
    }
  }

  // Video, or document types not handled above (e.g. legacy .doc, .xlsx,
  // images embedded in other formats): Claude's API doesn't accept video
  // input, and these aren't parsed yet - left for a later pass.
  return null;
}
