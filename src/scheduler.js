import { prisma } from './db.js';
import { TASK_STATUS } from './workflow.js';
import { rankCandidatesForTask } from './routing.js';
import { getTaskManagerIds } from './bot/notifyAdmins.js';

const LOCK_MINUTES = Number(process.env.ROUTE_LOCK_MINUTES || 30);
const CHECK_INTERVAL_MINUTES = Number(process.env.ROUTE_CHECK_INTERVAL_MINUTES || 10);
const MAX_REROUTES = Number(process.env.ROUTE_MAX_REROUTES || 3);

// Finds ROUTED tasks whose claim lock has expired while still unclaimed, and
// either reroutes to the next-best candidate (excluding everyone already
// tried) or, once MAX_REROUTES is hit or no candidates remain, opens the
// task to any registered contributor. Runs in-process via setInterval since
// this bot is a single long-running instance (see DEPLOY.md) - no external
// scheduler needed.
async function checkExpiredRoutes(telegram) {
  const cutoff = new Date(Date.now() - LOCK_MINUTES * 60 * 1000);

  const expired = await prisma.task.findMany({
    where: {
      status: TASK_STATUS.ROUTED,
      routedContributorId: { not: null },
      routedAt: { lte: cutoff },
    },
    include: { routedContributor: true },
  });

  for (const task of expired) {
    await handleExpiredRoute(telegram, task).catch((err) => {
      console.error(`Reroute check failed for task #${task.id}:`, err);
    });
  }
}

async function handleExpiredRoute(telegram, task) {
  // Only excludes the immediately-previous suggestion, not every candidate
  // ever tried on this task - with a small registered pool the same person
  // could be re-suggested after a few reroutes. Acceptable simplification
  // for now; MAX_REROUTES caps how long this can drag on either way.
  const triedContributorIds = [task.routedContributorId].filter(Boolean);

  const openFully = task.rerouteCount >= MAX_REROUTES;
  const ranked = openFully ? [] : await rankCandidatesForTask(task, { excludeContributorIds: triedContributorIds });
  const next = ranked[0] ?? null;

  // Atomic guard: only proceeds if nobody claimed/changed it since we read it.
  const result = await prisma.task.updateMany({
    where: { id: task.id, status: TASK_STATUS.ROUTED, routedAt: task.routedAt },
    data: next
      ? {
          routedContributorId: next.contributor.id,
          matchScore: next.score,
          routedAt: new Date(),
          rerouteCount: { increment: 1 },
        }
      : { routedContributorId: null, matchScore: null, routedAt: null },
  });

  if (result.count === 0) return; // claimed or otherwise changed already - nothing to do

  await prisma.taskHistory.create({
    data: {
      taskId: task.id,
      fromStatus: TASK_STATUS.ROUTED,
      toStatus: TASK_STATUS.ROUTED,
      actorTelegramId: task.createdByTelegramId,
      note: next
        ? `Auto-rerouted after claim lock expired (previous: ${task.routedContributor?.displayName || task.routedContributorId})`
        : 'Opened to all registered contributors after claim lock expired and reroute attempts exhausted',
    },
  });

  const recipients = await getTaskManagerIds(task);
  const text = next
    ? `Task #${task.id} "${task.title}" was unclaimed after the reservation window - rerouted to ${next.contributor.displayName || next.contributor.telegramUsername} (score ${next.score}).`
    : `Task #${task.id} "${task.title}" was unclaimed after the reservation window and ran out of other candidates - now open to any registered contributor.`;
  await Promise.allSettled(recipients.map((id) => telegram.sendMessage(id, text).catch(() => {})));

  if (next) {
    await telegram
      .sendMessage(
        next.contributor.telegramUserId.toString(),
        `Task #${task.id} "${task.title}" has been routed to you (previous contributor didn't claim in time). Use /claim ${task.id} to accept it.`
      )
      .catch(() => {});
  }

  void previouslyTried; // reserved for future use (excluding all past attempts, not just the most recent)
}

export function startRouteScheduler(telegram) {
  const intervalMs = CHECK_INTERVAL_MINUTES * 60 * 1000;
  const timer = setInterval(() => {
    checkExpiredRoutes(telegram).catch((err) => console.error('Route scheduler tick failed:', err));
  }, intervalMs);
  timer.unref?.(); // don't keep the process alive solely for this timer
  return timer;
}
