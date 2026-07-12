import mammoth from 'mammoth';
import { reviewSubmissionGraph } from './graphs/reviewSubmission.js';

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

// Normalizes any supported submission into the graph's input shape:
// { kind: 'text' | 'image' | 'pdf', payload, mediaType? }. Returns null for
// unsupported types (video, legacy .doc, .xlsx, etc.) or when there's
// nothing to analyze - callers should treat that as "no AI note".
async function normalizeSubmission(ctx, submission) {
  if (submission.submissionType === 'TEXT' || submission.submissionType === 'LINK') {
    const content = submission.submissionFileMetadata?.convertedText || submission.submissionContent;
    if (!content) return null;
    return { kind: 'text', payload: content };
  }

  if (submission.submissionType === 'SCREENSHOT' && submission.submissionFileId) {
    const file = await downloadTelegramFile(ctx, submission.submissionFileId);
    if (!file) return null;
    return {
      kind: 'image',
      payload: file.buffer.toString('base64'),
      mediaType: file.contentType || 'image/jpeg',
    };
  }

  if (submission.submissionType === 'FILE' && submission.submissionFileId) {
    const mimeType = submission.submissionFileMetadata?.mimeType;

    if (mimeType === 'application/pdf') {
      const file = await downloadTelegramFile(ctx, submission.submissionFileId);
      if (!file) return null;
      return { kind: 'pdf', payload: file.buffer.toString('base64') };
    }

    // .docx and plain-text-ish files are extracted locally (no API cost,
    // no external service) and reviewed as text, same as a text submission.
    if (mimeType === DOCX_MIME_TYPE) {
      const file = await downloadTelegramFile(ctx, submission.submissionFileId);
      if (!file) return null;
      const { value: text } = await mammoth.extractRawText({ buffer: file.buffer });
      if (!text?.trim()) return null;
      return { kind: 'text', payload: text };
    }

    if (mimeType && PLAIN_TEXT_MIME_TYPES.has(mimeType)) {
      const file = await downloadTelegramFile(ctx, submission.submissionFileId);
      if (!file) return null;
      const text = file.buffer.toString('utf-8');
      if (!text.trim()) return null;
      return { kind: 'text', payload: text };
    }
  }

  return null;
}

// Best-effort automated pre-review for a human reviewer, routed through the
// reviewSubmission LangGraph. Returns null when there's nothing to analyze;
// never approves/rejects anything itself.
export async function reviewSubmission(ctx, submission, task) {
  const normalized = await normalizeSubmission(ctx, submission);
  if (!normalized) return null;
  const state = await reviewSubmissionGraph.invoke({ ...normalized, task });
  return state.note ?? null;
}
