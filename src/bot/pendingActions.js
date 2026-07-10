// In-memory per-user pending conversational state (resets on restart - fine
// for a short-lived flow like "send me your submission next" or a task
// wizard). Keyed by Telegram user ID, one pending action per user at a time.
const TTL_MS = 5 * 60 * 1000;
const pending = new Map(); // telegramUserId(string) -> { type, data, expiresAt }

export function setPending(telegramUserId, type, data = {}) {
  pending.set(String(telegramUserId), { type, data, expiresAt: Date.now() + TTL_MS });
}

export function peekPending(telegramUserId) {
  const key = String(telegramUserId);
  const entry = pending.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    pending.delete(key);
    return null;
  }
  return entry;
}

export function updatePending(telegramUserId, dataPatch) {
  const key = String(telegramUserId);
  const entry = pending.get(key);
  if (!entry) return null;
  entry.data = { ...entry.data, ...dataPatch };
  entry.expiresAt = Date.now() + TTL_MS;
  return entry;
}

export function clearPending(telegramUserId) {
  pending.delete(String(telegramUserId));
}
