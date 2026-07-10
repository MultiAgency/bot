// Candidate evaluation after registration (Twitter + Telegram signals).
//
// Telegram score is computed from real data we actually hold in this system
// (profile completeness + in-system track record). We deliberately do not
// fabricate signals we can't measure yet (group activity, response speed,
// spam detection) - those require a Telegram admin/userbot integration that
// isn't part of this build.
//
// Twitter score uses cookie-based (unofficial) profile access via
// src/twitterClient.js - see that file and README.md for the real risks
// (ToS violation, account ban). Returns null, not a fabricated score, when
// TWITTER_COOKIES isn't configured or the fetch fails for any reason.

import { fetchTwitterProfile } from './twitterClient.js';

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

// Lightweight heuristic over publicly-visible profile fields - not a
// substitute for the official API's richer signals (engagement rate,
// content relevance, etc. from PROPOSAL_V2.md), just what's cheaply
// available from a profile fetch.
function scoreTwitterProfile(profile) {
  const joinedMs = profile.joined ? new Date(profile.joined).getTime() : null;
  const ageYears = joinedMs ? (Date.now() - joinedMs) / (365 * 24 * 60 * 60 * 1000) : 0;
  const ageScore = clamp01(ageYears / 2); // full credit at 2+ years old

  const tweetsCount = profile.tweetsCount ?? profile.statusesCount ?? 0;
  const activityScore = clamp01(tweetsCount / 200);

  // Follower/following ratio as a light bot-farm signal: accounts that
  // follow thousands but have almost no followers score lower.
  const followers = profile.followersCount ?? 0;
  const following = profile.followingCount ?? profile.friendsCount ?? 0;
  const ratioScore = following === 0 ? (followers > 0 ? 1 : 0.3) : clamp01(followers / following / 2);

  const verifiedBonus = profile.isVerified || profile.isBlueVerified ? 0.15 : 0;

  return clamp01(ageScore * 0.3 + activityScore * 0.25 + ratioScore * 0.3 + verifiedBonus);
}

// Returns null when unscored (no TWITTER_COOKIES, profile not found, fetch
// failed) - callers must treat null as "unscored", not "zero trust".
// Never throws.
export async function computeTwitterScore(contributor) {
  if (!contributor.twitterHandle) return null;

  try {
    const profile = await fetchTwitterProfile(contributor.twitterHandle);
    if (!profile) return null;
    return scoreTwitterProfile(profile);
  } catch (err) {
    console.error(`Twitter profile fetch failed for @${contributor.twitterHandle}:`, err);
    return null;
  }
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

export async function evaluateCandidate(contributor) {
  const telegramScore = computeTelegramScore(contributor);
  const twitterScore = await computeTwitterScore(contributor);
  const socialTrustScore = computeSocialTrustScore(telegramScore, twitterScore);
  const eligibilityTier = deriveEligibilityTier(socialTrustScore, true);

  return { telegramScore, twitterScore, socialTrustScore, eligibilityTier };
}
