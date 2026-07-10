export const TASK_STATUS = {
  SIGNAL: 'SIGNAL',
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  ROUTED: 'ROUTED',
  CLAIMED: 'CLAIMED',
  SUBMITTED: 'SUBMITTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  REJECTED: 'REJECTED',
  REVIEWED: 'REVIEWED',
  AMPLIFIED: 'AMPLIFIED',
  COMPLETED: 'COMPLETED',
};

// Signal/request -> Reason&draft -> Human approval -> Route -> Claim -> Submit
// -> Review -> Amplify -> Completed, with Rejected / Revision-Requested
// branches off Submitted, and Amplify optional before Completed.
const ALLOWED_TRANSITIONS = {
  SIGNAL: ['DRAFT'],
  DRAFT: ['APPROVED'],
  APPROVED: ['ROUTED'],
  ROUTED: ['CLAIMED'],
  CLAIMED: ['SUBMITTED'],
  SUBMITTED: ['REVIEWED', 'REJECTED', 'REVISION_REQUESTED'],
  REVISION_REQUESTED: ['SUBMITTED'],
  REVIEWED: ['AMPLIFIED', 'COMPLETED'],
  AMPLIFIED: ['COMPLETED'],
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
