export const TASK_STATUS = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  OPEN: 'OPEN',
  CLAIMED: 'CLAIMED',
  SUBMITTED: 'SUBMITTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  REJECTED: 'REJECTED',
  REVIEWED: 'REVIEWED',
  COMPLETED: 'COMPLETED',
};

// Draft -> Approved -> Open -> Claimed -> Submitted -> Reviewed -> Completed,
// with Rejected / Revision-Requested branches off Submitted.
const ALLOWED_TRANSITIONS = {
  DRAFT: ['APPROVED'],
  APPROVED: ['OPEN'],
  OPEN: ['CLAIMED'],
  CLAIMED: ['SUBMITTED'],
  SUBMITTED: ['REVIEWED', 'REJECTED', 'REVISION_REQUESTED'],
  REVISION_REQUESTED: ['SUBMITTED'],
  REVIEWED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
};

export function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}
