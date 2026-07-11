// Shared emoji vocabulary so status/outcome icons stay consistent across
// every command's messages instead of each file picking its own.
export const TASK_STATUS_EMOJI = { DRAFT: '📝', OPEN: '🔓', CLOSED: '🔒' };

export const APPLICATION_STATUS_EMOJI = {
  APPLIED: '🙋',
  ASSIGNED: '✍️',
  DECLINED: '👎',
  WITHDRAWN: '✋',
  COMPLETED: '✅',
  REJECTED: '❌',
};

export const SUBMISSION_STATUS_EMOJI = {
  SUBMITTED: '📤',
  APPROVED: '✅',
  REJECTED: '❌',
  NEEDS_REVISION: '🔄',
};

export const TIER_EMOJI = {
  NEW: '🌱',
  VERIFIED: '🔵',
  TRUSTED: '🟢',
  HIGH_TRUST: '🌟',
  RESTRICTED: '⛔',
};
