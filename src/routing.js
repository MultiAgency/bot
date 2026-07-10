import { prisma } from './db.js';
import { rankCandidates } from './matching.js';
import { TASK_STATUS } from './workflow.js';

const ACTIVE_STATUSES = [TASK_STATUS.CLAIMED, TASK_STATUS.SUBMITTED, TASK_STATUS.REVISION_REQUESTED];

// Shared by /route (initial routing) and the reroute scheduler
// (src/scheduler.js): fetches eligible candidates and their current
// workload, then scores them against the task via matching.js.
export async function rankCandidatesForTask(task, { excludeContributorIds = [] } = {}) {
  const candidates = await prisma.contributor.findMany({
    where: {
      isRegistered: true,
      ...(excludeContributorIds.length ? { id: { notIn: excludeContributorIds } } : {}),
    },
  });

  const activeCounts = await prisma.task.groupBy({
    by: ['assignedContributorId'],
    where: { status: { in: ACTIVE_STATUSES }, assignedContributorId: { not: null } },
    _count: true,
  });
  const activeTaskCounts = new Map(activeCounts.map((c) => [c.assignedContributorId, c._count]));

  return rankCandidates(task, candidates, activeTaskCounts);
}
