// Candidate evaluation after registration (Twitter + Telegram signals).
//
// Telegram score is computed from real data we actually hold in this system
// (profile completeness + in-system track record). We deliberately do not
// fabricate signals we can't measure yet (group activity, response speed,
// spam detection) - those require a Telegram admin/userbot integration that
// isn't part of this build.
//
// Twitter score requires the X API (paid tiers only for meaningful read
// access) - left as a stub until TWITTER_BEARER_TOKEN is configured, so the
// rest of the scoring/routing pipeline can run without blocking on that
// decision.

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

export function computeTelegramScore(contributor) {
  let score = 0.3; // base score for having linked a Telegram account with the bot

  if (contributor.telegramUsername) score += 0.2;
  if (contributor.displayName) score += 0.1;

  const total = contributor.completedTaskCount + contributor.rejectedSubmissionCount;
  if (total > 0) {
    const successRate = contributor.completedTaskCount / total;
    score += successRate * 0.4;
  }

  return clamp01(score);
}

// Returns null until a real Twitter/X API client is configured - callers
// must treat null as "unscored", not "zero trust".
export function computeTwitterScore(_contributor) {
  if (!process.env.TWITTER_BEARER_TOKEN) return null;
  throw new Error('TWITTER_BEARER_TOKEN is set but the X API client is not implemented yet.');
}

export function computeSocialTrustScore(telegramScore, twitterScore) {
  if (twitterScore == null) return telegramScore;
  return clamp01(telegramScore * 0.5 + twitterScore * 0.5);
}

export function deriveEligibilityTier(socialTrustScore, isRegistered) {
  if (!isRegistered) return 'NEW';
  if (socialTrustScore >= 0.75) return 'HIGH_TRUST';
  if (socialTrustScore >= 0.55) return 'TRUSTED';
  if (socialTrustScore >= 0.35) return 'VERIFIED';
  return 'NEW';
}

export function evaluateCandidate(contributor) {
  const telegramScore = computeTelegramScore(contributor);
  const twitterScore = computeTwitterScore(contributor);
  const socialTrustScore = computeSocialTrustScore(telegramScore, twitterScore);
  const eligibilityTier = deriveEligibilityTier(socialTrustScore, true);

  return { telegramScore, twitterScore, socialTrustScore, eligibilityTier };
}
