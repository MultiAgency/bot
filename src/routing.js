import { prisma } from './db.js';
import { rankCandidates, computeMatchScore } from './matching.js';
import { APPLICATION_STATUS } from './workflow.js';

// Shared by the approve-time candidate nudge and /applicants: fetches
// eligible candidates and their current workload (count of ASSIGNED
// applications), then scores them against the task via matching.js.
export async function rankCandidatesForTask(task, { excludeContributorIds = [] } = {}) {
  const candidates = await prisma.contributor.findMany({
    where: {
      isRegistered: true,
      ...(excludeContributorIds.length ? { id: { notIn: excludeContributorIds } } : {}),
    },
  });

  const activeCounts = await prisma.application.groupBy({
    by: ['contributorId'],
    where: { status: APPLICATION_STATUS.ASSIGNED },
    _count: true,
  });
  const activeTaskCounts = new Map(activeCounts.map((c) => [c.contributorId, c._count]));

  return rankCandidates(task, candidates, activeTaskCounts);
}

// Ranks a specific task's Applied applications (not the whole registered
// pool) by match score, for /applicants to help an admin decide who to
// /assign.
export async function rankApplicationsForTask(task) {
  const applications = await prisma.application.findMany({
    where: { taskId: task.id, status: APPLICATION_STATUS.APPLIED },
    include: { contributor: true },
  });

  const activeCounts = await prisma.application.groupBy({
    by: ['contributorId'],
    where: { status: APPLICATION_STATUS.ASSIGNED },
    _count: true,
  });
  const activeTaskCounts = new Map(activeCounts.map((c) => [c.contributorId, c._count]));

  const ranked = rankCandidates(
    task,
    applications.map((a) => a.contributor),
    activeTaskCounts
  );

  const scoreByContributorId = new Map(ranked.map((r) => [r.contributor.id, r.score]));
  return applications
    .map((a) => ({ application: a, score: scoreByContributorId.get(a.contributorId) ?? null }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

// Single-candidate score for /apply, so the applicant's matchScore is
// stored even though they aren't being ranked against the full pool.
export async function scoreApplicant(task, contributor) {
  const activeCount = await prisma.application.count({
    where: { contributorId: contributor.id, status: APPLICATION_STATUS.ASSIGNED },
  });
  return computeMatchScore(task, contributor, activeCount);
}
