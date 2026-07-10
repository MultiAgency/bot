// Rule-based Match Score, per PROPOSAL_V2.md:
// 30% Skill Fit + 20% Reputation + 15% Past Performance +
// 15% Social Trust (Twitter + Telegram) + 10% Availability + 10% Preference
const WEIGHTS = {
  skillFit: 0.3,
  reputation: 0.2,
  pastPerformance: 0.15,
  socialTrust: 0.15,
  availability: 0.1,
  preference: 0.1,
};

const MAX_CONCURRENT_TASKS = 3;

function skillFitScore(requiredSkills, contributorSkills) {
  if (!requiredSkills?.length) return 0.5; // no requirement stated, neutral fit
  if (!contributorSkills?.length) return 0;
  const overlap = requiredSkills.filter((s) => contributorSkills.includes(s)).length;
  return overlap / requiredSkills.length;
}

function reputationScore(contributor) {
  const total = contributor.completedTaskCount + contributor.rejectedSubmissionCount;
  if (total === 0) return 0.5; // no track record yet, neutral
  return contributor.completedTaskCount / total;
}

function pastPerformanceScore(contributor) {
  // Diminishing-returns curve so a handful of completions already scores well.
  return Math.min(1, contributor.completedTaskCount / 5);
}

function socialTrustScore(contributor) {
  if (contributor.socialTrustScore != null) return clamp01(contributor.socialTrustScore);
  return 0.3; // unregistered / unscored candidates are deprioritized, not excluded
}

function availabilityScore(activeTaskCount) {
  return clamp01(1 - activeTaskCount / MAX_CONCURRENT_TASKS);
}

function preferenceScore(category, contributor) {
  if (!category || !contributor.preferredCategories?.length) return 0.5;
  return contributor.preferredCategories.includes(category) ? 1 : 0.3;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function computeMatchScore(task, contributor, activeTaskCount) {
  const score =
    WEIGHTS.skillFit * skillFitScore(task.requiredSkills, contributor.skillTags) +
    WEIGHTS.reputation * reputationScore(contributor) +
    WEIGHTS.pastPerformance * pastPerformanceScore(contributor) +
    WEIGHTS.socialTrust * socialTrustScore(contributor) +
    WEIGHTS.availability * availabilityScore(activeTaskCount) +
    WEIGHTS.preference * preferenceScore(task.category, contributor);

  return Math.round(score * 100) / 100;
}

// eligibilityTier gates whether a candidate can be routed high-risk/sensitive
// work at all; RESTRICTED candidates are excluded from routing entirely.
export function isRoutable(contributor) {
  return contributor.eligibilityTier !== 'RESTRICTED';
}

// activeTaskCounts: optional Map<contributorId, number> of currently in-flight
// tasks (CLAIMED/SUBMITTED/REVISION_REQUESTED). Falls back to a rough estimate
// from claimed/completed counters when not supplied by the caller.
export function rankCandidates(task, candidates, activeTaskCounts = new Map()) {
  return candidates
    .filter(isRoutable)
    .map((c) => {
      const activeTaskCount =
        activeTaskCounts.get(c.id) ?? Math.max(0, c.claimedTaskCount - c.completedTaskCount);
      return { contributor: c, score: computeMatchScore(task, c, activeTaskCount) };
    })
    .sort((a, b) => b.score - a.score);
}
