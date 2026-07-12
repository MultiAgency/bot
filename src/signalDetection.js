import { prisma } from './db.js';
import { evaluateSignal } from './ai/graphs/signal.js';
import { TASK_STATUS } from './workflow.js';

const MIN_LENGTH = 15;
const MIN_WORDS = 3;
const SCORE_THRESHOLD = Number(process.env.SIGNAL_SCORE_THRESHOLD || 6);
const MAX_EVALUATIONS_PER_HOUR = Number(process.env.SIGNAL_MAX_PER_HOUR || 20);

// Cheap heuristics to skip obvious noise before spending an API call.
export function passesPreFilter(text) {
  if (!text || text.length < MIN_LENGTH) return false;
  if (text.split(/\s+/).filter(Boolean).length < MIN_WORDS) return false;
  return true;
}

// DB-backed per-room rate limit (counts Signal rows created in the last
// hour) - persists across restarts/redeploys, unlike an in-memory counter.
async function underRateLimit(roomId) {
  if (!roomId) return true; // no room to scope the limit to - let it through
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await prisma.signal.count({ where: { roomId, createdAt: { gte: oneHourAgo } } });
  return count < MAX_EVALUATIONS_PER_HOUR;
}

// Processes one chat message end to end: pre-filter -> rate limit -> Claude
// scoring -> persist Signal -> auto-create a DRAFT Task if the score clears
// the threshold. Returns the created task (or null) so the caller can notify
// admins; never throws (evaluation failures are logged and swallowed so one
// bad message can't take down the listener).
export async function processSignalMessage({ text, source, actorTelegramId, roomId }) {
  if (!passesPreFilter(text)) return null;
  if (!(await underRateLimit(roomId))) return null;

  let evaluation;
  try {
    evaluation = await evaluateSignal(text);
  } catch (err) {
    console.error('Signal evaluation failed:', err);
    return null;
  }

  if (!evaluation) return null;

  // SIGNAL_SCORE_THRESHOLD is a second, operator-tunable gate on top of the
  // model's own shouldDraft call, so admins can raise/lower sensitivity
  // without touching the prompt.
  const shouldDraft = evaluation.shouldDraft && evaluation.score >= SCORE_THRESHOLD;

  const signal = await prisma.signal.create({
    data: {
      source,
      summary: evaluation.reasoning || text.slice(0, 200),
      rawText: text,
      status: shouldDraft ? 'DRAFTED' : 'DISCARDED',
      createdByTelegramId: actorTelegramId,
      roomId: roomId ?? null,
    },
  });

  if (!shouldDraft || !evaluation.title || !evaluation.description) {
    return null;
  }

  const task = await prisma.task.create({
    data: {
      title: evaluation.title,
      description: evaluation.description,
      category: evaluation.category || null,
      requiredSkills: evaluation.skillTags || [],
      status: TASK_STATUS.DRAFT,
      createdByTelegramId: actorTelegramId,
      signalId: signal.id,
      roomId: roomId ?? null,
      history: {
        create: { toStatus: TASK_STATUS.DRAFT, actorTelegramId, note: `Auto-drafted from signal (score ${evaluation.score})` },
      },
    },
  });

  return task;
}
