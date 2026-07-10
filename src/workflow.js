// Three independent state machines: a Task's lifecycle is separate from any
// individual contributor's Application against it, which is separate from
// each Submission (a versioned attempt) under that application.

export const TASK_STATUS = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
};

// Draft -> Open -> Closed -> (reopen) -> Open
const TASK_TRANSITIONS = {
  DRAFT: ['OPEN'],
  OPEN: ['CLOSED'],
  CLOSED: ['OPEN'],
};

export function canTransitionTask(from, to) {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTaskTransition(from, to) {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

export const APPLICATION_STATUS = {
  APPLIED: 'APPLIED',
  ASSIGNED: 'ASSIGNED',
  DECLINED: 'DECLINED',
  WITHDRAWN: 'WITHDRAWN',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
};

// Applied -> Assigned (admin, up to max_assignees)
// Applied -> Declined (not selected; may re-apply as a new Application)
// Applied -> Withdrawn
// Assigned -> Applied (admin unassign, records a reason)
// Assigned -> Completed (terminal; slot stays consumed)
// Assigned -> Rejected (terminal; slot freed)
const APPLICATION_TRANSITIONS = {
  APPLIED: ['ASSIGNED', 'DECLINED', 'WITHDRAWN'],
  ASSIGNED: ['APPLIED', 'COMPLETED', 'REJECTED'],
  DECLINED: [],
  WITHDRAWN: [],
  COMPLETED: [],
  REJECTED: [],
};

export function canTransitionApplication(from, to) {
  return APPLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertApplicationTransition(from, to) {
  if (!canTransitionApplication(from, to)) {
    throw new Error(`Invalid application transition: ${from} -> ${to}`);
  }
}

export const SUBMISSION_STATUS = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  NEEDS_REVISION: 'NEEDS_REVISION',
};

// Submitted -> Approved
// Submitted -> Rejected (terminal - also closes the assignment)
// Submitted -> Needs revision -> contributor submits a new version (a new Submission row)
const SUBMISSION_TRANSITIONS = {
  SUBMITTED: ['APPROVED', 'REJECTED', 'NEEDS_REVISION'],
  APPROVED: [],
  REJECTED: [],
  NEEDS_REVISION: [],
};

export function canTransitionSubmission(from, to) {
  return SUBMISSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertSubmissionTransition(from, to) {
  if (!canTransitionSubmission(from, to)) {
    throw new Error(`Invalid submission transition: ${from} -> ${to}`);
  }
}
